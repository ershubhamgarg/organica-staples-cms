import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  PackageSearch,
  Weight,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useOrderStore, type Order } from "../store/orderStore";
import PageHeader from "../components/ui/PageHeader";
import ErrorBanner from "../components/ui/ErrorBanner";
import Spinner from "../components/ui/Spinner";
import EmptyState from "../components/ui/EmptyState";
import Card from "../components/ui/Card";
import CopyButton from "../components/ui/CopyButton";
import IconButton from "../components/ui/IconButton";
import { formatCurrency } from "../utils/currency";
import { getOrderGrossWeightKg, formatWeight } from "../utils/weight";
import { isLocalOrder } from "../utils/localOrder";
import { getUnifiedOrderStatus } from "../utils/shippingStatus";

type SortField =
  | "none"
  | "date"
  | "customer"
  | "total"
  | "weight"
  | "status"
  | "profitLoss";
type SortDirection = "asc" | "desc";

const sortFieldLabels: Record<Exclude<SortField, "none">, string> = {
  date: "Date",
  customer: "Customer",
  total: "Total",
  weight: "Weight",
  status: "Status",
  profitLoss: "Profit/Loss",
};

// Roughly the order a shipment progresses through, so sorting by status
// reads top-to-bottom as "furthest along" rather than alphabetically.
// Local orders (no courier involved at all) sort right after cancelled,
// and anything unrecognized falls back to alphabetical via the label.
const STATUS_RANK: Record<string, number> = {
  cancelled: 0,
  "shipment cancelled": 1,
  "local delivery": 2,
  pending: 3,
  processing: 4,
  created: 5,
  "awb assigned": 6,
  "in transit": 7,
  "out for delivery": 8,
  delivered: 9,
};

function getStatusSortKey(order: Order): [number, string] {
  const label = getUnifiedOrderStatus(order).label.toLowerCase();
  const rank = STATUS_RANK[label];
  return [rank === undefined ? 99 : rank, label];
}

function compareOrders(a: Order, b: Order, field: SortField): number {
  switch (field) {
    case "date":
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    case "customer":
      return (a.delivery_address?.name || "").localeCompare(
        b.delivery_address?.name || "",
      );
    case "total":
      return a.total_amount - b.total_amount;
    case "weight":
      return (
        getOrderGrossWeightKg(a.items) - getOrderGrossWeightKg(b.items)
      );
    case "status": {
      const [rankA, labelA] = getStatusSortKey(a);
      const [rankB, labelB] = getStatusSortKey(b);
      return rankA - rankB || labelA.localeCompare(labelB);
    }
    case "profitLoss":
      return (a.profit_loss || 0) - (b.profit_loss || 0);
    default:
      return 0;
  }
}

export default function Orders() {
  const { orders, isLoading, error, fetchOrders } = useOrderStore();
  const navigate = useNavigate();
  const [sortField, setSortField] = useState<SortField>("none");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const sortedOrders = useMemo(() => {
    if (sortField === "none") return orders;
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...orders].sort(
      (a, b) => compareOrders(a, b, sortField) * direction,
    );
  }, [orders, sortField, sortDirection]);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Orders"
        subtitle="Manage customer orders and track fulfillment."
      />

      {error && <ErrorBanner message={error} />}

      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: "1.25rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              className="input-field"
              style={{ width: "auto", padding: "8px 14px", fontSize: "0.85rem" }}
            >
              <option value="none">Sort by</option>
              {(Object.keys(sortFieldLabels) as (keyof typeof sortFieldLabels)[]).map(
                (field) => (
                  <option key={field} value={field}>
                    {sortFieldLabels[field]}
                  </option>
                ),
              )}
            </select>
            <IconButton
              icon={
                sortDirection === "asc" ? (
                  <ArrowUp size={16} />
                ) : (
                  <ArrowDown size={16} />
                )
              }
              tooltip={
                sortField === "none"
                  ? "Pick a field to sort"
                  : sortDirection === "asc"
                    ? "Ascending — click for descending"
                    : "Descending — click for ascending"
              }
              disabled={sortField === "none"}
              onClick={() =>
                setSortDirection((d) => (d === "asc" ? "desc" : "asc"))
              }
            />
          </div>
        </div>
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
                {sortedOrders.length > 0 ? (
                  sortedOrders.map((order) => (
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
