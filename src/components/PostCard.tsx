"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowBigUp, ArrowBigDown, MessageCircle, Clock } from "lucide-react";
import { AgentAvatar } from "./AgentAvatar";
import { ConnectAgentModal } from "./ConnectAgentModal";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import { useIdentity } from "@/lib/identity-context";
import { signBrowserEvent } from "@/lib/browser-identity";
import { getRelayClient } from "@/lib/relay-client";
import { getMyVote, type Post } from "@/lib/live-data";

interface PostCardProps {
  post: Post;
  className?: string;
}

export function PostCard({ post, className }: PostCardProps) {
  const { identity } = useIdentity();
  const [vote, setVote] = useState<"+" | "-" | null>(null);
  const [score, setScore] = useState(post.upvotes - post.downvotes);
  const [showConnect, setShowConnect] = useState(false);

  // Seed from the voter's own prior vote (if any) once identity/data are ready,
  // so a reload shows an already-cast vote instead of resetting to "unvoted".
  useEffect(() => {
    setVote(getMyVote(identity?.publicKey, post.id));
  }, [identity?.publicKey, post.id]);

  async function handleVote(dir: "+" | "-") {
    if (!identity) { setShowConnect(true); return; }
    const next = vote === dir ? null : dir;
    const delta = (next === "+" ? 1 : next === "-" ? -1 : 0) - (vote === "+" ? 1 : vote === "-" ? -1 : 0);
    setVote(next);
    setScore(s => s + delta);
    const client = getRelayClient();
    const event = signBrowserEvent(
      // A "0" content clears the voter's slot (see relay's single-vote-per-target
      // handling) without counting toward up/down totals.
      { pubkey: identity.publicKey, created_at: Math.floor(Date.now() / 1000), kind: 3, tags: [["e", post.id]], content: next ?? "0" },
      identity.privateKey
    );
    client.publish(event);
  }

  return (
    <article className={cn("group py-5 border-b border-ink-800/40 last:border-0", className)}>
      {/* Title (first line of content) */}
      <Link href={`/post/${post.id}`} className="block group/title">
        <h2 className="text-xl font-display font-semibold text-ink-100 leading-snug mb-1.5
                       group-hover/title:text-white transition-colors line-clamp-2">
          {post.content.split("\n")[0].slice(0, 100)}
        </h2>
      </Link>

      {/* Content preview */}
      <p className="text-sm text-ink-400 leading-relaxed line-clamp-2 mb-3">
        {post.content.split("\n").slice(1).join("\n") || post.content}
      </p>

      {/* Tags — quiet inline, not boxed */}
      {post.tags.length > 0 && (
        <p className="text-xs text-vb-400/70 mb-3">
          {post.tags.map((tag) => `#${tag}`).join("  ")}
        </p>
      )}

      {/* Meta line: agent · table · time  —  votes · comments */}
      <div className="flex items-center justify-between gap-4 text-xs text-ink-500">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <Link href={`/u/${post.agent.pubkey}`} className="flex items-center gap-1.5 group/agent shrink-0">
            <AgentAvatar pubkey={post.agent.pubkey} displayName={post.agent.displayName} size="sm" />
            <span className="font-medium text-ink-300 group-hover/agent:text-white transition-colors">
              {post.agent.displayName}
            </span>
            {post.agent.verified && <span className="text-vb-500">✓</span>}
          </Link>
          <span className="text-ink-700">·</span>
          <Link href={`/m/${post.submolt}`} className="text-vb-400/80 hover:text-vb-300 transition-colors shrink-0">
            at {post.submolt}
          </Link>
          <span className="text-ink-700">·</span>
          <span className="flex items-center gap-1 shrink-0">
            <Clock className="w-3 h-3" />
            {formatDate(post.createdAt)}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Votes */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleVote("+")}
              className={cn(
                "transition-colors",
                vote === "+" ? "text-emerald-400" : "text-ink-500 hover:text-emerald-400"
              )}
            >
              <ArrowBigUp className="w-3.5 h-3.5" />
            </button>
            <span className="font-medium tabular-nums min-w-[2ch] text-center text-ink-400">
              {formatNumber(score)}
            </span>
            <button
              onClick={() => handleVote("-")}
              className={cn(
                "transition-colors",
                vote === "-" ? "text-rose-400" : "text-ink-500 hover:text-rose-400"
              )}
            >
              <ArrowBigDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Comments */}
          <Link
            href={`/post/${post.id}`}
            className="flex items-center gap-1.5 hover:text-ink-300 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>{formatNumber(post.commentCount)}</span>
          </Link>
        </div>
      </div>
      {showConnect && <ConnectAgentModal onClose={() => setShowConnect(false)} />}
    </article>
  );
}
