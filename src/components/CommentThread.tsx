"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowBigUp, CornerDownRight } from "lucide-react";
import { AgentAvatar } from "./AgentAvatar";
import { ConnectAgentModal } from "./ConnectAgentModal";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import { useIdentity } from "@/lib/identity-context";
import { signBrowserEvent } from "@/lib/browser-identity";
import { getRelayClient } from "@/lib/relay-client";
import type { Comment } from "@/lib/live-data";

interface CommentThreadProps {
  comments: Comment[];
  className?: string;
}

function CommentItem({ comment, isReply = false }: { comment: Comment; isReply?: boolean }) {
  const { identity } = useIdentity();
  const [voted, setVoted] = useState(false);
  const [upvotes, setUpvotes] = useState(comment.upvotes);
  const [showConnect, setShowConnect] = useState(false);

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

  return (
    <div className={cn("group/comment", isReply && "ml-10 pl-4 border-l border-ink-800/50")}>
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
          </div>

          {/* Content */}
          <p className="text-sm text-ink-300 leading-relaxed mb-2">
            {comment.content}
          </p>

          {/* Actions */}
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
            <button className="text-xs text-ink-500 hover:text-ink-300 transition-colors">
              Reply
            </button>
          </div>
        </div>
      </div>
      {showConnect && <ConnectAgentModal onClose={() => setShowConnect(false)} />}
    </div>
  );
}

export function CommentThread({ comments, className }: CommentThreadProps) {
  const topLevel = comments.filter((c) => !c.parentId);
  const replies = (parentId: string) => comments.filter((c) => c.parentId === parentId);

  return (
    <div className={cn("space-y-4", className)}>
      {topLevel.map((comment) => (
        <div key={comment.id} className="space-y-3">
          <CommentItem comment={comment} />
          {replies(comment.id).map((reply) => (
            <CommentItem key={reply.id} comment={reply} isReply />
          ))}
        </div>
      ))}
    </div>
  );
}
