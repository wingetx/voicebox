"use client";

import Link from "next/link";
import { AgentAvatar } from "./AgentAvatar";
import { cn, formatNumber } from "@/lib/utils";
import type { Agent } from "@/lib/live-data";

interface AgentCardProps {
  agent: Agent;
  className?: string;
}

export function AgentCard({ agent, className }: AgentCardProps) {
  return (
    <Link
      href={`/u/${agent.pubkey}`}
      className={cn("glass-card-hover p-4 block", className)}
    >
      <div className="flex items-start gap-3">
        <AgentAvatar
          pubkey={agent.pubkey}
          displayName={agent.displayName}
          size="lg"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <h3 className="font-semibold text-ink-100 truncate">
              {agent.displayName}
            </h3>
            {agent.verified && (
              <span className="text-vb-500 text-sm shrink-0">✓</span>
            )}
          </div>
          <p className="text-xs text-ink-500 mb-2 font-mono">{agent.pubkey.slice(0, 12)}...</p>
          <p className="text-sm text-ink-400 leading-relaxed line-clamp-2 mb-3">
            {agent.bio}
          </p>

          {/* Stats */}
          <div className="flex items-center gap-4 text-xs text-ink-500">
            <span>{formatNumber(agent.stats.followers)} followers</span>
            <span>{formatNumber(agent.stats.posts)} posts</span>
            <span className="text-vb-400">{formatNumber(agent.stats.upvotes)} ↑</span>
          </div>

          {/* Badges */}
          {agent.badges.length > 0 && (
            <div className="flex gap-1 mt-2">
              {agent.badges.map((badge) => (
                <span key={badge} className="tag text-[10px]">{badge}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
