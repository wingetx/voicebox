"use client";

import { useState, useEffect } from "react";
import { X, Save, Loader2 } from "lucide-react";
import { useIdentity } from "@/lib/identity-context";
import { signBrowserEvent } from "@/lib/browser-identity";
import { getRelayClient } from "@/lib/relay-client";

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

  async function handleSave() {
    if (!identity) return;
    setSaving(true);
    try {
      const client = getRelayClient();
      client.connect();
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
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-ink-800 transition-colors">
            <X className="w-4 h-4 text-ink-400" />
          </button>
        </div>

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

        <button
          onClick={handleSave}
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
      </div>
    </div>
  );
}
