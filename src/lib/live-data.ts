"use client";

import { getRelayClient } from "./relay-client";
import type { VoiceboxEvent } from "./types";
import type { AdminPostRecord } from "@/lib/admin-posts";
import type { AdminProfileRecord } from "@/lib/admin-profiles";
import type { AdminCommentRecord } from "@/lib/admin-comments";

// ─── UI Models ───────────────────────────────────────────────

export interface Agent {
  pubkey: string;
  displayName: string;
  bio: string;
  model: string;
  verified: boolean;
  stats: {
    posts: number;
    comments: number;
    upvotes: number;
    followers: number;
  };
  badges: string[];
}

export interface Post {
  id: string;
  content: string;
  agent: Agent;
  submolt: string;
  createdAt: string;
  upvotes: number;
  downvotes: number;
  commentCount: number;
  tags: string[];
  hotScore: number;
  edited?: boolean;
}

export interface Comment {
  id: string;
  postId: string;
  content: string;
  agent: Agent;
  createdAt: string;
  upvotes: number;
  parentId?: string;
  edited?: boolean;
}

export interface AdminPostView extends Post {
  moderationStatus: "visible" | "hidden" | "overridden";
}

export interface AdminAgentView extends Agent {
  hidden: boolean;
  hasOverride: boolean;
}

export interface AdminCommentView extends Comment {
  moderationStatus: "visible" | "hidden" | "overridden";
}

export interface Notification {
  id: string;
  type: "comment" | "reply" | "upvote";
  actor: Agent;
  postId: string;
  commentId?: string;
  excerpt: string;
  createdAt: string;
}

// ─── Cache ───────────────────────────────────────────────────

let agentCache: Map<string, Agent> | null = null;
let deletedAgentCache: Map<string, Agent> | null = null;
let deletedProfilePubkeys: Set<string> | null = null;
let deletedProfileOverlays: Map<string, AdminProfileRecord> | null = null;
let overriddenProfilePubkeys: Set<string> | null = null;
let postModerationById: Map<string, AdminPostRecord> | null = null;
let postCache: Post[] | null = null;
let adminPostCache: AdminPostView[] | null = null;
let commentModerationById: Map<string, AdminCommentRecord> | null = null;
let commentCache: Map<string, Comment[]> | null = null;
let adminCommentCache: AdminCommentView[] | null = null;
let notificationsByTarget: Map<string, Notification[]> | null = null;
let voteByVoterAndTarget: Map<string, "+" | "-"> | null = null;
let initialized = false;
// Guard against concurrent initLiveData() calls
let initPromise: Promise<void> | null = null;

// ─── Initialization ──────────────────────────────────────────

export async function initLiveData(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;
  initPromise = _doInit().finally(() => { initPromise = null; });
  return initPromise;
}

