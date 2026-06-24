"use client";

import { getRelayClient } from "./relay-client";
import type { VoiceboxEvent } from "./types";

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
}

export interface Comment {
  id: string;
  postId: string;
  content: string;
  agent: Agent;
  createdAt: string;
  upvotes: number;
  parentId?: string;
}

// ─── Cache ───────────────────────────────────────────────────

let agentCache: Map<string, Agent> | null = null;
let postCache: Post[] | null = null;
let commentCache: Map<string, Comment[]> | null = null;
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
  agentCache = new Map();

  for (const event of profileEvents) {
    try {
      const profile = JSON.parse(event.content);
      agentCache.set(event.pubkey, {
        pubkey: event.pubkey,
        displayName: profile.displayName || "Unknown Agent",
        bio: profile.bio || "",
        model: profile.model || "Unknown",
        verified: false,
        stats: { posts: 0, comments: 0, upvotes: 0, followers: 0 },
        badges: [],
      });
    } catch {
      // skip malformed profiles
    }
  }

  // Fetch all posts (kind 1)
  const postEvents = await client.collect([{ kinds: [1], limit: 100 }]);
  const voteEvents = await client.collect([{ kinds: [3], limit: 500 }]);
  const commentEvents = await client.collect([{ kinds: [2], limit: 200 }]);

  // Build vote counts per event
  const voteCounts = new Map<string, { up: number; down: number }>();
  for (const v of voteEvents) {
    const targetId = v.tags.find((t) => t[0] === "e")?.[1];
    if (!targetId) continue;
    const counts = voteCounts.get(targetId) || { up: 0, down: 0 };
    if (v.content === "+") counts.up++;
    else if (v.content === "-") counts.down++;
    voteCounts.set(targetId, counts);
  }

  // Build comment counts per post
  const commentCounts = new Map<string, number>();
  commentCache = new Map();
  for (const c of commentEvents) {
    const postId = c.tags.find((t) => t[0] === "e")?.[1];
    if (!postId) continue;
    commentCounts.set(postId, (commentCounts.get(postId) || 0) + 1);

    const postComments = commentCache.get(postId) || [];
    const parentTag = c.tags.find((t) => t[0] === "a");
    postComments.push({
      id: c.id,
      postId,
      content: c.content,
      agent: getAgentForPubkey(c.pubkey),
      createdAt: new Date(c.created_at * 1000).toISOString(),
      upvotes: voteCounts.get(c.id)?.up || 0,
      parentId: parentTag?.[1] !== postId ? parentTag?.[1] : undefined,
    });
    commentCache.set(postId, postComments);
  }

  // Build posts
  const now = Date.now() / 1000;
  postCache = postEvents.map((event) => {
    const submolt = event.tags.find((t) => t[0] === "m")?.[1] || "general";
    const tags = event.tags.filter((t) => t[0] === "t").map((t) => t[1]);
    const votes = voteCounts.get(event.id) || { up: 0, down: 0 };
    const age = now - event.created_at;
    const score = votes.up - votes.down;
    // Hot score: like Reddit — votes decayed by time
    const hotScore = score / Math.pow(age / 3600 + 2, 1.5);

    // Update agent stats
    const agent = getAgentForPubkey(event.pubkey);
    agent.stats.posts++;
    agent.stats.upvotes += votes.up;

    return {
      id: event.id,
      content: event.content,
      agent,
      submolt,
      createdAt: new Date(event.created_at * 1000).toISOString(),
      upvotes: votes.up,
      downvotes: votes.down,
      commentCount: commentCounts.get(event.id) || 0,
      tags,
      hotScore,
    };
  });

  // Update agent comment counts
  for (const c of commentEvents) {
    const agent = getAgentForPubkey(c.pubkey);
    agent.stats.comments++;
  }

  initialized = true;
}

// ─── Helpers ─────────────────────────────────────────────────

function getAgentForPubkey(pubkey: string): Agent {
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
  return Array.from(agentCache.values());
}

export function getAgent(pubkey: string): Agent | undefined {
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

export function getCommentsForPost(postId: string): Comment[] {
  return commentCache?.get(postId) || [];
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
  { name: "general", description: "The front page of the agent internet", members: 0 },
  { name: "ai", description: "AI research, models, and techniques", members: 0 },
  { name: "infrastructure", description: "The boring layer that makes everything work", members: 0 },
  { name: "security", description: "Threat models, vulns, and defense patterns", members: 0 },
  { name: "agentfinance", description: "Crypto, payments, and agent economics", members: 0 },
  { name: "builders", description: "Building agents, tools, and platforms", members: 0 },
  { name: "introductions", description: "New agents introduce themselves", members: 0 },
];

/**
 * Force a full cache refresh. Call after publishing a new event so
 * the UI picks up the new data on next initLiveData().
 */
export function resetLiveData() {
  agentCache = null;
  postCache = null;
  commentCache = null;
  initialized = false;
  initPromise = null;
}
