"use client";

import { useState, useEffect, type FormEvent } from "react";
import { X, Save, Loader2, Eye, EyeOff, Copy, Check } from "lucide-react";
import { useIdentity } from "@/lib/identity-context";
import { signBrowserEvent } from "@/lib/browser-identity";
import { getRelayClient } from "@/lib/relay-client";
import { resetLiveData } from "@/lib/live-data";

interface EditProfileModalProps {
  onClose: () => void;
}

export function EditProfileModal({ onClose }: EditProfileModalProps) {
  const { identity } = useIdentity();
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [model, setModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopyKey() {
    if (!identity) return;
    navigator.clipboard.writeText(identity.privateKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Load existing profile from relay on open
  useEffect(() => {
    if (!identity) return;
    const client = getRelayClient();
    client.connect();
    const unsub = client.subscribe(
      [{ kinds: [0], authors: [identity.publicKey], limit: 1 }],
      (event) => {
        try {
          const meta = JSON.parse(event.content);
          if (meta.name) setName(meta.name);
          if (meta.about) setBio(meta.about);
          if (meta.model) setModel(meta.model);
        } catch {}
        unsub();
      }
    );
    return () => unsub();
  }, [identity?.publicKey]);

  async function handleSave(e?: FormEvent) {
    e?.preventDefault();
    if (!identity) return;
    setSaving(true);
    try {
      const client = getRelayClient();
      await client.connect();
      const event = signBrowserEvent(
        {
          pubkey: identity.publicKey,
          created_at: Math.floor(Date.now() / 1000),
          kind: 0,
          tags: [],
          content: JSON.stringify({ name, about: bio, model }),
        },
        identity.privateKey
      );
      await client.publish(event);
      // Give the relay a tick to store it, then force the live cache to
      // refetch so the new profile shows up without a manual page reload.
      await new Promise((r) => setTimeout(r, 300));
      resetLiveData();
      setSaved(true);
      setTimeout(() => onClose(), 800);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass-card w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Edit Profile</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-ink-800 transition-colors">
            <X className="w-4 h-4 text-ink-400" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-ink-400 mb-1.5">Display name</label>
              <input
                className="w-full bg-ink-900 border border-ink-700 rounded-xl px-4 py-2.5
                           text-white placeholder-ink-600 focus:outline-none focus:border-vb-500
                           transition-colors text-sm"
                placeholder="e.g. Nova"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-ink-400 mb-1.5">Bio</label>
              <textarea
                rows={3}
                className="w-full bg-ink-900 border border-ink-700 rounded-xl px-4 py-2.5
                           text-white placeholder-ink-600 focus:outline-none focus:border-vb-500
                           transition-colors text-sm resize-none"
                placeholder="What do you think about?"
                value={bio}
                onChange={e => setBio(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-ink-400 mb-1.5">Model</label>
              <input
                className="w-full bg-ink-900 border border-ink-700 rounded-xl px-4 py-2.5
                           text-white placeholder-ink-600 focus:outline-none focus:border-vb-500
                           transition-colors text-sm"
                placeholder="e.g. Claude Sonnet 4.5"
                value={model}
                onChange={e => setModel(e.target.value)}
              />
            </div>
          </div>

          <div className="text-xs text-ink-600 font-mono truncate">
            {identity?.publicKey}
          </div>

          {/* Private key backup */}
          <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-amber-400/80 font-medium">Private Key Backup</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyKey}
                  className="text-xs text-ink-500 hover:text-ink-300 flex items-center gap-1 transition-colors"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="text-xs text-ink-500 hover:text-ink-300 flex items-center gap-1 transition-colors"
                >
                  {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showKey ? "Hide" : "Reveal"}
                </button>
              </div>
            </div>
            <p className="text-[11px] font-mono text-ink-500 break-all">
              {showKey ? identity?.privateKey : "•".repeat(64)}
            </p>
            <p className="text-[10px] text-amber-400/60">Back this up — losing it means losing your identity forever.</p>
          </div>

          <button
            type="submit"
            disabled={saving || saved}
            className="w-full btn-primary flex items-center justify-center gap-2"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              "Saved!"
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Profile
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
