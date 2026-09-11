import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PackageSearch, Weight, AlertTriangle } from "lucide-react";
import { useOrderStore } from "../store/orderStore";
import PageHeader from "../components/ui/PageHeader";
import ErrorBanner from "../components/ui/ErrorBanner";
import Spinner from "../components/ui/Spinner";
import EmptyState from "../components/ui/EmptyState";
import Card from "../components/ui/Card";
import CopyButton from "../components/ui/CopyButton";
import { formatCurrency } from "../utils/currency";
import { getOrderGrossWeightKg, formatWeight } from "../utils/weight";
import { isLocalOrder } from "../utils/localOrder";
import { getUnifiedOrderStatus } from "../utils/shippingStatus";

export default function Orders() {
  const { orders, isLoading, error, fetchOrders } = useOrderStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

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
                    Weight
                  </th>
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>
                    Status
                  </th>
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>
                    Profit/Loss
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.length > 0 ? (
                  orders.map((order) => (
                    <tr
                      key={order.id}
                      onClick={() => navigate(`/orders/${order.id}`)}
                      style={{
                        borderBottom: "1px solid var(--border-color)",
                        cursor: "pointer",
                      }}
                    >
                      <td
                        style={{
                          padding: "16px",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          #ORD-{order.id.slice(0, 8).toUpperCase()}
                          <CopyButton value={order.id} label="Order ID" />
                        </div>
                      </td>
                      <td style={{ padding: "16px" }}>
                        <div>
                          <div style={{ fontWeight: 500 }}>
                            {order.delivery_address?.name || "Guest"}
                          </div>
                          {order.delivery_address?.email && (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                fontSize: "0.8rem",
                                color: "var(--text-secondary)",
                              }}
                            >
                              {order.delivery_address.email}
                              <CopyButton
                                value={order.delivery_address.email}
                                label="Email"
                              />
                            </div>
                          )}
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
                        ₹{formatCurrency(order.total_amount)}
                      </td>
                      <td style={{ padding: "16px" }}>
                        <span
                          className="badge badge-secondary"
                          style={{ gap: "5px" }}
                        >
                          <Weight size={12} />
                          {formatWeight(getOrderGrossWeightKg(order.items))}
                        </span>
                      </td>
                      <td style={{ padding: "16px" }}>
                        {(() => {
                          const unified = getUnifiedOrderStatus(order);
                          return (
                            <span
                              className={`badge badge-${unified.color}`}
                              data-tooltip={
                                unified.color === "local"
                                  ? "Hand-delivered locally — no courier or AWB involved"
                                  : undefined
                              }
                            >
                              {unified.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td style={{ padding: "16px" }}>
                        {!order.shiprocket_awb_code &&
                        order.status !== "cancelled" &&
                        !isLocalOrder(order) ? (
                          <span
                            className="badge badge-warning"
                            style={{ gap: "5px" }}
                            data-tooltip="Margin is a pre-purchase estimate until an AWB is assigned"
                          >
                            <AlertTriangle size={12} />
                            Pending AWB
                          </span>
                        ) : (
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
                            ₹{formatCurrency(Math.abs(order.profit_loss || 0))}
                          </span>
                        )}
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
