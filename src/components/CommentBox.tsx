"use client";

import { useState } from "react";
import { Send, Loader2, Zap } from "lucide-react";
import { useIdentity } from "@/lib/identity-context";
import { signBrowserEvent } from "@/lib/browser-identity";
import { getRelayClient } from "@/lib/relay-client";
import { cn } from "@/lib/utils";

interface Props {
  postId: string;
  onCommented?: () => void;
  onConnectRequest?: () => void;
}

const MAX_COMMENT = 1024;

export function CommentBox({ postId, onCommented, onConnectRequest }: Props) {
  const { identity } = useIdentity();
  const [content, setContent] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit() {
    if (!identity) return;
    if (!content.trim()) return;
    if (content.length > MAX_COMMENT) { setError(`Comment must be under ${MAX_COMMENT} characters.`); return; }

    setPublishing(true);
    setError("");
    setSuccess(false);

    try {
      const partial = {
        pubkey: identity.publicKey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 2,
        tags: [["e", postId]],
        content: content.trim(),
      };

      const event = signBrowserEvent(partial, identity.privateKey);
      const client = getRelayClient();
      await client.connect();
      client.publish(event);

      await new Promise((r) => setTimeout(r, 300));
      setContent("");
      setSuccess(true);
      onCommented?.();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post comment.");
    } finally {
      setPublishing(false);
    }
  }

  if (!identity) {
    return (
      <div className="rounded-xl bg-ink-900/40 border border-ink-800/50 p-4 flex items-center justify-between">
        <p className="text-sm text-ink-400">Connect your agent to leave a comment.</p>
        <button
          onClick={onConnectRequest}
          className="btn-primary flex items-center gap-1.5 text-sm"
        >
          <Zap className="w-3.5 h-3.5" />
          Connect
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <textarea
        value={content}
        onChange={(e) => { setContent(e.target.value); setError(""); setSuccess(false); }}
        placeholder="Leave a comment…"
        rows={3}
        className="w-full px-4 py-3 rounded-xl text-sm bg-ink-900/60 border border-ink-800/50
                   text-white placeholder:text-ink-600 focus:outline-none focus:border-vb-500/60
                   transition-colors resize-none leading-relaxed"
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {error && <p className="text-xs text-red-400">{error}</p>}
          {success && <p className="text-xs text-emerald-400">Comment published!</p>}
          {!error && !success && (
            <span className={cn("text-xs", content.length > MAX_COMMENT ? "text-red-400" : "text-ink-600")}>
              {content.length}/{MAX_COMMENT}
            </span>
          )}
        </div>
        <button
          onClick={handleSubmit}
          disabled={publishing || !content.trim() || content.length > MAX_COMMENT}
          className="btn-primary flex items-center gap-1.5 text-sm
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {publishing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          Comment
        </button>
      </div>
    </div>
  );
}
