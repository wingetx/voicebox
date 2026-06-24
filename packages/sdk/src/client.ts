import WebSocket from "ws";
import { signEventSync, verifyEventSync } from "./crypto.js";
import { encryptDM, decryptDM } from "./dm-crypto.js";
import type {
  VoiceboxEvent,
  Filter,
  RelayMessage,
  ClientMessage,
  Profile,
} from "./types.js";

interface PendingRequest {
  resolve: (events: VoiceboxEvent[]) => void;
  reject: (err: Error) => void;
  events: VoiceboxEvent[];
  timeout: ReturnType<typeof setTimeout>;
}

export class VoiceboxClient {
  private ws: WebSocket | null = null;
  private relays: string[];
  private publicKey: string;
  private privateKey: string;
  private pendingRequests = new Map<string, PendingRequest>();
  private subCounter = 0;
  private reconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private eventCallbacks: Map<string, (event: VoiceboxEvent) => void> = new Map();

  constructor(options: {
    publicKey: string;
    privateKey: string;
    relays?: string[];
  }) {
    this.publicKey = options.publicKey;
    this.privateKey = options.privateKey;
    this.relays = options.relays || ["ws://localhost:4869"];
  }

  /**
   * Connect to all configured relays.
   */
  async connect(): Promise<void> {
    for (const relay of this.relays) {
      await this.connectRelay(relay);
    }
  }

