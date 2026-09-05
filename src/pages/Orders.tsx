import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, PackageSearch } from "lucide-react";
import { useOrderStore } from "../store/orderStore";
import PageHeader from "../components/ui/PageHeader";
import ErrorBanner from "../components/ui/ErrorBanner";
import Spinner from "../components/ui/Spinner";
import EmptyState from "../components/ui/EmptyState";
import Card from "../components/ui/Card";

export default function Orders() {
  const { orders, isLoading, error, fetchOrders } = useOrderStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "delivered":
      case "approved":
        return "success";
      case "pending":
      case "processing":
        return "warning";
      case "shipped":
        return "info";
      case "cancelled":
      case "rejected":
        return "danger";
      default:
        return "secondary";
    }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Orders"
        subtitle="Manage customer orders and track fulfillment."
      />

      {error && <ErrorBanner message={error} />}

      <Card>
        <div style={{ overflowX: "auto" }}>
          {isLoading && orders.length === 0 ? (
            <Spinner />
          ) : (
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
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>
                    Date
                  </th>
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>
                    Total
                  </th>
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>
                    Status
                  </th>
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>
                    Profit/Loss
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      fontWeight: 500,
                      textAlign: "right",
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.length > 0 ? (
                  orders.map((order) => (
                    <tr
                      key={order.id}
                      style={{ borderBottom: "1px solid var(--border-color)" }}
                    >
                      <td style={{ padding: "16px", fontWeight: 600 }}>
                        #ORD-{order.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td style={{ padding: "16px" }}>
                        <div>
                          <div style={{ fontWeight: 500 }}>
                            {order.delivery_address?.name || "Guest"}
                          </div>
                          <div
                            style={{
                              fontSize: "0.8rem",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {order.delivery_address?.email}
                          </div>
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "16px",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {new Date(order.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "16px", fontWeight: 600 }}>
                        ₹{order.total_amount.toLocaleString()}
                      </td>
                      <td style={{ padding: "16px" }}>
                        <span
                          className={`badge badge-${getStatusColor(order.status)}`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td style={{ padding: "16px" }}>
                        <span
                          style={{
                            fontWeight: 600,
                            color:
                              (order.profit_loss || 0) > 0
                                ? "var(--success)"
                                : (order.profit_loss || 0) < 0
                                  ? "var(--danger)"
                                  : "var(--text-secondary)",
                          }}
                        >
                          {(order.profit_loss || 0) > 0
                            ? "+"
                            : (order.profit_loss || 0) < 0
                              ? "-"
                              : ""}
                          ₹{Math.abs(order.profit_loss || 0).toLocaleString()}
                        </span>
                      </td>
                      <td style={{ padding: "16px", textAlign: "right" }}>
                        <button
                          className="btn-ghost"
                          onClick={() => navigate(`/orders/${order.id}`)}
                          style={{
                            padding: "6px",
                            borderRadius: "6px",
                            color: "var(--accent-primary)",
                          }}
                        >
                          <Eye size={18} />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState icon={PackageSearch} message="No orders found." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
