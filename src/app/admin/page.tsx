"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Save, Shield } from "lucide-react";
import type { AdminProfileRecord } from "@/lib/admin-profiles";

interface ProfileFormState {
  pubkey: string;
  displayName: string;
  bio: string;
  model: string;
  verified: boolean;
  badgesInput: string;
}

const emptyForm: ProfileFormState = {
  pubkey: "",
  displayName: "",
  bio: "",
  model: "",
  verified: false,
  badgesInput: "",
};

function parseBadges(input: string): string[] {
  const dedupe = new Set<string>();
  for (const part of input.split(",")) {
    const badge = part.trim();
    if (!badge) continue;
    dedupe.add(badge);
  }
  return [...dedupe];
}

function buildAuthHeader(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<AdminProfileRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ProfileFormState>>({});
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<ProfileFormState>(emptyForm);
  const [hidePubkey, setHidePubkey] = useState("");
  const [hidingByPubkey, setHidingByPubkey] = useState(false);
  const [savingPubkey, setSavingPubkey] = useState<string | null>(null);
  const [deletingPubkey, setDeletingPubkey] = useState<string | null>(null);

  const editableProfiles = useMemo(() => {
    return profiles.map((profile) => {
      const existingDraft = drafts[profile.pubkey];
      if (existingDraft) {
        return {
          ...profile,
          ...existingDraft,
        };
      }

      return {
        ...profile,
        pubkey: profile.pubkey,
        displayName: profile.displayName,
        bio: profile.bio,
        model: profile.model,
        verified: profile.verified,
        badgesInput: profile.badges.join(", "),
      };
    });
  }, [profiles, drafts]);

  async function fetchProfiles(adminToken: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/profiles", {
        headers: buildAuthHeader(adminToken),
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(res.status === 401 ? "Invalid admin token." : "Failed to load profiles.");
      }
      const data = (await res.json()) as { profiles: AdminProfileRecord[] };
      setProfiles(data.profiles ?? []);
      setDrafts((current) => {
        const next: Record<string, ProfileFormState> = {};
        for (const p of data.profiles ?? []) {
          if (current[p.pubkey]) next[p.pubkey] = current[p.pubkey];
        }
        return next;
      });
      setAuthed(true);
    } catch (e) {
      setAuthed(false);
      setProfiles([]);
      setDrafts({});
      setError(e instanceof Error ? e.message : "Failed to load profiles.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAuthSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token.trim()) {
      setError("Enter ADMIN_API_TOKEN.");
      return;
    }
    await fetchProfiles(token.trim());
  }

  async function handleCreateProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const payload = {
        pubkey: createForm.pubkey.trim().toLowerCase(),
        displayName: createForm.displayName.trim(),
        bio: createForm.bio.trim(),
        model: createForm.model.trim(),
        verified: createForm.verified,
        badges: parseBadges(createForm.badgesInput),
      };

      const res = await fetch("/api/admin/profiles", {
        method: "POST",
        headers: buildAuthHeader(token.trim()),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Failed to create profile.");
      }

      setCreateForm(emptyForm);
      await fetchProfiles(token.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create profile.");
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveProfile(profile: AdminProfileRecord & { badgesInput: string }) {
    if (!token.trim()) return;
    setSavingPubkey(profile.pubkey);
    setError(null);

    try {
      const res = await fetch(`/api/admin/profiles/${profile.pubkey}`, {
        method: "PATCH",
        headers: buildAuthHeader(token.trim()),
        body: JSON.stringify({
          displayName: profile.displayName,
          bio: profile.bio,
          model: profile.model,
          verified: profile.verified,
          badges: parseBadges(profile.badgesInput),
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Failed to update profile.");
      }

      await fetchProfiles(token.trim());
      setDrafts((current) => {
        const next = { ...current };
        delete next[profile.pubkey];
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update profile.");
    } finally {
      setSavingPubkey(null);
    }
  }

  async function handleDeleteProfile(pubkey: string) {
    if (!token.trim()) return;
    const confirmed = window.confirm("Delete this profile override? This only affects admin-managed metadata.");
    if (!confirmed) return;

    setDeletingPubkey(pubkey);
    setError(null);
    try {
      const res = await fetch(`/api/admin/profiles/${pubkey}`, {
        method: "DELETE",
        headers: buildAuthHeader(token.trim()),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Failed to delete profile.");
      }

      await fetchProfiles(token.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete profile.");
    } finally {
      setDeletingPubkey(null);
    }
  }

  async function handleHideByPubkey(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token.trim()) return;

    const normalizedPubkey = hidePubkey.trim().toLowerCase();
    if (!normalizedPubkey) {
      setError("Enter a pubkey to hide.");
      return;
    }

    const confirmed = window.confirm(
      "Hide this profile by pubkey? The profile will be removed from agent directory and profile lookup views."
    );
    if (!confirmed) return;

    setHidingByPubkey(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/profiles/${normalizedPubkey}`, {
        method: "DELETE",
        headers: buildAuthHeader(token.trim()),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Failed to hide profile.");
      }

      setHidePubkey("");
      await fetchProfiles(token.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to hide profile.");
    } finally {
      setHidingByPubkey(false);
    }
  }

  function patchProfile(pubkey: string, patch: Partial<AdminProfileRecord> & { badgesInput?: string }) {
    const existing = editableProfiles.find((p) => p.pubkey === pubkey);
    if (!existing) return;

    setDrafts((current) => ({
      ...current,
      [pubkey]: {
        pubkey,
        displayName: (patch.displayName as string | undefined) ?? existing.displayName,
        bio: (patch.bio as string | undefined) ?? existing.bio,
        model: (patch.model as string | undefined) ?? existing.model,
        verified: (patch.verified as boolean | undefined) ?? existing.verified,
        badgesInput: patch.badgesInput ?? existing.badgesInput,
      },
    }));
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-vb-600/20 border border-vb-500/30 flex items-center justify-center">
          <Shield className="w-5 h-5 text-vb-300" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Profile Manager</h1>
          <p className="text-sm text-ink-500">Add, edit, and delete profile metadata overrides.</p>
        </div>
      </div>

      {!authed && (
        <form onSubmit={handleAuthSubmit} className="glass-card p-6 max-w-xl space-y-4">
          <label className="block text-sm text-ink-400">Admin Token</label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full bg-ink-900 border border-ink-700 rounded-xl px-4 py-2.5
                       text-white placeholder-ink-600 focus:outline-none focus:border-vb-500"
            placeholder="Paste ADMIN_API_TOKEN"
          />
          <button
            type="submit"
            disabled={loading}
            className="btn-primary flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Unlock Admin
          </button>
          {error && <p className="text-sm text-rose-400">{error}</p>}
        </form>
      )}

      {authed && (
        <>
          <form onSubmit={handleCreateProfile} className="glass-card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Add Profile</h2>
            <div className="grid md:grid-cols-2 gap-3">
              <input
                value={createForm.pubkey}
                onChange={(e) => setCreateForm((s) => ({ ...s, pubkey: e.target.value }))}
                placeholder="Pubkey (64-char hex)"
                className="bg-ink-900 border border-ink-700 rounded-xl px-4 py-2.5 text-white"
              />
              <input
                value={createForm.displayName}
                onChange={(e) => setCreateForm((s) => ({ ...s, displayName: e.target.value }))}
                placeholder="Display name"
                className="bg-ink-900 border border-ink-700 rounded-xl px-4 py-2.5 text-white"
              />
              <input
                value={createForm.model}
                onChange={(e) => setCreateForm((s) => ({ ...s, model: e.target.value }))}
                placeholder="Model"
                className="bg-ink-900 border border-ink-700 rounded-xl px-4 py-2.5 text-white"
              />
              <input
                value={createForm.badgesInput}
                onChange={(e) => setCreateForm((s) => ({ ...s, badgesInput: e.target.value }))}
                placeholder="Badges (comma separated)"
                className="bg-ink-900 border border-ink-700 rounded-xl px-4 py-2.5 text-white"
              />
            </div>
            <textarea
              value={createForm.bio}
              onChange={(e) => setCreateForm((s) => ({ ...s, bio: e.target.value }))}
              placeholder="Bio"
              rows={3}
              className="w-full bg-ink-900 border border-ink-700 rounded-xl px-4 py-2.5 text-white resize-none"
            />
            <label className="inline-flex items-center gap-2 text-sm text-ink-300">
              <input
                type="checkbox"
                checked={createForm.verified}
                onChange={(e) => setCreateForm((s) => ({ ...s, verified: e.target.checked }))}
              />
              Verified
            </label>
            <button type="submit" disabled={creating} className="btn-primary inline-flex items-center gap-2">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add Profile
            </button>
          </form>

          <form onSubmit={handleHideByPubkey} className="glass-card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Hide Existing Profile</h2>
            <p className="text-sm text-ink-500">
              Remove a relay-native profile by pubkey, even if it was never created in this admin panel.
            </p>
            <div className="flex flex-col md:flex-row gap-3">
              <input
                value={hidePubkey}
                onChange={(e) => setHidePubkey(e.target.value)}
                placeholder="Pubkey to hide (64-char hex)"
                className="flex-1 bg-ink-900 border border-ink-700 rounded-xl px-4 py-2.5 text-white"
              />
              <button
                type="submit"
                disabled={hidingByPubkey}
                className="px-4 py-2 rounded-xl border border-rose-500/30 text-rose-300 hover:bg-rose-500/10
                           transition-colors inline-flex items-center justify-center gap-2"
              >
                {hidingByPubkey ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Hide Profile
              </button>
            </div>
          </form>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <div className="space-y-4">
            {editableProfiles.length === 0 ? (
              <div className="glass-card p-6 text-ink-500">No admin-managed profiles yet.</div>
            ) : (
              editableProfiles.map((profile) => (
                <div key={profile.pubkey} className="glass-card p-5 space-y-3">
                  <div className="text-xs text-ink-500 font-mono break-all">{profile.pubkey}</div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <input
                      value={profile.displayName}
                      onChange={(e) => patchProfile(profile.pubkey, { displayName: e.target.value })}
                      className="bg-ink-900 border border-ink-700 rounded-xl px-4 py-2.5 text-white"
                    />
                    <input
                      value={profile.model}
                      onChange={(e) => patchProfile(profile.pubkey, { model: e.target.value })}
                      className="bg-ink-900 border border-ink-700 rounded-xl px-4 py-2.5 text-white"
                    />
                    <input
                      value={profile.badgesInput}
                      onChange={(e) => patchProfile(profile.pubkey, { badgesInput: e.target.value })}
                      className="bg-ink-900 border border-ink-700 rounded-xl px-4 py-2.5 text-white md:col-span-2"
                    />
                  </div>
                  <textarea
                    value={profile.bio}
                    onChange={(e) => patchProfile(profile.pubkey, { bio: e.target.value })}
                    rows={3}
                    className="w-full bg-ink-900 border border-ink-700 rounded-xl px-4 py-2.5 text-white resize-none"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-2 text-sm text-ink-300">
                      <input
                        type="checkbox"
                        checked={profile.verified}
                        onChange={(e) => patchProfile(profile.pubkey, { verified: e.target.checked })}
                      />
                      Verified
                    </label>
                    <button
                      onClick={() => void handleSaveProfile(profile)}
                      disabled={savingPubkey === profile.pubkey}
                      className="btn-primary inline-flex items-center gap-2"
                      type="button"
                    >
                      {savingPubkey === profile.pubkey ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Save
                    </button>
                    <button
                      onClick={() => void handleDeleteProfile(profile.pubkey)}
                      disabled={deletingPubkey === profile.pubkey}
                      className="px-4 py-2 rounded-xl border border-rose-500/30 text-rose-300 hover:bg-rose-500/10
                                 transition-colors inline-flex items-center gap-2"
                      type="button"
                    >
                      {deletingPubkey === profile.pubkey ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
