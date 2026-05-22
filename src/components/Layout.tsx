import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { toast } from "sonner";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { supabase } from "../utils/supabase";
import { useOrderStore } from "../store/orderStore";
import { useStatsStore } from "../store/statsStore";

export default function Layout() {
  const fetchOrders = useOrderStore((state) => state.fetchOrders);
  const fetchStats = useStatsStore((state) => state.fetchStats);

  useEffect(() => {
    // Listen for new orders
    const channel = supabase
      .channel("schema-db-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
        },
        (payload) => {
          console.log("New order received!", payload);

          // Show notification
          toast.success("New Order Received!", {
            description: `Order for ₹${payload.new.total_amount} from ${payload.new.delivery_address?.name || "Guest"}`,
            duration: 5000,
          });

          // Refresh data
          fetchOrders();
          fetchStats();

          // Play notification sound
          const audio = new Audio(
            "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3",
          );
          audio.play().catch((e) => console.log("Audio play failed:", e));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOrders, fetchStats]);

  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-content">
        <Header />
        <main style={{ padding: "2rem", flex: 1, overflowY: "auto" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