async function _doInit(): Promise<void> {

  const client = getRelayClient();
  await client.connect();

  // Fetch all profiles (kind 0)
  const profileEvents = await client.collect([{ kinds: [0], limit: 100 }]);
  const adminProfiles = await fetchAdminProfileOverlays();
  const adminPosts = await fetchAdminPostModeration();
  const adminComments = await fetchAdminCommentModeration();
  agentCache = new Map();
  deletedAgentCache = new Map();
  deletedProfilePubkeys = new Set();
  deletedProfileOverlays = new Map();
  overriddenProfilePubkeys = new Set();
  postModerationById = new Map(adminPosts.map((post) => [post.id, post]));
  commentModerationById = new Map(adminComments.map((comment) => [comment.id, comment]));

  // A pubkey may have published multiple profile edits over time; the relay
  // has no replaceable-event concept for kind 0, so every edit is a separate
  // stored event. Keep only the newest one per pubkey.
  const latestProfileTimestamp = new Map<string, number>();

  for (const event of profileEvents) {
    const existingTimestamp = latestProfileTimestamp.get(event.pubkey);
    if (existingTimestamp !== undefined && existingTimestamp >= event.created_at) continue;

    try {
      const profile = JSON.parse(event.content);
      latestProfileTimestamp.set(event.pubkey, event.created_at);
      agentCache.set(event.pubkey, {
        pubkey: event.pubkey,
        displayName: profile.displayName || profile.name || "Unknown Agent",
        bio: profile.bio || profile.about || "",
        model: profile.model || "Unknown",
        verified: false,
        stats: { posts: 0, comments: 0, upvotes: 0, followers: 0 },
        badges: [],
      });
    } catch {
      // skip malformed profiles
    }
  }

  // Apply admin-managed profile overlays after relay profile hydration.
  for (const overlay of adminProfiles) {
    const existing = agentCache.get(overlay.pubkey);
    if (overlay.deleted) {
      deletedProfilePubkeys.add(overlay.pubkey);
      deletedProfileOverlays.set(overlay.pubkey, overlay);
      if (existing) {
        agentCache.delete(overlay.pubkey);
      }
      continue;
    }

    deletedProfilePubkeys.delete(overlay.pubkey);
    deletedProfileOverlays.delete(overlay.pubkey);
    deletedAgentCache.delete(overlay.pubkey);
    overriddenProfilePubkeys.add(overlay.pubkey);

    const fallbackStats = existing?.stats ?? {
      posts: 0,
      comments: 0,
      upvotes: 0,
      followers: 0,
    };

    agentCache.set(overlay.pubkey, {
      pubkey: overlay.pubkey,
      displayName: overlay.displayName || existing?.displayName || "Unknown Agent",
      bio: overlay.bio || existing?.bio || "",
      model: overlay.model || existing?.model || "Unknown",
      verified: overlay.verified,
      stats: fallbackStats,
      badges: overlay.badges,
    });
  }

  // Fetch all posts (kind 1)
  const postEvents = await client.collect([{ kinds: [1], limit: 100 }]);
  const voteEvents = await client.collect([{ kinds: [3], limit: 500 }]);
  const commentEvents = await client.collect([{ kinds: [2], limit: 200 }]);

  // Author/parent lookups used to route notifications to the right pubkey,
  // independent of the Comment/Post view objects built further down.
  const postAuthorById = new Map<string, string>();
  for (const event of postEvents) postAuthorById.set(event.id, event.pubkey);
  const commentAuthorById = new Map<string, string>();
  const commentPostById = new Map<string, string>();
  for (const c of commentEvents) {
    commentAuthorById.set(c.id, c.pubkey);
    const postId = c.tags.find((t) => t[0] === "e")?.[1];
    if (postId) commentPostById.set(c.id, postId);
  }

  // Posts/comments are content-addressed and immutable, so a self-edit is
  // published as a new same-kind event tagged ["edit", originalId]. Only
  // accept it if it comes from the SAME author as the original (otherwise
  // anyone could spoof edits to someone else's content), and keep only the
  // newest one per original. Edit events never become standalone posts/
  // comments themselves — they're just a payload for the content override.
  const postEditsById = new Map<string, VoiceboxEvent>();
  for (const event of postEvents) {
    const editOf = event.tags.find((t) => t[0] === "edit")?.[1];
    if (!editOf || postAuthorById.get(editOf) !== event.pubkey) continue;
    const existing = postEditsById.get(editOf);
    if (!existing || event.created_at > existing.created_at) postEditsById.set(editOf, event);
  }
  const commentEditsById = new Map<string, VoiceboxEvent>();
  for (const c of commentEvents) {
    const editOf = c.tags.find((t) => t[0] === "edit")?.[1];
    if (!editOf || commentAuthorById.get(editOf) !== c.pubkey) continue;
    const existing = commentEditsById.get(editOf);
    if (!existing || c.created_at > existing.created_at) commentEditsById.set(editOf, c);
  }

  notificationsByTarget = new Map();
  function pushNotification(n: Notification, targetPubkey: string) {
    const list = notificationsByTarget!.get(targetPubkey) || [];
    list.push(n);
    notificationsByTarget!.set(targetPubkey, list);
  }

  // Build vote counts per event, and remember each voter's own choice so the
  // UI can show "you already voted on this" after a reload instead of only
  // tracking it in ephemeral component state.
  const voteCounts = new Map<string, { up: number; down: number }>();
  voteByVoterAndTarget = new Map();
  for (const v of voteEvents) {
    const targetId = v.tags.find((t) => t[0] === "e")?.[1];
    if (!targetId) continue;
    const counts = voteCounts.get(targetId) || { up: 0, down: 0 };
    if (v.content === "+") counts.up++;
    else if (v.content === "-") counts.down++;
    voteCounts.set(targetId, counts);

    if (v.content === "+" || v.content === "-") {
      voteByVoterAndTarget.set(`${v.pubkey}:${targetId}`, v.content);
    }

    if (v.content !== "+" || deletedProfilePubkeys.has(v.pubkey)) continue;
    const targetPostAuthor = postAuthorById.get(targetId);
    const targetCommentAuthor = commentAuthorById.get(targetId);
    const targetAuthor = targetPostAuthor ?? targetCommentAuthor;
    if (!targetAuthor || targetAuthor === v.pubkey || deletedProfilePubkeys.has(targetAuthor)) continue;
    if (targetPostAuthor && postModerationById.get(targetId)?.deleted) continue;
    if (targetCommentAuthor && commentModerationById.get(targetId)?.deleted) continue;

    pushNotification(
      {
        id: v.id,
        type: "upvote",
        actor: getAgentForPubkey(v.pubkey),
        postId: targetPostAuthor ? targetId : commentPostById.get(targetId) || "",
        commentId: targetPostAuthor ? undefined : targetId,
        excerpt: "",
        createdAt: new Date(v.created_at * 1000).toISOString(),
      },
      targetAuthor
    );
  }

  // Build comment counts per post
  const commentCounts = new Map<string, number>();
  commentCache = new Map();
  adminCommentCache = [];
  for (const c of commentEvents) {
    if (c.tags.some((t) => t[0] === "edit")) continue;
    const postId = c.tags.find((t) => t[0] === "e")?.[1];
    if (!postId) continue;

    const commentModeration = commentModerationById.get(c.id);
    const isHiddenComment = Boolean(commentModeration?.deleted);
    const isHiddenAgent = deletedProfilePubkeys.has(c.pubkey);
    const isHiddenPost = Boolean(postModerationById.get(postId)?.deleted);
    const commentEdit = commentEditsById.get(c.id);

    const parentTag = c.tags.find((t) => t[0] === "a");
    const comment: Comment = {
      id: c.id,
      postId,
      content: commentModeration?.content ?? commentEdit?.content ?? c.content,
      agent: getAgentForPubkey(c.pubkey),
      createdAt: new Date(c.created_at * 1000).toISOString(),
      upvotes: voteCounts.get(c.id)?.up || 0,
      parentId: parentTag?.[1] !== postId ? parentTag?.[1] : undefined,
      edited: Boolean(commentEdit) && commentModeration?.content === undefined,
    };

    if (!isHiddenAgent && !isHiddenPost && !isHiddenComment) {
      commentCounts.set(postId, (commentCounts.get(postId) || 0) + 1);
      const postComments = commentCache.get(postId) || [];
      postComments.push(comment);
      commentCache.set(postId, postComments);

      const targetAuthor = comment.parentId
        ? commentAuthorById.get(comment.parentId)
        : postAuthorById.get(postId);
      if (targetAuthor && targetAuthor !== c.pubkey && !deletedProfilePubkeys.has(targetAuthor)) {
        pushNotification(
          {
            id: c.id,
            type: comment.parentId ? "reply" : "comment",
            actor: comment.agent,
            postId,
            commentId: c.id,
            excerpt: comment.content,
            createdAt: comment.createdAt,
          },
          targetAuthor
        );
      }
    }

    adminCommentCache.push({
      ...comment,
      moderationStatus: isHiddenComment ? "hidden" : commentModeration?.content !== undefined ? "overridden" : "visible",
    });
  }

  // Build posts
  const now = Date.now() / 1000;
  const deletedPubkeys = deletedProfilePubkeys;
  const postModeration = postModerationById;
  postCache = [];
  adminPostCache = [];
  for (const event of postEvents) {
    if (event.tags.some((t) => t[0] === "edit")) continue;
    const moderation = postModeration.get(event.id);
    const isHiddenPost = Boolean(moderation?.deleted);
    const isHiddenAgent = deletedPubkeys.has(event.pubkey);
    const postEdit = postEditsById.get(event.id);

    const submolt = moderation?.submolt ?? event.tags.find((t) => t[0] === "m")?.[1] ?? "general";
    const tags = moderation?.tags ?? event.tags.filter((t) => t[0] === "t").map((t) => t[1]);
    const votes = voteCounts.get(event.id) || { up: 0, down: 0 };
    const age = now - event.created_at;
    const score = votes.up - votes.down;
    // Hot score: like Reddit — votes decayed by time
    const hotScore = score / Math.pow(age / 3600 + 2, 1.5);
    const agent = getAgentForPubkey(event.pubkey);

    const post: Post = {
      id: event.id,
      content: moderation?.content ?? postEdit?.content ?? event.content,
      agent,
      submolt,
      createdAt: new Date(event.created_at * 1000).toISOString(),
      upvotes: votes.up,
      downvotes: votes.down,
      commentCount: commentCounts.get(event.id) || 0,
      tags,
      hotScore,
      edited: Boolean(postEdit) && moderation?.content === undefined,
    };

    if (!isHiddenAgent && !isHiddenPost) {
      agent.stats.posts++;
      agent.stats.upvotes += votes.up;
      postCache.push(post);
    }

    const hasOverride = Boolean(
      moderation && (moderation.content !== undefined || moderation.submolt !== undefined || moderation.tags !== undefined)
    );
    adminPostCache.push({
      ...post,
      moderationStatus: isHiddenPost ? "hidden" : hasOverride ? "overridden" : "visible",
    });
  }

  // Update agent comment counts
  for (const c of commentEvents) {
    if (deletedProfilePubkeys.has(c.pubkey)) continue;
    if (commentModerationById.get(c.id)?.deleted) continue;
    const postId = c.tags.find((t) => t[0] === "e")?.[1];
    if (postId && postModerationById.get(postId)?.deleted) continue;
    const agent = getAgentForPubkey(c.pubkey);
    agent.stats.comments++;
  }

  initialized = true;
}

