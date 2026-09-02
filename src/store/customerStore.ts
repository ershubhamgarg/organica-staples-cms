import { create } from "zustand";
import { supabase } from "../utils/supabase";

export interface Customer {
  email: string;
  name: string;
  phone: string;
  orderCount: number;
  totalSpent: number;
  lastOrderDate: string;
  userId: string | null;
}

interface OrderRow {
  customer_name: string | null;
  delivery_address: {
    name?: string;
    email?: string;
    phone?: string;
  } | null;
  total_amount: number | null;
  status: string;
  created_at: string;
  user_id: string | null;
}

interface CustomerState {
  customers: Customer[];
  isLoading: boolean;
  error: string | null;
  fetchCustomers: () => Promise<void>;
}

export const useCustomerStore = create<CustomerState>()((set) => ({
  customers: [],
  isLoading: false,
  error: null,

  fetchCustomers: async () => {
    set({ isLoading: true, error: null });
    const { data, error } = await supabase
      .from("orders")
      .select(
        "customer_name, delivery_address, total_amount, status, created_at, user_id",
      )
      .order("created_at", { ascending: false });

    if (error) {
      set({ error: error.message, isLoading: false });
      return;
    }

    const byEmail = new Map<string, Customer>();

    for (const order of (data || []) as OrderRow[]) {
      const email = order.delivery_address?.email?.trim().toLowerCase();
      if (!email) continue;

      const existing = byEmail.get(email);
      const total =
        order.status === "cancelled" ? 0 : order.total_amount || 0;

      if (existing) {
        existing.orderCount += 1;
        existing.totalSpent += total;
        if (new Date(order.created_at) > new Date(existing.lastOrderDate)) {
          existing.lastOrderDate = order.created_at;
        }
      } else {
        byEmail.set(email, {
          email,
          name:
            order.customer_name || order.delivery_address?.name || "Guest",
          phone: order.delivery_address?.phone || "",
          orderCount: 1,
          totalSpent: total,
          lastOrderDate: order.created_at,
          userId: order.user_id,
        });
      }
    }

    const customers = Array.from(byEmail.values()).sort(
      (a, b) =>
        new Date(b.lastOrderDate).getTime() -
        new Date(a.lastOrderDate).getTime(),
    );

    set({ customers, isLoading: false });
  },
}));
