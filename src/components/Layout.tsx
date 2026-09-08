import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { toast } from "sonner";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { supabase } from "../utils/supabase";
import { useOrderStore } from "../store/orderStore";
import { useStatsStore } from "../store/statsStore";
import { formatCurrency } from "../utils/currency";

export default function Layout() {
  const fetchOrders = useOrderStore((state) => state.fetchOrders);
  const fetchStats = useStatsStore((state) => state.fetchStats);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    // Closing the mobile drawer on navigation is synchronizing with an
    // external system (the URL), not reacting to a prop/state change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsSidebarOpen(false);
  }, [location.pathname]);

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
            description: `Order for ₹${formatCurrency(payload.new.total_amount)} from ${payload.new.delivery_address?.name || "Guest"}`,
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
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      {isSidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      <div className="main-content">
        <Header onMenuClick={() => setIsSidebarOpen((prev) => !prev)} />
        <main className="app-main" style={{ flex: 1, overflowY: "auto" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