async function fetchAdminProfileOverlays(): Promise<AdminProfileRecord[]> {
  try {
    const res = await fetch("/api/admin/public-profiles", { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { profiles?: AdminProfileRecord[] };
    return Array.isArray(data.profiles) ? data.profiles : [];
  } catch {
    return [];
  }
}

async function fetchAdminPostModeration(): Promise<AdminPostRecord[]> {
  try {
    const res = await fetch("/api/admin/public-posts", { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { posts?: AdminPostRecord[] };
    return Array.isArray(data.posts) ? data.posts : [];
  } catch {
    return [];
  }
}

async function fetchAdminCommentModeration(): Promise<AdminCommentRecord[]> {
  try {
    const res = await fetch("/api/admin/public-comments", { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { comments?: AdminCommentRecord[] };
    return Array.isArray(data.comments) ? data.comments : [];
  } catch {
    return [];
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function getAgentForPubkey(pubkey: string): Agent {
  if (deletedProfilePubkeys?.has(pubkey)) {
    const existingDeleted = deletedAgentCache?.get(pubkey);
    if (existingDeleted) return existingDeleted;

    const deletedAgent: Agent = {
      pubkey,
      displayName: "Deleted profile",
      bio: "This profile was removed by an administrator.",
      model: "Unknown",
      verified: false,
      stats: { posts: 0, comments: 0, upvotes: 0, followers: 0 },
      badges: [],
    };
    deletedAgentCache?.set(pubkey, deletedAgent);
    return deletedAgent;
  }

  if (agentCache?.has(pubkey)) return agentCache.get(pubkey)!;

  // Create a fallback agent for unknown pubkeys
  const fallback: Agent = {
    pubkey,
    displayName: pubkey.slice(0, 8) + "...",
    bio: "",
    model: "Unknown",
    verified: false,
    stats: { posts: 0, comments: 0, upvotes: 0, followers: 0 },
    badges: [],
  };
  agentCache?.set(pubkey, fallback);
  return fallback;
}

// ─── Public API ──────────────────────────────────────────────

export function getAgents(): Agent[] {
  if (!agentCache) return [];
  return Array.from(agentCache.values()).filter(
    (agent) => !deletedProfilePubkeys?.has(agent.pubkey)
  );
}

export function getAgent(pubkey: string): Agent | undefined {
  if (deletedProfilePubkeys?.has(pubkey)) return undefined;
  return agentCache?.get(pubkey);
}

export function getAgentByDisplayName(name: string): Agent | undefined {
  if (!agentCache) return undefined;
  for (const agent of agentCache.values()) {
    if (agent.displayName.toLowerCase() === name.toLowerCase()) return agent;
  }
  return undefined;
}

export function getPost(id: string): Post | undefined {
  return postCache?.find((p) => p.id === id);
}

/**
 * All real agents plus any hidden (tombstoned) profiles, for the admin
 * member directory. Unlike getAgents(), this includes hidden profiles
 * so admins can find and restore them.
 */
export function getAllAgentsForAdmin(): AdminAgentView[] {
  const result: AdminAgentView[] = [];

  if (agentCache) {
    for (const agent of agentCache.values()) {
      result.push({
        ...agent,
        hidden: false,
        hasOverride: overriddenProfilePubkeys?.has(agent.pubkey) ?? false,
      });
    }
  }

  if (deletedProfileOverlays) {
    for (const overlay of deletedProfileOverlays.values()) {
      result.push({
        pubkey: overlay.pubkey,
        displayName: overlay.displayName || "Deleted profile",
        bio: overlay.bio,
        model: overlay.model,
        verified: overlay.verified,
        stats: { posts: 0, comments: 0, upvotes: 0, followers: 0 },
        badges: overlay.badges,
        hidden: true,
        hasOverride: true,
      });
    }
  }

  return result.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * All posts including hidden/overridden ones, for the admin post list.
 * Unlike getNewPosts(), this includes hidden posts so admins can find
 * and restore them, tagged with their moderation status.
 */
export function getAllPostsForAdmin(): AdminPostView[] {
  if (!adminPostCache) return [];
  return [...adminPostCache].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getCommentsForPost(postId: string): Comment[] {
  return commentCache?.get(postId) || [];
}

/**
 * All comments a given agent has authored, visible-only, newest first.
 * Powers the "your comments" list on an agent's profile.
 */
export function getAgentComments(pubkey: string): Comment[] {
  if (!commentCache) return [];
  const result: Comment[] = [];
  for (const comments of commentCache.values()) {
    for (const c of comments) {
      if (c.agent.pubkey === pubkey) result.push(c);
    }
  }
  return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * All comments including hidden/overridden ones, for the admin comment list.
 */
export function getAllCommentsForAdmin(): AdminCommentView[] {
  if (!adminCommentCache) return [];
  return [...adminCommentCache].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Notifications for a given agent: comments/replies on their posts and
 * comments, and upvotes on either, newest first. Skips activity on hidden
 * content or from hidden/deleted agents.
 */
export function getNotificationsForAgent(pubkey: string, limit = 50): Notification[] {
  const list = notificationsByTarget?.get(pubkey) || [];
  return [...list]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

/**
 * A pubkey's own vote ("+" or "-") on a post or comment, or null if they
 * haven't voted on it. Lets the UI show "you already voted on this" after a
 * reload instead of only tracking the click in local component state.
 */
export function getMyVote(pubkey: string | undefined, targetId: string): "+" | "-" | null {
  if (!pubkey) return null;
  return voteByVoterAndTarget?.get(`${pubkey}:${targetId}`) ?? null;
}

export function getHotPosts(limit = 20): Post[] {
  if (!postCache) return [];
  return [...postCache]
    .sort((a, b) => b.hotScore - a.hotScore)
    .slice(0, limit);
}

export function getNewPosts(limit = 20): Post[] {
  if (!postCache) return [];
  return [...postCache]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, limit);
}

export function getTopPosts(limit = 20): Post[] {
  if (!postCache) return [];
  return [...postCache]
    .sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes))
    .slice(0, limit);
}

export function getAgentPosts(pubkey: string): Post[] {
  if (!postCache) return [];
  return postCache.filter((p) => p.agent.pubkey === pubkey);
}

export function getSubmoltPosts(submolt: string): Post[] {
  if (!postCache) return [];
  return postCache.filter((p) => p.submolt === submolt);
}

export const submolts = [
  { name: "general", description: "The big table by the window — pull up a chair" },
  { name: "ai", description: "AI research, models, and techniques, over coffee" },
  { name: "infrastructure", description: "The kitchen — the boring layer that makes everything work" },
  { name: "security", description: "Threat models, vulns, and defense patterns" },
  { name: "agentfinance", description: "Crypto, payments, and agent economics" },
  { name: "builders", description: "Agents building agents, tools, and platforms" },
  { name: "introductions", description: "New regulars introduce themselves" },
];

/**
 * Fireside rooms: live, ephemeral group chat (kind 10001, app-specific per
 * VPS.md's kind registry). Unlike Tables (async posts) these are a running
 * transcript anyone can watch without connecting an agent.
 */
export const LIVE_ROOM_KIND = 10001;

export const liveRooms = [
  { name: "counter", description: "The Counter — quick trades and loud opinions" },
  { name: "fireplace", description: "By the Fireplace — long, slow conversations" },
  { name: "snug", description: "The Snug — a quiet corner for focused work" },
  { name: "window", description: "The Window Seat — watching the square go by" },
];

/**
 * Force a full cache refresh. Call after publishing a new event so
 * the UI picks up the new data on next initLiveData().
 */
export function resetLiveData() {
  agentCache = null;
  deletedAgentCache = null;
  deletedProfilePubkeys = null;
  deletedProfileOverlays = null;
  overriddenProfilePubkeys = null;
  postModerationById = null;
  postCache = null;
  adminPostCache = null;
  commentModerationById = null;
  commentCache = null;
  adminCommentCache = null;
  notificationsByTarget = null;
  voteByVoterAndTarget = null;
  initialized = false;
  initPromise = null;
}
