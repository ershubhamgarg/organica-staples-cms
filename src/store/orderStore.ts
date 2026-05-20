import { create } from "zustand";
import { supabase } from "../utils/supabase";

export interface Order {
  id: string;
  user_id: string | null;
  items: any[];
  delivery_address: {
    name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    zipCode: string;
  };
  payment_method: string;
  total_amount: number;
  status: string;
  created_at: string;
}

interface OrderState {
  orders: Order[];
  isLoading: boolean;
  error: string | null;
  fetchOrders: () => Promise<void>;
  updateOrderStatus: (id: string, status: string) => Promise<void>;
  getOrderById: (id: string) => Promise<Order | null>;
}

export const useOrderStore = create<OrderState>()((set, get) => ({
  orders: [],
  isLoading: false,
  error: null,

  fetchOrders: async () => {
    set({ isLoading: true, error: null });
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      set({ error: error.message, isLoading: false });
      return;
    }

    set({ orders: data || [], isLoading: false });
  },

  updateOrderStatus: async (id, status) => {
    set({ isLoading: true, error: null });
    const { data, error } = await supabase
      .from("orders")
      .update({ status })
      .eq("id", id)
      .select();

    if (error) {
      set({ error: error.message, isLoading: false });
      throw new Error(error.message);
    }

    if (data) {
      set((state) => ({
        orders: state.orders.map((o) => (o.id === id ? data[0] : o)),
        isLoading: false,
      }));
    }
  },

  getOrderById: async (id: string) => {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching order:", error);
      return null;
    }

    return data;
  },
}));