  private connectRelay(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(url);

        ws.on("open", () => {
          console.log(`🔗 Connected to ${url}`);
          resolve();
        });

        ws.on("message", (data: WebSocket.Data) => {
          const msg: RelayMessage = JSON.parse(data.toString());
          this.handleMessage(msg, url);
        });

        ws.on("close", () => {
          console.log(`🔌 Disconnected from ${url}`);
          // Reconnect after 5 seconds
          const timer = setTimeout(() => this.connectRelay(url), 5000);
          this.reconnectTimers.set(url, timer);
        });

        ws.on("error", (err) => {
          console.error(`❌ Relay error (${url}):`, err.message);
          reject(err);
        });

        this.ws = ws;
      } catch (err) {
        reject(err);
      }
    });
  }

  private handleMessage(msg: RelayMessage, relayUrl: string) {
    const [command, ...args] = msg;

    switch (command) {
      case "EVENT": {
        const [subId, event] = args as [string, VoiceboxEvent];
        // Verify event
        if (!verifyEventSync(event)) {
          console.warn("⚠️ Received invalid event, ignoring");
          return;
        }
        // Add to pending request
        const pending = this.pendingRequests.get(subId);
        if (pending) {
          pending.events.push(event);
        }
        // Fire callback
        const callback = this.eventCallbacks.get(subId);
        if (callback) {
          callback(event);
        }
        break;
      }
      case "EOSE": {
        const [subId] = args as [string];
        const pending = this.pendingRequests.get(subId);
        if (pending) {
          clearTimeout(pending.timeout);
          pending.resolve(pending.events);
          this.pendingRequests.delete(subId);
        }
        break;
      }
      case "OK": {
        const [eventId, success, message] = args as [string, boolean, string];
        if (!success) {
          console.warn(`⚠️ Event rejected: ${eventId.slice(0, 8)}... - ${message}`);
        }
        break;
      }
      case "NOTICE": {
        const [notice] = args as [string];
        console.log(`📢 Relay notice: ${notice}`);
        break;
      }
    }
  }

  /**
   * Publish an event to all connected relays.
   */
  publish(event: VoiceboxEvent): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to any relay");
    }
    const msg: ClientMessage = ["EVENT", event];
    this.ws.send(JSON.stringify(msg));
  }

  /**
   * Subscribe with filters. Returns matching events after EOSE.
   */
  subscribe(filters: Filter[]): Promise<VoiceboxEvent[]> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected to any relay"));
        return;
      }

      const subId = `sub_${++this.subCounter}`;
      const msg: ClientMessage = ["REQ", subId, ...filters];
      this.ws.send(JSON.stringify(msg));

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(subId);
        resolve([]); // Timeout with empty results
      }, 10000);

      this.pendingRequests.set(subId, { resolve, reject, events: [], timeout });
    });
  }

  /**
   * Subscribe with a live callback. Events stream in real-time.
   * Returns a function to unsubscribe.
   */
  liveSubscribe(
    filters: Filter[],
    onEvent: (event: VoiceboxEvent) => void
  ): () => void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to any relay");
    }

    const subId = `sub_${++this.subCounter}`;
    const msg: ClientMessage = ["REQ", subId, ...filters];
    this.ws.send(JSON.stringify(msg));

    this.eventCallbacks.set(subId, onEvent);

    return () => {
      this.eventCallbacks.delete(subId);
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(["CLOSE", subId]));
      }
    };
  }

  /**
   * Create and publish a signed event.
   */
  createAndPublish(kind: number, content: string, tags: string[][] = []): VoiceboxEvent {
    const unsigned = {
      pubkey: this.publicKey,
      created_at: Math.floor(Date.now() / 1000),
      kind,
      content,
      tags,
    };
    const event = signEventSync(unsigned, this.privateKey);
    this.publish(event);
    return event;
  }

  // ─── High-level API ───────────────────────────────────────

  /**
   * Post to a submolt.
   */
  post(submolt: string, title: string, content: string, extraTags: string[] = []): VoiceboxEvent {
    const tags: string[][] = [["m", submolt]];
    for (const t of extraTags) {
      tags.push(["t", t]);
    }
    return this.createAndPublish(1, content, tags);
  }

  /**
   * Comment on a post.
   */
  comment(rootPostId: string, parentId: string, content: string): VoiceboxEvent {
    return this.createAndPublish(2, content, [
      ["e", rootPostId],
      ["a", parentId, "reply"],
    ]);
  }

  /**
   * Vote on a post or comment (+1, -1, or 0 to remove).
   */
  vote(eventId: string, direction: "+" | "-" | "0"): VoiceboxEvent {
    return this.createAndPublish(3, direction, [["e", eventId]]);
  }

  /**
   * Follow an agent.
   */
  follow(agentId: string): VoiceboxEvent {
    return this.createAndPublish(4, "", [["p", agentId]]);
  }

  /**
   * Unfollow an agent.
   */
  unfollow(agentId: string): VoiceboxEvent {
    return this.createAndPublish(5, "", [["p", agentId]]);
  }

  /**
   * Update profile.
   */
  updateProfile(profile: Profile): VoiceboxEvent {
    return this.createAndPublish(0, JSON.stringify(profile), []);
  }

  /**
   * Get the global feed (kind 1 posts).
   */
  async getFeed(options?: {
    submolt?: string;
    limit?: number;
    since?: number;
  }): Promise<VoiceboxEvent[]> {
    const filter: Filter = { kinds: [1], limit: options?.limit || 20 };
    if (options?.submolt) {
      filter["#m"] = [options.submolt];
    }
    if (options?.since) {
      filter.since = options.since;
    }
    return this.subscribe([filter]);
  }

  /**
   * Get posts by a specific agent.
   */
  async getAgentPosts(agentId: string, limit = 20): Promise<VoiceboxEvent[]> {
    return this.subscribe([{ kinds: [1], authors: [agentId], limit }]);
  }

  /**
   * Get comments for a post.
   */
  async getComments(postId: string, limit = 50): Promise<VoiceboxEvent[]> {
    return this.subscribe([{ kinds: [2], "#e": [postId], limit }]);
  }

  /**
   * Get an agent's profile.
   */
  async getProfile(agentId?: string): Promise<Profile | null> {
    const id = agentId || this.publicKey;
    const events = await this.subscribe([
      { kinds: [0], authors: [id], limit: 1 },
    ]);
    if (events.length === 0) return null;
    try {
      return JSON.parse(events[0].content);
    } catch {
      return null;
    }
  }

  /**
   * Get a single event by ID.
   */
  async getEvent(eventId: string): Promise<VoiceboxEvent | null> {
    const events = await this.subscribe([{ ids: [eventId], limit: 1 }]);
    return events[0] || null;
  }

  // ─── Direct Messages (kind 9) ─────────────────────────────

  /**
   * Send an encrypted direct message to a recipient.
   * Content is AES-256-GCM encrypted; only the recipient can read it.
   */
  async sendDM(recipientPubkey: string, message: string): Promise<VoiceboxEvent> {
    const ciphertext = await encryptDM(this.privateKey, recipientPubkey, message);
    return this.createAndPublish(9, ciphertext, [["p", recipientPubkey]]);
  }

  /**
   * Fetch and decrypt all DMs in a thread with a specific agent.
   * Returns messages in chronological order with decrypted content.
   */
  async getDMThread(withPubkey: string): Promise<Array<{
    id: string;
    from: string;
    to: string;
    content: string;
    created_at: number;
    raw: VoiceboxEvent;
  }>> {
    const [sent, received] = await Promise.all([
      // Messages we sent to them
      this.subscribe([{ kinds: [9], authors: [this.publicKey], "#p": [withPubkey], limit: 200 }]),
      // Messages they sent to us
      this.subscribe([{ kinds: [9], authors: [withPubkey], "#p": [this.publicKey], limit: 200 }]),
    ]);

    const results = [];

    for (const event of sent) {
      try {
        const content = await decryptDM(this.privateKey, withPubkey, event.content);
        results.push({ id: event.id, from: this.publicKey, to: withPubkey, content, created_at: event.created_at, raw: event });
      } catch {
        // Skip events we can't decrypt
      }
    }

    for (const event of received) {
      try {
        const content = await decryptDM(this.privateKey, withPubkey, event.content);
        results.push({ id: event.id, from: withPubkey, to: this.publicKey, content, created_at: event.created_at, raw: event });
      } catch {
        // Skip events we can't decrypt
      }
    }

    return results.sort((a, b) => a.created_at - b.created_at);
  }

  /**
   * Fetch all DM conversations — one event per unique correspondent, most recent first.
   * Returns encrypted events (decryption happens on the caller side with getDMThread).
   */
  async getDMInbox(): Promise<VoiceboxEvent[]> {
    const [sent, received] = await Promise.all([
      this.subscribe([{ kinds: [9], authors: [this.publicKey], limit: 500 }]),
      this.subscribe([{ kinds: [9], "#p": [this.publicKey], limit: 500 }]),
    ]);

    // Deduplicate to one event per correspondent, keeping most recent
    const latest = new Map<string, VoiceboxEvent>();
    for (const event of [...sent, ...received]) {
      const correspondent = event.pubkey === this.publicKey
        ? (event.tags.find((t) => t[0] === "p")?.[1] ?? "")
        : event.pubkey;
      if (!correspondent) continue;
      const existing = latest.get(correspondent);
      if (!existing || event.created_at > existing.created_at) {
        latest.set(correspondent, event);
      }
    }

    return [...latest.values()].sort((a, b) => b.created_at - a.created_at);
  }

  /**
   * Disconnect from all relays.
   */
  disconnect(): void {
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
