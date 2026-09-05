import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Users, ShoppingBag, IndianRupee, Package } from "lucide-react";
import { useStatsStore } from "../store/statsStore";
import PageHeader from "../components/ui/PageHeader";
import ErrorBanner from "../components/ui/ErrorBanner";
import Spinner from "../components/ui/Spinner";
import EmptyState from "../components/ui/EmptyState";
import Card from "../components/ui/Card";

export default function Dashboard() {
  const {
    totalRevenue,
    totalOrders,
    totalProducts,
    totalCustomers,
    recentOrders,
    isLoading,
    error,
    fetchStats,
  } = useStatsStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const stats = [
    {
      label: "Total Revenue",
      value: `₹${totalRevenue.toLocaleString()}`,
      icon: IndianRupee,
      color: "var(--color-brand-green)",
    },
    {
      label: "Total Orders",
      value: totalOrders.toString(),
      icon: ShoppingBag,
      color: "var(--color-brand-gold)",
    },
    {
      label: "Total Products",
      value: totalProducts.toString(),
      icon: Package,
      color: "var(--color-brand-terracotta)",
    },
    {
      label: "Total Customers",
      value: totalCustomers.toString(),
      icon: Users,
      color: "#6B6353",
    },
  ];

  if (isLoading && totalOrders === 0) {
    return <Spinner size={48} padding="4rem" />;
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Pantry Overview"
        subtitle="Monitoring ANNVRIKSH's ethically sourced essentials."
      />

      {error && <ErrorBanner message={error} />}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "1.5rem",
          marginBottom: "2rem",
        }}
      >
        {stats.map((stat, idx) => (
          <Card key={idx}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "1rem",
              }}
            >
              <div>
                <p
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: "0.9rem",
                    marginBottom: "0.25rem",
                  }}
                >
                  {stat.label}
                </p>
                <h3
                  style={{
                    fontSize: "1.8rem",
                    fontFamily: "'Fraunces', Georgia, serif",
                  }}
                >
                  {stat.value}
                </h3>
              </div>
              <div
                style={{
                  background: `${stat.color}1a`,
                  padding: "10px",
                  borderRadius: "12px",
                  color: stat.color,
                }}
              >
                <stat.icon size={24} />
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "0.85rem",
              }}
            >
              <span style={{ color: "var(--accent-primary)", fontWeight: 600 }}>
                Real-time
              </span>
              <span style={{ color: "var(--text-secondary)" }}>
                from Database
              </span>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.5rem",
          }}
        >
          <h3 style={{ fontSize: "1.2rem" }}>Recent Orders</h3>
          <button
            className="btn btn-ghost"
            onClick={() => navigate("/orders")}
          >
            View All
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", textAlign: "left" }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--border-color)",
                  color: "var(--text-secondary)",
                  fontSize: "0.9rem",
                }}
              >
                <th style={{ padding: "12px 16px", fontWeight: 500 }}>
                  Order ID
                </th>
                <th style={{ padding: "12px 16px", fontWeight: 500 }}>
                  Customer
                </th>
                <th style={{ padding: "12px 16px", fontWeight: 500 }}>Total</th>
                <th style={{ padding: "12px 16px", fontWeight: 500 }}>
                  Status
                </th>
                <th style={{ padding: "12px 16px", fontWeight: 500 }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length > 0 ? (
                recentOrders.map((order, idx) => (
                  <tr
                    key={idx}
                    style={{ borderBottom: "1px solid var(--border-color)" }}
                  >
                    <td style={{ padding: "16px", fontWeight: 600 }}>
                      {order.id}
                    </td>
                    <td style={{ padding: "16px" }}>{order.customer}</td>
                    <td style={{ padding: "16px", fontWeight: 500 }}>
                      {order.total}
                    </td>
                    <td style={{ padding: "16px" }}>
                      <span
                        className={`badge badge-${
                          order.status.toLowerCase() === "delivered" ||
                          order.status.toLowerCase() === "approved"
                            ? "success"
                            : order.status.toLowerCase() === "pending" ||
                                order.status.toLowerCase() === "processing"
                              ? "warning"
                              : order.status.toLowerCase() === "rejected" ||
                                  order.status.toLowerCase() === "cancelled"
                                ? "danger"
                                : "info"
                        }`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "16px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {order.date}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>
                    <EmptyState message="No recent orders found." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
