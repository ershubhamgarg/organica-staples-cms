import { create } from "zustand";
import { supabase } from "../utils/supabase";

export interface Coupon {
  code: string;
  percent: number;
  label: string | null;
  is_active: boolean;
  is_public: boolean;
  min_order_value: number | null;
  valid_upto: string | null;
  created_at?: string;
}

interface CouponState {
  coupons: Coupon[];
  isLoading: boolean;
  error: string | null;
  fetchCoupons: () => Promise<void>;
  addCoupon: (coupon: Coupon) => Promise<void>;
  updateCoupon: (code: string, updates: Partial<Coupon>) => Promise<void>;
  deleteCoupon: (code: string) => Promise<void>;
}

export const useCouponStore = create<CouponState>()((set) => ({
  coupons: [],
  isLoading: false,
  error: null,

  fetchCoupons: async () => {
    set({ isLoading: true, error: null });
    const { data, error } = await supabase
      .from("discount_coupons")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      set({ error: error.message, isLoading: false });
      return;
    }

    set({ coupons: data || [], isLoading: false });
  },

  addCoupon: async (coupon) => {
    set({ isLoading: true, error: null });
    const { data, error } = await supabase
      .from("discount_coupons")
      .insert([coupon])
      .select();

    if (error) {
      set({ error: error.message, isLoading: false });
      throw new Error(error.message);
    }

    if (data) {
      set((state) => ({
        coupons: [data[0], ...state.coupons],
        isLoading: false,
      }));
    }
  },

  updateCoupon: async (code, updates) => {
    set({ isLoading: true, error: null });
    const { data, error } = await supabase
      .from("discount_coupons")
      .update(updates)
      .eq("code", code)
      .select();

    if (error) {
      set({ error: error.message, isLoading: false });
      throw new Error(error.message);
    }

    if (data) {
      set((state) => ({
        coupons: state.coupons.map((c) => (c.code === code ? data[0] : c)),
        isLoading: false,
      }));
    }
  },

  deleteCoupon: async (code) => {
    set({ isLoading: true, error: null });
    const { error } = await supabase
      .from("discount_coupons")
      .delete()
      .eq("code", code);

    if (error) {
      set({ error: error.message, isLoading: false });
      throw new Error(error.message);
    }

    set((state) => ({
      coupons: state.coupons.filter((c) => c.code !== code),
      isLoading: false,
    }));
  },
}));
