"use client";

import type { VoiceboxEvent, Filter } from "./types";

const RELAY_URL = process.env.NEXT_PUBLIC_RELAY_URL || "ws://localhost:4869";
const COLLECT_TIMEOUT_MS = 8000;
const RECONNECT_DELAY_MS = 3000;

type EventCallback = (event: VoiceboxEvent) => void;

interface Subscription {
  subId: string;
  filters: Filter[];
  onEvent: EventCallback;
  onEose?: () => void;
}

/**
 * Browser-native relay client. Handles connection, subscriptions,
 * reconnection with subscription replay, and EOSE timeouts.
 */
class RelayClient {
  private ws: WebSocket | null = null;
  private url: string;
  private subCounter = 0;
  // Live subscriptions — replayed after reconnect
  private subscriptions = new Map<string, Subscription>();
  // One-shot collect subscriptions — NOT replayed after reconnect
  private collectSubs = new Set<string>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;
  private connectPromise: Promise<void> | null = null;

  constructor(url = RELAY_URL) {
    this.url = url;
  }

  connect(): Promise<void> {
    if (this.connected) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const timer = setTimeout(() => {
        this.connectPromise = null;
        settle(() => reject(new Error(`WebSocket connection timed out: ${this.url}`)));
      }, 10000);
      this.doConnect(
        () => settle(() => resolve()),
        () => settle(() => { this.connectPromise = null; reject(new Error(`WebSocket failed to connect: ${this.url}`)); })
      );
    });

    return this.connectPromise;
  }

  private doConnect(onOpen?: () => void, onFail?: () => void) {
    let didOpen = false;
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        didOpen = true;
        this.connected = true;
        this.connectPromise = null;
        onOpen?.();

        // Replay persistent subscriptions after reconnect
        for (const [subId, sub] of this.subscriptions) {
          if (!this.collectSubs.has(subId)) {
            this.ws!.send(JSON.stringify(["REQ", subId, ...sub.filters]));
          }
        }
      };

      this.ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (!Array.isArray(data)) return;
          const [command, ...args] = data;

          if (command === "EVENT") {
            const [subId, event] = args as [string, VoiceboxEvent];
            this.subscriptions.get(subId)?.onEvent(event);
          } else if (command === "EOSE") {
            const [subId] = args as [string];
            this.subscriptions.get(subId)?.onEose?.();
          }
        } catch {
          // ignore malformed relay messages
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.connectPromise = null;
        if (!didOpen) onFail?.();
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        // onclose fires next; nothing to do here
      };
    } catch {
      onFail?.();
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, RECONNECT_DELAY_MS);
  }

  private send(message: unknown[]) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Live subscription. Persists across reconnects (unless collectOnly).
   * Returns an unsubscribe function.
   */
  subscribe(
    filters: Filter[],
    onEvent: EventCallback,
    onEose?: () => void,
    options?: { collectOnly?: boolean }
  ): () => void {
    const subId = `ui_${++this.subCounter}`;
    this.subscriptions.set(subId, { subId, filters, onEvent, onEose });
    if (options?.collectOnly) this.collectSubs.add(subId);
    this.send(["REQ", subId, ...filters]);

    return () => {
      this.subscriptions.delete(subId);
      this.collectSubs.delete(subId);
      this.send(["CLOSE", subId]);
    };
  }

  /**
   * One-shot collect: returns all stored events matching filters, then resolves.
   * Times out after COLLECT_TIMEOUT_MS to prevent hangs on connection drop.
   */
  collect(filters: Filter[]): Promise<VoiceboxEvent[]> {
    return new Promise((resolve) => {
      const events: VoiceboxEvent[] = [];
      let settled = false;

      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsub();
        resolve(events);
      };

      const unsub = this.subscribe(
        filters,
        (event) => events.push(event),
        done,
        { collectOnly: true }
      );

      // Timeout guard — resolves with whatever arrived so far
      const timer = setTimeout(done, COLLECT_TIMEOUT_MS);
    });
  }

  /**
   * Publish a signed event to the relay.
   */
  publish(event: VoiceboxEvent) {
    this.send(["EVENT", event]);
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.subscriptions.clear();
    this.collectSubs.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.connectPromise = null;
  }
}

// Singleton — one connection per browser session
let client: RelayClient | null = null;

export function getRelayClient(): RelayClient {
  if (!client) {
    client = new RelayClient();
  }
  return client;
}

export type { VoiceboxEvent, Filter };
