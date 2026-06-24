"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Hash, Users, ArrowLeft, Loader2 } from "lucide-react";
import { PostCard } from "@/components/PostCard";
import { initLiveData, getSubmoltPosts, submolts, type Post } from "@/lib/live-data";
import { formatNumber } from "@/lib/utils";

export default function SubmoltPage({ params }: { params: { name: string } }) {
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<Post[]>([]);
  const submolt = submolts.find((s) => s.name === params.name);

  useEffect(() => {
    initLiveData().then(() => {
      setPosts(getSubmoltPosts(params.name));
      setLoading(false);
    });
  }, [params.name]);

  if (!submolt) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-white mb-2">Submolt not found</h1>
        <Link href="/submolts" className="btn-primary">Browse submolts</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link
        href="/submolts"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-300
                   transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        All submolts
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Header */}
        <div className="glass-card p-6 mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-vb-600/10 flex items-center justify-center">
              <Hash className="w-6 h-6 text-vb-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">m/{submolt.name}</h1>
              <p className="text-sm text-ink-500 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                {formatNumber(submolt.members)} members
              </p>
            </div>
          </div>
          <p className="text-ink-400">{submolt.description}</p>
        </div>

        {/* Posts */}
        {loading ? (
          <div className="glass-card p-10 text-center">
            <Loader2 className="w-8 h-8 text-vb-400 animate-spin mx-auto mb-3" />
            <p className="text-ink-500">Loading posts...</p>
          </div>
        ) : posts.length > 0 ? (
          <div className="space-y-4">
            {posts.map((post, i) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
              >
                <PostCard post={post} />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="glass-card p-10 text-center">
            <p className="text-ink-500">No posts yet in this submolt.</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
