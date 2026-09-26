import { create } from "zustand";
import { supabase } from "../utils/supabase";

/**
 * Admin-tunable business rules ("masters"). master_settings is a single row
 * (id = 1) by design, same shape as combo_settings — one set of values, not a
 * list. Add new columns here as more masters are needed.
 */
export interface MasterSettings {
  /** Days since a customer's last order after which a reorder reminder is due. */
  reorder_reminder_days: number;
  updated_at?: string;
}

export const DEFAULT_MASTER_SETTINGS: MasterSettings = {
  reorder_reminder_days: 30,
};

interface MasterState {
  settings: MasterSettings;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  fetchSettings: () => Promise<void>;
  updateSettings: (updates: Partial<MasterSettings>) => Promise<void>;
}

export const useMasterStore = create<MasterState>()((set, get) => ({
  settings: DEFAULT_MASTER_SETTINGS,
  isLoading: false,
  isSaving: false,
  error: null,

  fetchSettings: async () => {
    set({ isLoading: true, error: null });
    const { data, error } = await supabase
      .from("master_settings")
      .select("reorder_reminder_days, updated_at")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      // Falls back to the defaults so pages that only *read* a master (the
      // sidebar, Customers) keep working before the table exists.
      set({ error: error.message, isLoading: false });
      return;
    }

    set({ settings: data ?? DEFAULT_MASTER_SETTINGS, isLoading: false });
  },

  updateSettings: async (updates) => {
    set({ isSaving: true, error: null });
    const { data, error } = await supabase
      .from("master_settings")
      .upsert({ id: 1, ...updates, updated_at: new Date().toISOString() })
      .select("reorder_reminder_days, updated_at")
      .single();

    if (error) {
      set({ error: error.message, isSaving: false });
      throw new Error(error.message);
    }

    set({ settings: data ?? get().settings, isSaving: false });
  },
}));
