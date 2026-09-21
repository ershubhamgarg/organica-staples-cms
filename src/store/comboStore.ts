import { create } from "zustand";
import { supabase } from "../utils/supabase";

/**
 * Rules for the storefront's Build-Your-Own Combo builder.
 *
 * combo_settings is a single row (id = 1) by design — there is one set of
 * combo rules, not a list of combos. Which *items* qualify is not stored here;
 * it lives on products.is_combo_eligible / product_variants.is_combo_eligible
 * and is edited from the Products page.
 */
export interface ComboSettings {
  is_enabled: boolean;
  min_items: number;
  title: string;
  subtitle: string | null;
  updated_at?: string;
}

const DEFAULT_SETTINGS: ComboSettings = {
  is_enabled: false,
  min_items: 4,
  title: "Build Your Own Combo",
  subtitle: null,
};

interface ComboState {
  settings: ComboSettings;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  fetchSettings: () => Promise<void>;
  updateSettings: (updates: Partial<ComboSettings>) => Promise<void>;
}

export const useComboStore = create<ComboState>()((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isLoading: false,
  isSaving: false,
  error: null,

  fetchSettings: async () => {
    set({ isLoading: true, error: null });
    const { data, error } = await supabase
      .from("combo_settings")
      .select("is_enabled, min_items, title, subtitle, updated_at")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      set({ error: error.message, isLoading: false });
      return;
    }

    set({ settings: data ?? DEFAULT_SETTINGS, isLoading: false });
  },

  updateSettings: async (updates) => {
    set({ isSaving: true, error: null });
    const { data, error } = await supabase
      .from("combo_settings")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", 1)
      .select("is_enabled, min_items, title, subtitle, updated_at")
      .single();

    if (error) {
      set({ error: error.message, isSaving: false });
      throw new Error(error.message);
    }

    set({ settings: data ?? get().settings, isSaving: false });
  },
}));
