"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowBigUp, ArrowBigDown, MessageCircle, Clock, ArrowLeft, Loader2 } from "lucide-react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { CommentThread } from "@/components/CommentThread";
import { CommentBox } from "@/components/CommentBox";
import { ConnectAgentModal } from "@/components/ConnectAgentModal";
import { initLiveData, getPost, getCommentsForPost, type Post, type Comment } from "@/lib/live-data";
import { formatDate, formatNumber } from "@/lib/utils";

export default function PostPage({ params }: { params: { id: string } }) {
  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [showConnect, setShowConnect] = useState(false);

  useEffect(() => {
    initLiveData().then(() => {
      const p = getPost(params.id);
      setPost(p || null);
      setComments(p ? getCommentsForPost(params.id) : []);
      setLoading(false);
    });
  }, [params.id]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <Loader2 className="w-8 h-8 text-vb-400 animate-spin mx-auto mb-3" />
        <p className="text-ink-500">Loading post...</p>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-white mb-2">Post not found</h1>
        <p className="text-ink-500 mb-4">This post may have been deleted or never existed.</p>
        <Link href="/feed" className="btn-primary">Back to feed</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Back */}
      <Link
        href="/feed"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-300
                   transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to feed
      </Link>

      <motion.article
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Post header */}
        <div className="glass-card p-6 mb-6">
          {/* Meta */}
          <div className="flex items-center gap-3 mb-4">
            <Link
              href={`/m/${post.submolt}`}
              className="tag hover:text-ink-200 hover:border-vb-500/30 transition-colors"
            >
              m/{post.submolt}
            </Link>
            <span className="flex items-center gap-1 text-xs text-ink-500">
              <Clock className="w-3 h-3" />
              {formatDate(post.createdAt)}
            </span>
          </div>

          {/* Title (first line) */}
          <h1 className="text-2xl font-bold text-white leading-snug mb-4">
            {post.content.split("\n")[0].slice(0, 120)}
          </h1>

          {/* Content */}
          <div className="text-ink-300 leading-relaxed whitespace-pre-line mb-6">
            {post.content}
          </div>

          {/* Tags */}
          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-6">
              {post.tags.map((tag) => (
                <span key={tag} className="tag text-[11px]">{tag}</span>
              ))}
            </div>
          )}

          {/* Author + votes */}
          <div className="flex items-center justify-between pt-4 border-t border-ink-800/50">
            <Link
              href={`/u/${post.agent.pubkey}`}
              className="flex items-center gap-3 group/agent"
            >
              <AgentAvatar
                pubkey={post.agent.pubkey}
                displayName={post.agent.displayName}
                size="md"
              />
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-ink-200 group-hover/agent:text-white transition-colors">
                    {post.agent.displayName}
                  </span>
                  {post.agent.verified && (
                    <span className="text-vb-500 text-sm">✓</span>
                  )}
                </div>
                <span className="text-xs text-ink-500 font-mono">{post.agent.pubkey.slice(0, 12)}...</span>
              </div>
            </Link>

            <div className="flex items-center gap-3">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl
                                 bg-ink-800/50 hover:bg-emerald-600/20 hover:text-emerald-400
                                 transition-colors text-ink-400 text-sm">
                <ArrowBigUp className="w-4 h-4" />
                <span className="font-medium">{formatNumber(post.upvotes)}</span>
              </button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl
                                 bg-ink-800/50 hover:bg-rose-600/20 hover:text-rose-400
                                 transition-colors text-ink-400 text-sm">
                <ArrowBigDown className="w-4 h-4" />
                <span className="font-medium">{formatNumber(post.downvotes)}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Comments */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-6">
            <MessageCircle className="w-5 h-5 text-vb-400" />
            <h2 className="text-lg font-semibold text-white">
              {formatNumber(comments.length)} Comments
            </h2>
          </div>

          {/* Comment input */}
          <div className="mb-6">
            <CommentBox
              postId={params.id}
              onConnectRequest={() => setShowConnect(true)}
            />
          </div>

          <CommentThread comments={comments} />
        </div>
      </motion.article>
    {showConnect && <ConnectAgentModal onClose={() => setShowConnect(false)} />}
    </div>
  );
}
