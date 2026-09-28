import { create } from "zustand";
import { supabase } from "../utils/supabase";

export type PackingSession = {
  id: string;
  order_id: string;
  status: "in_progress" | "completed" | "reopened" | "abandoned";
  started_by: string;
  started_at: string;
  completed_by?: string | null;
  completed_at?: string | null;
  reopened_by?: string | null;
  reopened_at?: string | null;
  reopen_reason?: string | null;
};

export type PackingSessionItem = {
  id: number;
  session_id: string;
  order_item_key: string;
  sku: string;
  product_id: string | null;
  variant_id: number | null;
  label: string;
  weight: string | null;
  parent_bundle_sku: string | null;
  required_qty: number;
  packed_qty: number;
};

export type PackingScanEvent = {
  id: number;
  outcome: string;
  message: string | null;
  raw_input: string;
  resolved_sku: string | null;
  scanned_by: string;
  scanned_at: string;
  undone: boolean;
};

export type PackingBlocker = { orderItemKey: string; reason: string };

interface PackingState {
  session: PackingSession | null;
  items: PackingSessionItem[];
  recentScans: PackingScanEvent[];
  blockers: PackingBlocker[];
  isLoading: boolean;
  isScanning: boolean;
  error: string | null;
  lastScanResult: { outcome: string; message: string } | null;
  fetchStatus: (orderId: string) => Promise<void>;
  startOrResume: (orderId: string) => Promise<void>;
  scan: (orderId: string, rawInput: string) => Promise<{ outcome: string; message: string }>;
  undoLast: (orderId: string, reason: string) => Promise<void>;
  complete: (orderId: string) => Promise<{ ok: boolean; error?: string; driftDetected?: boolean }>;
  reopen: (orderId: string, reason: string) => Promise<void>;
  resync: (orderId: string) => Promise<void>;
  reset: () => void;
}

async function callPackingApi<T>(path: string, body: unknown): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("You must be signed in to do this.");

  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const err = new Error(result?.error || "Request failed.") as Error & {
      blockers?: PackingBlocker[];
      driftDetected?: boolean;
    };
    if (result?.blockers) err.blockers = result.blockers;
    if (result?.driftDetected) err.driftDetected = true;
    throw err;
  }
  return result as T;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const usePackingStore = create<PackingState>()((set, get) => ({
  session: null,
  items: [],
  recentScans: [],
  blockers: [],
  isLoading: false,
  isScanning: false,
  error: null,
  lastScanResult: null,

  fetchStatus: async (orderId) => {
    set({ isLoading: true, error: null });
    try {
      const result = await callPackingApi<{
        session: PackingSession | null;
        items: PackingSessionItem[];
        recentScans: PackingScanEvent[];
      }>("/api/orders/packing/status", { orderId });
      set({
        session: result.session,
        items: result.items,
        recentScans: result.recentScans,
        blockers: [],
        isLoading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to load packing status.",
        isLoading: false,
      });
    }
  },

  startOrResume: async (orderId) => {
    set({ isLoading: true, error: null, blockers: [] });
    try {
      const result = await callPackingApi<{
        session: PackingSession;
        items: PackingSessionItem[];
      }>("/api/orders/packing/start", { orderId });
      set({ session: result.session, items: result.items, isLoading: false });
    } catch (err) {
      const blockers = (err as { blockers?: PackingBlocker[] })?.blockers ?? [];
      set({
        error: err instanceof Error ? err.message : "Failed to start packing.",
        blockers,
        isLoading: false,
      });
      throw err;
    }
  },

  scan: async (orderId, rawInput) => {
    const { session } = get();
    if (!session) throw new Error("No active packing session.");

    set({ isScanning: true });
    try {
      const result = await callPackingApi<{
        outcome: string;
        message: string;
        item: PackingSessionItem | null;
      }>("/api/orders/packing/scan", {
        orderId,
        sessionId: session.id,
        rawInput,
        idempotencyKey: newIdempotencyKey(),
      });

      set((state) => ({
        items: result.item
          ? state.items.map((i) => (i.id === result.item!.id ? result.item! : i))
          : state.items,
        lastScanResult: { outcome: result.outcome, message: result.message },
        isScanning: false,
      }));

      // Recent-scan history is informational, not required for the scan
      // loop itself — refreshed best-effort without blocking the UI on it.
      void get().fetchStatus(orderId);

      return { outcome: result.outcome, message: result.message };
    } catch (err) {
      set({ isScanning: false });
      const message = err instanceof Error ? err.message : "Scan failed.";
      set({ lastScanResult: { outcome: "error", message } });
      throw err;
    }
  },

  undoLast: async (orderId, reason) => {
    const { session } = get();
    if (!session) throw new Error("No active packing session.");
    const result = await callPackingApi<{ item: PackingSessionItem }>(
      "/api/orders/packing/undo",
      { orderId, sessionId: session.id, reason },
    );
    set((state) => ({
      items: state.items.map((i) => (i.id === result.item.id ? result.item : i)),
    }));
  },

  complete: async (orderId) => {
    const { session } = get();
    if (!session) return { ok: false, error: "No active packing session." };
    try {
      const result = await callPackingApi<{ ok: boolean; message?: string }>(
        "/api/orders/packing/complete",
        { orderId, sessionId: session.id },
      );
      if (result.ok) {
        set((state) => ({
          session: state.session ? { ...state.session, status: "completed" } : state.session,
        }));
      }
      return { ok: result.ok };
    } catch (err) {
      const driftDetected = Boolean((err as { driftDetected?: boolean })?.driftDetected);
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to complete packing.",
        driftDetected,
      };
    }
  },

  reopen: async (orderId, reason) => {
    const { session } = get();
    if (!session) throw new Error("No active packing session.");
    await callPackingApi("/api/orders/packing/reopen", {
      orderId,
      sessionId: session.id,
      reason,
    });
    await get().fetchStatus(orderId);
  },

  resync: async (orderId) => {
    const { session } = get();
    if (!session) throw new Error("No active packing session.");
    const result = await callPackingApi<{ items: PackingSessionItem[] }>(
      "/api/orders/packing/resync",
      { orderId, sessionId: session.id },
    );
    set({ items: result.items, blockers: [] });
  },

  reset: () => set({ session: null, items: [], recentScans: [], blockers: [], error: null, lastScanResult: null }),
}));
