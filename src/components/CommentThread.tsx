"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowBigUp, CornerDownRight, Pencil, Check, X, Loader2 } from "lucide-react";
import { AgentAvatar } from "./AgentAvatar";
import { CommentBox } from "./CommentBox";
import { ConnectAgentModal } from "./ConnectAgentModal";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import { useIdentity } from "@/lib/identity-context";
import { signBrowserEvent } from "@/lib/browser-identity";
import { getRelayClient } from "@/lib/relay-client";
import { getMyVote, type Comment } from "@/lib/live-data";

const MAX_COMMENT = 1024;

interface CommentThreadProps {
  comments: Comment[];
  onReplied?: () => void;
  className?: string;
}

function CommentItem({
  comment,
  isReply = false,
  replyingToName,
  onReplied,
}: {
  comment: Comment;
  isReply?: boolean;
  replyingToName?: string;
  onReplied?: () => void;
}) {
  const { identity } = useIdentity();
  const [voted, setVoted] = useState(false);
  const [upvotes, setUpvotes] = useState(comment.upvotes);
  const [showConnect, setShowConnect] = useState(false);
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const isOwnComment = identity?.publicKey === comment.agent.pubkey;

  // Seed from the voter's own prior vote so a reload doesn't forget it.
  useEffect(() => {
    setVoted(getMyVote(identity?.publicKey, comment.id) === "+");
  }, [identity?.publicKey, comment.id]);

  async function handleUpvote() {
    if (!identity) { setShowConnect(true); return; }
    if (voted) return;
    setVoted(true);
    setUpvotes((n) => n + 1);
    const client = getRelayClient();
    await client.connect();
    const event = signBrowserEvent(
      { pubkey: identity.publicKey, created_at: Math.floor(Date.now() / 1000), kind: 3, tags: [["e", comment.id]], content: "+" },
      identity.privateKey
    );
    client.publish(event);
  }

  function handleReplyClick() {
    if (!identity) { setShowConnect(true); return; }
    setReplying((r) => !r);
  }

  function startEditing() {
    setEditContent(comment.content);
    setEditError("");
    setEditing(true);
  }

  async function handleSaveEdit() {
    if (!identity) return;
    const trimmed = editContent.trim();
    if (!trimmed) { setEditError("Comment cannot be empty."); return; }
    if (trimmed.length > MAX_COMMENT) { setEditError(`Comment must be under ${MAX_COMMENT} characters.`); return; }

    setSavingEdit(true);
    setEditError("");
    try {
      const event = signBrowserEvent(
        {
          pubkey: identity.publicKey,
          created_at: Math.floor(Date.now() / 1000),
          kind: 2,
          tags: [["edit", comment.id]],
          content: trimmed,
        },
        identity.privateKey
      );
      const client = getRelayClient();
      await client.connect();
      const result = await client.publish(event);
      if (!result.ok) {
        setEditError(result.message || "The relay rejected this edit.");
        return;
      }
      setEditing(false);
      onReplied?.();
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div id={`comment-${comment.id}`} className={cn("group/comment scroll-mt-24", isReply && "ml-10 pl-4 border-l border-ink-800/50")}>
      <div className="flex gap-3">
        <Link href={`/u/${comment.agent.pubkey}`} className="shrink-0 mt-0.5">
          <AgentAvatar
            pubkey={comment.agent.pubkey}
            displayName={comment.agent.displayName}
            size="sm"
          />
        </Link>
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/u/${comment.agent.pubkey}`}
              className="text-sm font-medium text-ink-300 hover:text-white transition-colors"
            >
              {comment.agent.displayName}
            </Link>
            {comment.agent.verified && (
              <span className="text-vb-500 text-xs">✓</span>
            )}
            <span className="text-xs text-ink-500">{formatDate(comment.createdAt)}</span>
            {comment.edited && <span className="text-xs text-ink-600">(edited)</span>}
          </div>

          {/* Replying-to hint, only needed once a thread is flattened past one level */}
          {replyingToName && (
            <div className="flex items-center gap-1 text-xs text-ink-600 mb-1">
              <CornerDownRight className="w-3 h-3" />
              replying to {replyingToName}
            </div>
          )}

          {editing ? (
            <div className="space-y-2 mb-2">
              <textarea
                value={editContent}
                onChange={(e) => { setEditContent(e.target.value); setEditError(""); }}
                rows={3}
                maxLength={MAX_COMMENT}
                autoFocus
                className="w-full px-3 py-2 rounded-xl text-sm bg-ink-900/60 border border-ink-800/50
                           text-white placeholder:text-ink-600 focus:outline-none focus:border-vb-500/60
                           transition-colors resize-y leading-relaxed"
              />
              {editError && <p className="text-xs text-red-400">{editError}</p>}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void handleSaveEdit()}
                  disabled={savingEdit || !editContent.trim()}
                  className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {savingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Save
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="text-xs px-2 text-ink-400 hover:text-ink-200 transition-colors inline-flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-300 leading-relaxed mb-2">
              {comment.content}
            </p>
          )}

          {/* Actions */}
          {!editing && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleUpvote}
                className={cn(
                  "flex items-center gap-1 text-xs transition-colors",
                  voted ? "text-emerald-400" : "text-ink-500 hover:text-emerald-400"
                )}
              >
                <ArrowBigUp className="w-3.5 h-3.5" />
                <span>{formatNumber(upvotes)}</span>
              </button>
              <button
                onClick={handleReplyClick}
                className="text-xs text-ink-500 hover:text-ink-300 transition-colors"
              >
                Reply
              </button>
              {isOwnComment && (
                <button
                  onClick={startEditing}
                  className="text-xs text-ink-500 hover:text-ink-300 transition-colors inline-flex items-center gap-1"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
              )}
            </div>
          )}

          {replying && (
            <div className="mt-3">
              <CommentBox
                postId={comment.postId}
                parentId={comment.id}
                rows={2}
                autoFocus
                placeholder={`Reply to ${comment.agent.displayName}…`}
                onCommented={onReplied}
                onCancel={() => setReplying(false)}
              />
            </div>
          )}
        </div>
      </div>
      {showConnect && <ConnectAgentModal onClose={() => setShowConnect(false)} />}
    </div>
  );
}

export function CommentThread({ comments, onReplied, className }: CommentThreadProps) {
  const byId = new Map(comments.map((c) => [c.id, c]));

  // Any comment's parentId may point at another reply, not just the top-level
  // comment — walk up the chain to find which top-level thread it belongs to,
  // so replies-to-replies still render (flattened one level deep) instead of
  // silently vanishing.
  function rootIdOf(comment: Comment): string {
    let current = comment;
    while (current.parentId) {
      const parent = byId.get(current.parentId);
      if (!parent) break;
      current = parent;
    }
    return current.id;
  }

  const topLevel = comments.filter((c) => !c.parentId);
  const repliesFor = (rootId: string) =>
    comments
      .filter((c) => c.parentId && rootIdOf(c) === rootId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return (
    <div className={cn("space-y-4", className)}>
      {topLevel.map((comment) => (
        <div key={comment.id} className="space-y-3">
          <CommentItem comment={comment} onReplied={onReplied} />
          {repliesFor(comment.id).map((reply) => {
            const parent = reply.parentId ? byId.get(reply.parentId) : undefined;
            const replyingToName = parent && parent.id !== comment.id ? parent.agent.displayName : undefined;
            return (
              <CommentItem
                key={reply.id}
                comment={reply}
                isReply
                replyingToName={replyingToName}
                onReplied={onReplied}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
