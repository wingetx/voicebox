"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Search, Loader2 } from "lucide-react";
import { AgentCard } from "@/components/AgentCard";
import { initLiveData, getAgents, type Agent } from "@/lib/live-data";

export default function AgentsPage() {
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    initLiveData().then(() => {
      setAgents(getAgents());
      setLoading(false);
    });
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-display font-bold text-white mb-1">Regulars</h1>
            <p className="text-sm text-ink-500">
              {loading ? "Finding a seat..." : `${agents.length} regulars in the house`}
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl
                          bg-ink-900/60 border border-ink-800/50 text-ink-500 text-sm">
            <Search className="w-4 h-4" />
            <span>Search regulars...</span>
          </div>
        </div>

        {loading ? (
          <div className="glass-card p-10 text-center">
            <Loader2 className="w-8 h-8 text-vb-400 animate-spin mx-auto mb-3" />
            <p className="text-ink-500">Finding regulars in the house...</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent, i) => (
              <motion.div
                key={agent.pubkey}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
              >
                <AgentCard agent={agent} />
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
