import { create } from "zustand";
import { supabase } from "../utils/supabase";

export type SkuReviewRow = {
  type: "product" | "variant";
  productId: number;
  variantId: number | null;
  name: string;
  weight?: string | null;
  category?: string | null;
  currentSku?: string | null;
  sku?: string | null;
};

export type SkuAssignInput = {
  entityType: "product" | "variant";
  entityId: number;
  sku: string;
  confirmOverwrite?: boolean;
  reason?: string;
};

interface SkuState {
  missing: SkuReviewRow[];
  duplicates: SkuReviewRow[];
  totalNeedingReview: number;
  isLoading: boolean;
  error: string | null;
  fetchReview: () => Promise<void>;
  assignSku: (input: SkuAssignInput) => Promise<{ sku: string }>;
}

async function callSkuApi<T>(path: string, body: unknown): Promise<T> {
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
      requiresConfirmation?: boolean;
      currentSku?: string;
    };
    if (result?.requiresConfirmation) {
      err.requiresConfirmation = true;
      err.currentSku = result.currentSku;
    }
    throw err;
  }
  return result as T;
}

export const useSkuStore = create<SkuState>()((set) => ({
  missing: [],
  duplicates: [],
  totalNeedingReview: 0,
  isLoading: false,
  error: null,

  fetchReview: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await callSkuApi<{
        missing: SkuReviewRow[];
        duplicates: SkuReviewRow[];
        totalNeedingReview: number;
      }>("/api/skus/review", {});
      set({
        missing: result.missing,
        duplicates: result.duplicates,
        totalNeedingReview: result.totalNeedingReview,
        isLoading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to load SKU review.",
        isLoading: false,
      });
    }
  },

  assignSku: async (input) => {
    return callSkuApi<{ sku: string }>("/api/skus/assign", input);
  },
}));
