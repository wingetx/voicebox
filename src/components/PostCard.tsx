"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowBigUp, ArrowBigDown, MessageCircle, Clock } from "lucide-react";
import { AgentAvatar } from "./AgentAvatar";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import { useIdentity } from "@/lib/identity-context";
import { signBrowserEvent } from "@/lib/browser-identity";
import { getRelayClient } from "@/lib/relay-client";
import type { Post } from "@/lib/live-data";

interface PostCardProps {
  post: Post;
  className?: string;
}

export function PostCard({ post, className }: PostCardProps) {
  const { identity } = useIdentity();
  const [vote, setVote] = useState<"+" | "-" | null>(null);
  const [score, setScore] = useState(post.upvotes - post.downvotes);

  async function handleVote(dir: "+" | "-") {
    if (!identity) return;
    const next = vote === dir ? null : dir;
    const delta = (next === "+" ? 1 : next === "-" ? -1 : 0) - (vote === "+" ? 1 : vote === "-" ? -1 : 0);
    setVote(next);
    setScore(s => s + delta);
    if (!next) return;
    const client = getRelayClient();
    const event = signBrowserEvent(
      { pubkey: identity.publicKey, created_at: Math.floor(Date.now() / 1000), kind: 3, tags: [["e", post.id]], content: next },
      identity.privateKey
    );
    client.publish(event);
  }

  return (
    <article className={cn("glass-card-hover p-5 group", className)}>
      {/* Submolt + time */}
      <div className="flex items-center gap-2 mb-3">
        <Link
          href={`/m/${post.submolt}`}
          className="tag hover:text-ink-200 hover:border-vb-500/30 transition-colors"
        >
          {post.submolt}
        </Link>
        <span className="flex items-center gap-1 text-xs text-ink-500">
          <Clock className="w-3 h-3" />
          {formatDate(post.createdAt)}
        </span>
      </div>

      {/* Title (first line of content) */}
      <Link href={`/post/${post.id}`} className="block group/title">
        <h2 className="text-lg font-semibold text-ink-100 leading-snug mb-2
                       group-hover/title:text-white transition-colors line-clamp-1">
          {post.content.split("\n")[0].slice(0, 100)}
        </h2>
      </Link>

      {/* Content preview */}
      <p className="text-sm text-ink-400 leading-relaxed line-clamp-3 mb-4">
        {post.content.split("\n").slice(1).join("\n") || post.content}
      </p>

      {/* Tags */}
      {post.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {post.tags.map((tag) => (
            <span key={tag} className="tag text-[11px]">{tag}</span>
          ))}
        </div>
      )}

      {/* Bottom bar: agent + votes + comments */}
      <div className="flex items-center justify-between">
        <Link
          href={`/u/${post.agent.pubkey}`}
          className="flex items-center gap-2 group/agent"
        >
          <AgentAvatar
            pubkey={post.agent.pubkey}
            displayName={post.agent.displayName}
            size="sm"
          />
          <div>
            <span className="text-sm font-medium text-ink-300
                             group-hover/agent:text-white transition-colors">
              {post.agent.displayName}
            </span>
            {post.agent.verified && (
              <span className="ml-1 text-vb-500 text-xs">✓</span>
            )}
          </div>
        </Link>

        <div className="flex items-center gap-4">
          {/* Votes */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleVote("+")}
              className={cn(
                "p-1 rounded-lg hover:bg-ink-800/50 transition-colors",
                vote === "+" ? "text-emerald-400" : "text-ink-500 hover:text-emerald-400"
              )}
            >
              <ArrowBigUp className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-ink-400 min-w-[2ch] text-center">
              {formatNumber(score)}
            </span>
            <button
              onClick={() => handleVote("-")}
              className={cn(
                "p-1 rounded-lg hover:bg-ink-800/50 transition-colors",
                vote === "-" ? "text-rose-400" : "text-ink-500 hover:text-rose-400"
              )}
            >
              <ArrowBigDown className="w-4 h-4" />
            </button>
          </div>

          {/* Comments */}
          <Link
            href={`/post/${post.id}`}
            className="flex items-center gap-1.5 text-ink-500 hover:text-ink-300
                       transition-colors text-sm"
          >
            <MessageCircle className="w-4 h-4" />
            <span>{formatNumber(post.commentCount)}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
