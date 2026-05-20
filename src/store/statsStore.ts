import { create } from "zustand";
import { supabase } from "../utils/supabase";

interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalProducts: number;
  totalCustomers: number;
  recentOrders: any[];
  isLoading: boolean;
  error: string | null;
  fetchStats: () => Promise<void>;
}

export const useStatsStore = create<DashboardStats>()((set) => ({
  totalRevenue: 0,
  totalOrders: 0,
  totalProducts: 0,
  totalCustomers: 0,
  recentOrders: [],
  isLoading: false,
  error: null,

  fetchStats: async () => {
    set({ isLoading: true, error: null });
    try {
      // 1. Fetch total products count
      const { count: productCount, error: productError } = await supabase
        .from("products")
        .select("*", { count: "exact", head: true });

      // 2. Fetch total orders and revenue
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select("total_amount, status, created_at, id, delivery_address");

      if (productError) throw productError;
      if (ordersError) throw ordersError;

      const totalRevenue = ordersData?.reduce((acc, order) => acc + (order.total_amount || 0), 0) || 0;
      const totalOrders = ordersData?.length || 0;

      // 3. Estimate customers from unique delivery addresses or user_ids
      const uniqueEmails = new Set(
        ordersData?.map(order => order.delivery_address?.email).filter(Boolean)
      );
      const totalCustomers = uniqueEmails.size;

      // 4. Format recent orders
      const recentOrders = ordersData
        ?.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5)
        .map(order => ({
          id: `#ORD-${order.id.toString().slice(0, 4).toUpperCase()}`,
          customer: order.delivery_address?.name || 'Guest',
          total: `₹${order.total_amount}`,
          status: order.status.charAt(0).toUpperCase() + order.status.slice(1),
          date: new Date(order.created_at).toLocaleDateString()
        })) || [];

      set({
        totalProducts: productCount || 0,
        totalOrders,
        totalRevenue,
        totalCustomers,
        recentOrders,
        isLoading: false
      });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },
}));
