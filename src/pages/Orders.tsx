import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, ShoppingCart, Loader2, Search } from "lucide-react";
import { useOrderStore } from "../store/orderStore";

export default function Orders() {
  const { orders, isLoading, error, fetchOrders } = useOrderStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "delivered":
        return "success";
      case "approved":
        return "success";
      case "pending":
        return "warning";
      case "shipped":
        return "info";
      case "cancelled":
        return "danger";
      case "rejected":
        return "danger";
      case "processing":
        return "warning";
      default:
        return "secondary";
    }
  };

  return (
    <div className="animate-fade-in">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "2rem",
        }}
      >
        <div>
          <h1 className="page-title">Orders</h1>
          <p className="page-subtitle">
            Manage customer orders and track fulfillment.
          </p>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: "1rem",
            backgroundColor: "var(--danger-light)",
            color: "var(--danger)",
            borderRadius: "8px",
            marginBottom: "1rem",
          }}
        >
          {error}
        </div>
      )}

      <div className="glass-card" style={{ padding: "1.5rem" }}>
        <div style={{ overflowX: "auto" }}>
          {isLoading && orders.length === 0 ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                padding: "2rem",
              }}
            >
              <Loader2 className="animate-spin" />
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                textAlign: "left",
              }}
            >
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
                      style={{
                        borderBottom: "1px solid var(--border-color)",
                        transition: "background 0.2s",
                      }}
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
                    <td
                      colSpan={6}
                      style={{
                        padding: "2rem",
                        textAlign: "center",
                        color: "var(--text-secondary)",
                      }}
                    >
                      No orders found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
