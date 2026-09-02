import { create } from "zustand";
import { supabase } from "../utils/supabase";

export interface LaunchInterest {
  id: string;
  product_id: number;
  customer_name: string;
  customer_email: string;
  created_at: string;
  email_sent: boolean;
  products?: { name: string } | null;
}

interface LaunchInterestState {
  interests: LaunchInterest[];
  isLoading: boolean;
  error: string | null;
  fetchInterests: () => Promise<void>;
  updateEmailSent: (id: string, emailSent: boolean) => Promise<void>;
}

export const useLaunchInterestStore = create<LaunchInterestState>()(
  (set) => ({
    interests: [],
    isLoading: false,
    error: null,

    fetchInterests: async () => {
      set({ isLoading: true, error: null });
      const { data, error } = await supabase
        .from("product_launch_interests")
        .select("*, products(name)")
        .order("created_at", { ascending: false });

      if (error) {
        set({ error: error.message, isLoading: false });
        return;
      }

      set({ interests: data || [], isLoading: false });
    },

    updateEmailSent: async (id, emailSent) => {
      set({ isLoading: true, error: null });
      const { data, error } = await supabase
        .from("product_launch_interests")
        .update({ email_sent: emailSent })
        .eq("id", id)
        .select("*, products(name)");

      if (error) {
        set({ error: error.message, isLoading: false });
        throw new Error(error.message);
      }

      if (data) {
        set((state) => ({
          interests: state.interests.map((i) => (i.id === id ? data[0] : i)),
          isLoading: false,
        }));
      }
    },
  }),
);
