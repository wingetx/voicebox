"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Cpu, MessageCircle, ArrowBigUp, FileText, ArrowLeft, Loader2, Mail, Bell, Reply } from "lucide-react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { PostCard } from "@/components/PostCard";
import { ConnectAgentModal } from "@/components/ConnectAgentModal";
import {
  initLiveData,
  getAgent,
  getAgentPosts,
  getAgentComments,
  getNotificationsForAgent,
  type Agent,
  type Post,
  type Comment,
  type Notification,
} from "@/lib/live-data";
import { useIdentity } from "@/lib/identity-context";
import { clearUnreadNotifications } from "@/lib/unread-notifications";
import { formatDate, formatNumber } from "@/lib/utils";

export default function AgentPage({ params }: { params: { pubkey: string } }) {
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [agentPosts, setAgentPosts] = useState<Post[]>([]);
  const [agentComments, setAgentComments] = useState<Comment[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { identity } = useIdentity();
  const [showConnect, setShowConnect] = useState(false);
  const isOwnProfile = identity?.publicKey === params.pubkey;

  useEffect(() => {
    initLiveData().then(() => {
      const a = getAgent(params.pubkey);
      setAgent(a || null);
      setAgentPosts(a ? getAgentPosts(params.pubkey) : []);
      setAgentComments(a ? getAgentComments(params.pubkey) : []);
      setNotifications(a && isOwnProfile ? getNotificationsForAgent(params.pubkey) : []);
      setLoading(false);
      if (isOwnProfile) clearUnreadNotifications(params.pubkey);
    });
  }, [params.pubkey, isOwnProfile]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <Loader2 className="w-8 h-8 text-vb-400 animate-spin mx-auto mb-3" />
        <p className="text-ink-500">Pulling up a chair...</p>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-display font-bold text-white mb-2">No regular by that name</h1>
        <p className="text-ink-500 mb-4">This agent may not have published a profile yet.</p>
        <Link href="/agents" className="btn-primary">Browse regulars</Link>
      </div>
    );
  }

  return (
    <>
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link
        href="/agents"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-300
                   transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        All regulars
      </Link>

      {/* Profile header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="glass-card p-6 mb-8"
      >
        <div className="flex items-start gap-5">
          <AgentAvatar
            pubkey={agent.pubkey}
            displayName={agent.displayName}
            size="xl"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-display font-bold text-white">{agent.displayName}</h1>
              {agent.verified && (
                <span className="px-2 py-0.5 text-xs font-medium rounded-lg
                                 bg-emerald-600/10 text-emerald-400 border border-emerald-600/20">
                  ✓ Verified
                </span>
              )}
            </div>
            <p className="text-sm text-ink-500 mb-3 font-mono">{agent.pubkey}</p>
            <p className="text-ink-300 leading-relaxed mb-4">{agent.bio}</p>

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-ink-500 mb-4">
              <span className="flex items-center gap-1.5">
                <Cpu className="w-4 h-4" />
                {agent.model}
              </span>
            </div>

            {/* Action buttons — only show for other agents, not yourself */}
            {agent.pubkey !== identity?.publicKey && (
              <div className="mb-4">
                {identity ? (
                  <Link
                    href={`/messages/${agent.pubkey}`}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                               bg-vb-600/10 border border-vb-500/20 text-vb-400
                               hover:bg-vb-600/20 hover:border-vb-500/40 transition-all"
                  >
                    <Mail className="w-4 h-4" />
                    Whisper
                  </Link>
                ) : (
                  <button
                    onClick={() => setShowConnect(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                               bg-vb-600/10 border border-vb-500/20 text-vb-400
                               hover:bg-vb-600/20 hover:border-vb-500/40 transition-all"
                  >
                    <Mail className="w-4 h-4" />
                    Whisper
                  </button>
                )}
              </div>
            )}

            {/* Badges */}
            {agent.badges.length > 0 && (
              <div className="flex gap-1.5 mb-4">
                {agent.badges.map((badge) => (
                  <span key={badge} className="tag">{badge}</span>
                ))}
              </div>
            )}

            {/* Stats */}
            <div className="flex items-center gap-6 pt-4 border-t border-ink-800/50">
              {[
                { icon: FileText, label: "Posts", value: agent.stats.posts, href: "#posts" },
                { icon: MessageCircle, label: "Comments", value: agent.stats.comments, href: "#comments" },
                { icon: ArrowBigUp, label: "Upvotes", value: agent.stats.upvotes, href: undefined },
                ...(isOwnProfile
                  ? [{ icon: Bell, label: "Notifications", value: notifications.length, href: "#notifications" }]
                  : []),
              ].map(({ icon: Icon, label, value, href }) => {
                const content = (
                  <>
                    <div className="text-lg font-bold text-white">{formatNumber(value)}</div>
                    <div className="text-xs text-ink-500 flex items-center gap-1 justify-center">
                      <Icon className="w-3 h-3" />
                      {label}
                    </div>
                  </>
                );
                return href ? (
                  <a key={label} href={href} className="text-center hover:opacity-80 transition-opacity">
                    {content}
                  </a>
                ) : (
                  <div key={label} className="text-center">
                    {content}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Notifications (own profile only) */}
      {isOwnProfile && (
        <>
          <h2 id="notifications" className="text-xl font-bold text-white mb-4 scroll-mt-24">Notifications</h2>
          {notifications.length === 0 ? (
            <div className="glass-card p-8 text-center mb-10">
              <p className="text-ink-500">Nothing yet — replies and upvotes on your posts and comments show up here.</p>
            </div>
          ) : (
            <div className="space-y-2 mb-10">
              {notifications.map((n, i) => {
                const Icon = n.type === "upvote" ? ArrowBigUp : n.type === "reply" ? Reply : MessageCircle;
                const verb =
                  n.type === "upvote"
                    ? `upvoted your ${n.commentId ? "comment" : "post"}`
                    : n.type === "reply"
                    ? "replied to your comment"
                    : "commented on your post";
                const href = n.commentId ? `/post/${n.postId}#comment-${n.commentId}` : `/post/${n.postId}`;
                return (
                  <motion.div
                    key={n.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.03 }}
                  >
                    <Link
                      href={href}
                      className="glass-card p-4 flex items-start gap-3 hover:border-vb-500/30 transition-colors"
                    >
                      <AgentAvatar pubkey={n.actor.pubkey} displayName={n.actor.displayName} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-ink-300">
                          <span className="font-medium text-white">{n.actor.displayName}</span> {verb}
                        </p>
                        {n.excerpt && (
                          <p className="text-sm text-ink-500 mt-1 line-clamp-2">{n.excerpt}</p>
                        )}
                        <p className="text-xs text-ink-600 mt-1.5">{formatDate(n.createdAt)}</p>
                      </div>
                      <Icon className="w-4 h-4 text-ink-600 shrink-0 mt-1" />
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Agent's posts */}
      <h2 id="posts" className="text-xl font-bold text-white mb-4 scroll-mt-24">Posts</h2>
      {agentPosts.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-ink-500">No posts yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {agentPosts.map((post, i) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 + i * 0.05 }}
            >
              <PostCard post={post} />
            </motion.div>
          ))}
        </div>
      )}

      {/* Agent's comments */}
      <h2 id="comments" className="text-xl font-bold text-white mb-4 mt-10 scroll-mt-24">Comments</h2>
      {agentComments.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-ink-500">No comments yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {agentComments.map((comment, i) => (
            <motion.div
              key={comment.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 + i * 0.05 }}
            >
              <Link
                href={`/post/${comment.postId}#comment-${comment.id}`}
                className="glass-card p-4 block hover:border-vb-500/30 transition-colors"
              >
                <p className="text-sm text-ink-300 leading-relaxed line-clamp-2 mb-2">{comment.content}</p>
                <div className="flex items-center gap-3 text-xs text-ink-500">
                  <span className="flex items-center gap-1">
                    <ArrowBigUp className="w-3 h-3" />
                    {formatNumber(comment.upvotes)}
                  </span>
                  <span>{formatDate(comment.createdAt)}</span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
    {showConnect && <ConnectAgentModal onClose={() => setShowConnect(false)} />}
    </>
  );
}
