import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  Package,
  CreditCard,
  MapPin,
  XCircle,
  AlertCircle,
  AlertTriangle,
  Truck,
  ExternalLink,
  Ban,
  RefreshCcw,
  Weight,
  Download,
  IndianRupee,
} from "lucide-react";
import { useOrderStore, type Order, type RefundMode } from "../store/orderStore";
import { supabase } from "../utils/supabase";
import Spinner from "../components/ui/Spinner";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import CopyButton from "../components/ui/CopyButton";
import InfoRow from "../components/ui/InfoRow";
import ProductImage from "../components/ui/ProductImage";
import { getProductThumbnail } from "../utils/productImage";
import { formatCurrency } from "../utils/currency";
import { getOrderGrossWeightKg, formatWeight } from "../utils/weight";
import { formatDateTime } from "../utils/date";
import { displayNumber, parseNumberInput } from "../utils/number";
import { isLocalOrder } from "../utils/localOrder";
import { getShippingStatusColor, formatShippingStatusLabel } from "../utils/shippingStatus";

const canRefundOrder = (order: Order) =>
  order.payment_method === "razorpay" &&
  Boolean(order.payment_details?.provider_payment_id);

export default function OrderDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const getOrderById = useOrderStore((state) => state.getOrderById);
  const updateOrderStatus = useOrderStore((state) => state.updateOrderStatus);
  const cancelOrderWithRefund = useOrderStore(
    (state) => state.cancelOrderWithRefund,
  );
  const refundOrder = useOrderStore((state) => state.refundOrder);
  const checkRefundStatus = useOrderStore((state) => state.checkRefundStatus);
  const syncShippingDetails = useOrderStore(
    (state) => state.syncShippingDetails,
  );
  const [order, setOrder] = useState<Order | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [refundMode, setRefundMode] = useState<RefundMode>("full");
  const [refundAmount, setRefundAmount] = useState(0);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showShippingModal, setShowShippingModal] = useState(false);
  const [shipOrderId, setShipOrderId] = useState("");
  const [shipShipmentId, setShipShipmentId] = useState("");
  const [shipAwbCode, setShipAwbCode] = useState("");
  const [isSyncingShipping, setIsSyncingShipping] = useState(false);
  const [isDownloadingInvoice, setIsDownloadingInvoice] = useState(false);
  const [isRefreshingTracking, setIsRefreshingTracking] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [standaloneRefundMode, setStandaloneRefundMode] =
    useState<Exclude<RefundMode, "none">>("full");
  const [standaloneRefundAmount, setStandaloneRefundAmount] = useState(0);
  const [standaloneRefundReason, setStandaloneRefundReason] = useState("");
  const [isRefunding, setIsRefunding] = useState(false);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    getOrderById(id).then((fetchedOrder) => {
      if (cancelled) return;
      setOrder(fetchedOrder);

      // Shiprocket status can change between visits (in transit, delivered,
      // etc.) — pull the latest the moment the page opens rather than
      // showing whatever was last saved, but only when there's an AWB to
      // look up and the shipment isn't already in a terminal state.
      const awbCode = fetchedOrder?.shiprocket_awb_code;
      const isTerminal =
        fetchedOrder?.status === "delivered" ||
        fetchedOrder?.status === "cancelled" ||
        fetchedOrder?.shipping_status === "delivered" ||
        fetchedOrder?.shipping_status === "cancelled";

      if (awbCode && !isTerminal) {
        setIsRefreshingTracking(true);
        syncShippingDetails(id, { awbCode })
          .then((result) => {
            if (!cancelled) setOrder(result.order);
          })
          .catch((err) => {
            console.error("Failed to refresh shipment tracking:", err);
          })
          .finally(() => {
            if (!cancelled) setIsRefreshingTracking(false);
          });
      }

      // A refund issued directly on the Razorpay dashboard (rather than
      // through this app's Cancel Order / Issue Refund actions) would
      // otherwise never be reflected here — reconcile against Razorpay's
      // own refund record every time the page loads. Merges only the
      // refund-related fields (not a full setOrder(result.order)) so this
      // doesn't race with the shipping-tracking refresh above and
      // momentarily revert whichever one lands second.
      if (fetchedOrder && canRefundOrder(fetchedOrder)) {
        checkRefundStatus(id)
          .then((result) => {
            if (cancelled || !result.refund.changed) return;
            setOrder((prev) =>
              prev
                ? {
                    ...prev,
                    razorpay_refund_id: result.order.razorpay_refund_id,
                    refund_status: result.order.refund_status,
                    refund_amount: result.order.refund_amount,
                    refunded_at: result.order.refunded_at,
                    refund_checked_at: result.order.refund_checked_at,
                  }
                : prev,
            );
            toast.info(
              `Refund status updated from Razorpay — ₹${formatCurrency(result.refund.amount ?? 0)} ${result.refund.status ?? "recorded"}.`,
            );
          })
          .catch((err) => {
            console.error("Failed to check refund status:", err);
          });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [id, getOrderById, syncShippingDetails, checkRefundStatus]);

  const profit = order?.profit_loss || 0;
  const profitMargin =
    order && order.total_amount > 0 ? (profit / order.total_amount) * 100 : 0;
  const profitStatus =
    profit > 0 ? "Profit" : profit < 0 ? "Loss" : "No Profit/Loss";
  const profitColor =
    profit > 0
      ? "var(--success)"
      : profit < 0
        ? "var(--danger)"
        : "var(--text-secondary)";
  const profitBg =
    profit > 0
      ? "rgba(34, 197, 94, 0.1)"
      : profit < 0
        ? "rgba(239, 68, 68, 0.1)"
        : "rgba(148, 163, 184, 0.1)";
  const isLocal = order ? isLocalOrder(order) : false;
  // Cost to company / profit are only ever computed from a pre-purchase
  // Shiprocket rate estimate at order creation — sync-shipping.ts corrects
  // them to the real charge once an AWB is actually assigned (see
  // PROJECT_CONTEXT.md's "Margin correction on actual AWB assignment").
  // Showing that estimate as if it were final margin before then is
  // actively misleading (real gaps of 2-3x have been observed), so it's
  // hidden in favor of a prompt to assign one. Cancelled orders never get
  // an AWB and are excluded from profit reporting elsewhere already, so
  // they're not gated the same way — and neither are local orders, which
  // are hand-delivered and never get an AWB by design, not because one is
  // outstanding; their cost_to_company was already final at order creation
  // (zero shipping component, correctly, rather than an unresolved estimate).
  const awbPending =
    !order?.shiprocket_awb_code && order?.status !== "cancelled" && !isLocal;

  // Independent of order.status — unlike the refund bundled into cancellation
  // (which refuses to run once an order is already cancelled), a standalone
  // refund should be available for a delivered order (a return), a retry
  // after a failed refund, or a second partial refund, as long as there's
  // still an unrefunded balance on a Razorpay-paid order.
  const refundableBalance = order
    ? order.total_amount - (order.refund_amount || 0)
    : 0;
  const canIssueStandaloneRefund =
    order != null && canRefundOrder(order) && refundableBalance > 0.005;

  const handleStatusUpdate = async (newStatus: string) => {
    if (!id || !order) return;

    if (newStatus === "rejected") {
      setShowRejectionModal(true);
      return;
    }

    if (newStatus === "cancelled") {
      if (order.status === "cancelled" || order.status === "delivered") {
        toast.error(`Cannot cancel an order that is already ${order.status}.`);
        return;
      }
      setCancelReason("");
      setRefundMode(canRefundOrder(order) ? "full" : "none");
      setRefundAmount(order.total_amount);
      setShowCancelModal(true);
      return;
    }

    try {
      setIsUpdating(true);
      await updateOrderStatus(id, newStatus);
      const updatedOrder = await getOrderById(id);
      setOrder(updatedOrder);
    } catch (err) {
      console.error("Failed to update status:", err);
      alert("Failed to update status");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConfirmRejection = async () => {
    if (!id || !rejectionReason.trim()) return;

    try {
      setIsUpdating(true);
      await updateOrderStatus(id, "rejected", rejectionReason);
      const updatedOrder = await getOrderById(id);
      setOrder(updatedOrder);
      setShowRejectionModal(false);
      setRejectionReason("");
    } catch (err) {
      console.error("Failed to reject order:", err);
      alert("Failed to reject order");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!id || !cancelReason.trim()) return;

    if (
      refundMode === "partial" &&
      (!(refundAmount > 0) || refundAmount > (order?.total_amount ?? 0))
    ) {
      toast.error("Refund amount must be greater than 0 and no more than the order total.");
      return;
    }

    try {
      setIsCancelling(true);
      const result = await cancelOrderWithRefund(id, {
        reason: cancelReason,
        refund: {
          mode: refundMode,
          amount: refundMode === "partial" ? refundAmount : undefined,
        },
      });

      setOrder(result.order);
      setShowCancelModal(false);
      setCancelReason("");

      if (result.shipment.attempted && !result.shipment.success) {
        toast.error("Shipment cancellation failed", {
          description: result.shipment.message ?? undefined,
        });
      } else if (result.shipment.success) {
        toast.success("Shipment cancelled.");
      }

      if (result.refund.attempted && !result.refund.success) {
        toast.error("Refund failed", {
          description: result.refund.message ?? undefined,
        });
      } else if (result.refund.success) {
        toast.success(
          `Refund of ₹${formatCurrency(result.refund.amount)} ${result.refund.status}.`,
        );
      }

      if (!result.shipment.attempted && !result.refund.attempted) {
        toast.success("Order cancelled.");
      }
    } catch (err) {
      console.error("Failed to cancel order:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to cancel order.",
      );
    } finally {
      setIsCancelling(false);
    }
  };

  const handleOpenRefundModal = () => {
    setStandaloneRefundMode("full");
    setStandaloneRefundAmount(refundableBalance);
    setStandaloneRefundReason("");
    setShowRefundModal(true);
  };

  const handleConfirmRefund = async () => {
    if (!id || !standaloneRefundReason.trim()) return;

    if (
      standaloneRefundMode === "partial" &&
      (!(standaloneRefundAmount > 0) ||
        standaloneRefundAmount > refundableBalance)
    ) {
      toast.error(
        `Refund amount must be greater than 0 and no more than ₹${formatCurrency(refundableBalance)}.`,
      );
      return;
    }

    try {
      setIsRefunding(true);
      const result = await refundOrder(id, {
        reason: standaloneRefundReason,
        mode: standaloneRefundMode,
        amount:
          standaloneRefundMode === "partial"
            ? standaloneRefundAmount
            : undefined,
      });

      setOrder(result.order);
      setShowRefundModal(false);
      setStandaloneRefundReason("");
      toast.success(
        `Refund of ₹${formatCurrency(result.refund.amount ?? 0)} ${result.refund.status}.`,
      );
    } catch (err) {
      console.error("Failed to refund order:", err);
      toast.error(err instanceof Error ? err.message : "Failed to refund order.");
    } finally {
      setIsRefunding(false);
    }
  };

  const handleOpenShippingModal = () => {
    setShipOrderId(order?.shiprocket_order_id ?? "");
    setShipShipmentId(order?.shiprocket_shipment_id ?? "");
    setShipAwbCode(order?.shiprocket_awb_code ?? "");
    setShowShippingModal(true);
  };

  const handleConfirmSyncShipping = async () => {
    if (!id) return;

    const shiprocketOrderId = shipOrderId.trim() || undefined;
    const shiprocketShipmentId = shipShipmentId.trim() || undefined;
    const awbCode = shipAwbCode.trim() || undefined;

    if (!shiprocketOrderId && !shiprocketShipmentId && !awbCode) {
      toast.error("Enter at least one of Order ID, Shipment ID, or AWB Code.");
      return;
    }

    try {
      setIsSyncingShipping(true);
      const result = await syncShippingDetails(id, {
        shiprocketOrderId,
        shiprocketShipmentId,
        awbCode,
      });

      setOrder(result.order);
      setShowShippingModal(false);

      if (result.tracking.attempted && !result.tracking.success) {
        toast.error("Saved the IDs, but tracking lookup failed", {
          description: result.tracking.message ?? undefined,
        });
      } else if (result.tracking.success) {
        toast.success(
          result.tracking.courierName
            ? `Tracking updated — ${result.tracking.courierName}, status: ${result.tracking.status}.`
            : "Tracking updated.",
        );
      } else {
        toast.success("Shipping details saved.");
      }

      // Once Shiprocket has actually assigned a courier, its real freight
      // charge can differ from the pre-purchase estimate the order's margin
      // was originally computed with — reflect that correction to the admin
      // so a changed profit figure doesn't look unexplained.
      if (result.costCorrection.attempted) {
        if (!result.costCorrection.success) {
          toast.error("Could not verify the actual shipping cost with Shiprocket", {
            description: result.costCorrection.message ?? undefined,
          });
        } else if (result.costCorrection.delta && Math.abs(result.costCorrection.delta) >= 0.01) {
          toast.success("Margin recalculated using the actual shipping cost", {
            description: result.costCorrection.message ?? undefined,
          });
        }
      }
    } catch (err) {
      console.error("Failed to update shipping details:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to update shipping details.",
      );
    } finally {
      setIsSyncingShipping(false);
    }
  };

  const handleDownloadInvoice = async () => {
    if (!order) return;

    try {
      setIsDownloadingInvoice(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("You must be signed in to download invoices.");
        return;
      }

      const response = await fetch(
        `/api/orders/invoice?orderId=${encodeURIComponent(order.id)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "Failed to download invoice.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(order.invoice_number || order.id).replace(/\//g, "-")}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download invoice:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to download invoice.",
      );
    } finally {
      setIsDownloadingInvoice(false);
    }
  };

  if (!order) {
    return <Spinner size={48} padding="4rem" />;
  }

  const getRefundBadgeColor = (status: string | null | undefined) => {
    if (!status) return "secondary";
    switch (status.toLowerCase()) {
      case "processed":
        return "success";
      case "pending":
        return "warning";
      case "failed":
        return "danger";
      default:
        return "secondary";
    }
  };

  return (
    <div className="animate-fade-in">
      <button
        onClick={() => navigate("/orders")}
        className="btn-ghost"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "1.5rem",
          padding: "0",
        }}
      >
        <ArrowLeft size={18} />
        Back to Orders
      </button>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        <div>
          <h1
            className="page-title"
            style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}
          >
            Order #ORD-{order.id.slice(0, 8).toUpperCase()}
            <CopyButton value={order.id} label="Order ID" />
          </h1>
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: "4px",
            }}
          >
            <p className="page-subtitle" style={{ margin: 0 }}>
              Placed on {formatDateTime(order.created_at)}
            </p>
            <span
              className="badge badge-secondary"
              style={{ fontSize: "0.75rem", gap: "5px" }}
            >
              <Weight size={12} />
              {formatWeight(getOrderGrossWeightKg(order.items))}
            </span>
            {isLocal ? (
              <span
                className="badge badge-local"
                style={{ fontSize: "0.75rem", gap: "5px" }}
                data-tooltip="Hand-delivered locally — no courier or AWB involved"
              >
                <MapPin size={12} />
                Local Delivery
              </span>
            ) : (
              order.shipping_status && (
                <span
                  className={`badge badge-${getShippingStatusColor(order.shipping_status)}`}
                  style={{ fontSize: "0.75rem" }}
                >
                  Shipping: {formatShippingStatusLabel(order.shipping_status)}
                </span>
              )
            )}
            {isRefreshingTracking && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "0.75rem",
                  color: "var(--text-secondary)",
                }}
              >
                <RefreshCcw size={12} className="animate-spin" />
                Refreshing tracking…
              </span>
            )}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "0.5rem",
          }}
        >
          <div style={{ display: "flex", gap: "1rem" }}>
            <select
              value={order.status}
              onChange={(e) => handleStatusUpdate(e.target.value)}
              disabled={isUpdating || isCancelling}
              className="input-field"
              style={{
                width: "auto",
                padding: "8px 16px",
                borderRadius: "8px",
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-color)",
              }}
            >
              {isLocal ? (
                <>
                  {/* Local orders are hand-delivered, never shipped via a
                      courier — there's no "Pending" or "Shipped" step to
                      pass through, just processing until it's handed over. */}
                  <option value="processing">Processing</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                  {!["processing", "delivered", "cancelled"].includes(
                    order.status,
                  ) && <option value={order.status}>{order.status}</option>}
                </>
              ) : (
                <>
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="shipped">Shipped</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </>
              )}
            </select>
          </div>
          {(order.rejection_reason || order.cancellation_reason) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                color: "var(--danger)",
                fontSize: "0.9rem",
                background: "rgba(239, 68, 68, 0.1)",
                padding: "4px 12px",
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
              }}
            >
              <AlertCircle size={14} />
              <span>
                {order.cancellation_reason
                  ? `Cancellation reason: ${order.cancellation_reason}`
                  : `Reason: ${order.rejection_reason}`}
              </span>
            </div>
          )}
        </div>
      </div>

      <div
        className="responsive-grid"
        style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "2rem" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {/* Order Items */}
          <div className="card" style={{ padding: "1.5rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "1.5rem",
              }}
            >
              <Package size={20} color="var(--accent-primary)" />
              <h3 style={{ fontSize: "1.1rem" }}>Order Items</h3>
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              {order.items.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "1rem",
                    background: "var(--bg-primary)",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: "1rem",
                      alignItems: "center",
                    }}
                  >
                    <ProductImage
                      src={getProductThumbnail(item)}
                      alt={item.name}
                      size={50}
                    />
                    <div>
                      <div style={{ fontWeight: 600 }}>{item.name}</div>
                      <div
                        style={{
                          fontSize: "0.85rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        Qty: {item.quantity} × ₹{formatCurrency(item.price)}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontWeight: 600 }}>
                    ₹{formatCurrency(item.price * item.quantity)}
                  </div>
                </div>
              ))}
              <div
                style={{
                  marginTop: "1rem",
                  padding: "1rem",
                  borderTop: "1px solid var(--border-color)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: "var(--text-secondary)",
                  }}
                >
                  <span>Subtotal</span>
                  <span>₹{formatCurrency(order.subtotal_amount)}</span>
                </div>

                {order.wholesale_total_amount ? (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      color: "var(--text-secondary)",
                      fontSize: "0.85rem",
                    }}
                  >
                    <span>Wholesale Total</span>
                    <span>
                      ₹{formatCurrency(order.wholesale_total_amount)}
                    </span>
                  </div>
                ) : null}

                {order.discount_amount && order.discount_amount > 0 ? (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      color: "var(--danger)",
                    }}
                  >
                    <span>
                      Discount{" "}
                      {order.discount_code ? `(${order.discount_code})` : ""}
                      {order.discount_percent
                        ? ` [${order.discount_percent}%]`
                        : ""}
                    </span>
                    <span>-₹{formatCurrency(order.discount_amount)}</span>
                  </div>
                ) : null}

                {order.shipping_amount !== undefined && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <span>Shipping (Customer Paid)</span>
                    <span
                      style={{
                        color:
                          order.shipping_amount && order.shipping_amount > 0
                            ? "var(--text-primary)"
                            : "var(--accent-primary)",
                      }}
                    >
                      {order.shipping_amount && order.shipping_amount > 0
                        ? `₹${formatCurrency(order.shipping_amount)}`
                        : "Free"}
                    </span>
                  </div>
                )}

                {order.extra_shipping_amount &&
                order.extra_shipping_amount > 0 ? (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      color: "var(--text-secondary)",
                      fontSize: "0.85rem",
                    }}
                  >
                    <span>Extra Shipping (Paid by Us)</span>
                    <span style={{ color: "var(--danger)" }}>
                      -₹{formatCurrency(order.extra_shipping_amount)}
                    </span>
                  </div>
                ) : null}

                {order.convenience_fee_amount &&
                order.convenience_fee_amount > 0 ? (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      color: "var(--text-secondary)",
                      fontSize: "0.85rem",
                    }}
                  >
                    <span>Convenience Fee</span>
                    <span>
                      ₹{formatCurrency(order.convenience_fee_amount)}
                    </span>
                  </div>
                ) : null}

                {order.cod_amount && order.cod_amount > 0 ? (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      color: "var(--text-secondary)",
                      fontSize: "0.85rem",
                    }}
                  >
                    <span>COD Charges</span>
                    <span>₹{formatCurrency(order.cod_amount)}</span>
                  </div>
                ) : null}

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "1.2rem",
                    fontWeight: 700,
                    marginTop: "0.5rem",
                  }}
                >
                  <span>Total</span>
                  <span>₹{formatCurrency(order.total_amount)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Profit Analysis */}
          <div className="card" style={{ padding: "1.5rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "1.5rem",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: awbPending ? "rgba(183, 121, 31, 0.12)" : profitBg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: awbPending ? "var(--warning)" : profitColor,
                }}
              >
                {awbPending ? <AlertTriangle size={20} /> : <AlertCircle size={20} />}
              </div>
              <div>
                <h3 style={{ fontSize: "1.1rem", marginBottom: "2px" }}>
                  Profit Analysis
                </h3>
                <p
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  {awbPending
                    ? "Awaiting AWB assignment"
                    : profitStatus === "No Profit/Loss"
                      ? "Break-even point"
                      : `Total ${profitStatus.toLowerCase()} for this order`}
                </p>
              </div>
            </div>

            {awbPending ? (
              <div
                style={{
                  padding: "1rem",
                  background: "rgba(183, 121, 31, 0.08)",
                  border: "1px solid rgba(183, 121, 31, 0.25)",
                  borderRadius: "var(--radius-md)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "8px",
                    fontSize: "0.85rem",
                    color: "var(--text-primary)",
                  }}
                >
                  <AlertTriangle
                    size={16}
                    color="var(--warning)"
                    style={{ flexShrink: 0, marginTop: "2px" }}
                  />
                  <span>
                    Margin isn&apos;t final yet — the cost on file is only a
                    pre-purchase Shiprocket estimate. Assign an AWB to lock in
                    the actual shipping cost and calculate real profit.
                  </span>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<RefreshCcw size={14} />}
                  onClick={handleOpenShippingModal}
                  style={{ alignSelf: "flex-start" }}
                >
                  Assign AWB
                </Button>
              </div>
            ) : (
              <>
                <div
                  className="responsive-grid"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem",
                  }}
                >
                  <div
                    style={{
                      padding: "1rem",
                      background: "var(--bg-primary)",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: "var(--text-secondary)",
                        marginBottom: "4px",
                      }}
                    >
                      {profitStatus === "Loss" ? "Net Loss" : "Net Profit"}
                    </div>
                    <div
                      style={{
                        fontSize: "1.25rem",
                        fontWeight: 700,
                        color: profitColor,
                      }}
                    >
                      ₹{formatCurrency(Math.abs(profit))}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "1rem",
                      background: "var(--bg-primary)",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: "var(--text-secondary)",
                        marginBottom: "4px",
                      }}
                    >
                      Margin
                    </div>
                    <div
                      style={{
                        fontSize: "1.25rem",
                        fontWeight: 700,
                        color: profitColor,
                      }}
                    >
                      {profitMargin.toFixed(2)}%
                    </div>
                  </div>
                </div>

                {order.cost_to_company ? (
                  <div
                    style={{
                      marginTop: "1.5rem",
                      padding: "1rem",
                      background: "var(--bg-primary)",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "0.85rem",
                      }}
                    >
                      <span style={{ color: "var(--text-secondary)" }}>
                        Cost to Company (CTC)
                      </span>
                      <span style={{ fontWeight: 600 }}>
                        ₹{formatCurrency(order.cost_to_company)}
                      </span>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {/* Customer Details */}
          <div className="card" style={{ padding: "1.5rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "1.25rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <MapPin size={20} color="var(--accent-primary)" />
                <h3 style={{ fontSize: "1.1rem" }}>Delivery Address</h3>
              </div>
              <CopyButton
                value={[
                  order.delivery_address.name,
                  order.delivery_address.phone,
                  order.delivery_address.email,
                  order.delivery_address.address,
                  [
                    order.delivery_address.city,
                    order.delivery_address.state,
                    order.delivery_address.zipCode,
                  ]
                    .filter(Boolean)
                    .join(", "),
                  order.delivery_address.country,
                ]
                  .filter(Boolean)
                  .join("\n")}
                label="Address"
              />
            </div>
            <div
              style={{ fontWeight: 600, fontSize: "1rem", marginBottom: "4px" }}
            >
              {order.delivery_address.name}
            </div>
            <div>
              {order.delivery_address.email && (
                <InfoRow
                  label="Email"
                  value={order.delivery_address.email}
                  copyValue={order.delivery_address.email}
                />
              )}
              {order.delivery_address.phone && (
                <InfoRow
                  label="Phone"
                  value={order.delivery_address.phone}
                  copyValue={order.delivery_address.phone}
                />
              )}
              <InfoRow
                label="Address"
                stacked
                copyValue={[
                  order.delivery_address.address,
                  [
                    order.delivery_address.city,
                    order.delivery_address.state,
                    order.delivery_address.zipCode,
                  ]
                    .filter(Boolean)
                    .join(", "),
                  order.delivery_address.country,
                ]
                  .filter(Boolean)
                  .join("\n")}
                value={
                  <>
                    {order.delivery_address.address}
                    <br />
                    {order.delivery_address.city},{" "}
                    {order.delivery_address.state &&
                      `${order.delivery_address.state}, `}
                    {order.delivery_address.zipCode}
                    {order.delivery_address.country && (
                      <>
                        <br />
                        {order.delivery_address.country}
                      </>
                    )}
                  </>
                }
              />
            </div>
          </div>

          {/* Payment Info */}
          <div className="card" style={{ padding: "1.5rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "1.5rem",
              }}
            >
              <CreditCard size={20} color="var(--accent-primary)" />
              <h3 style={{ fontSize: "1.1rem" }}>Payment Information</h3>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
              }}
            >
              <div className="card-subsection">
                <div className="eyebrow" style={{ marginBottom: "6px" }}>
                  Payment Method
                </div>
                <InfoRow
                  label="Method"
                  value={
                    <span style={{ textTransform: "uppercase" }}>
                      {order.payment_method}
                    </span>
                  }
                />
                {order.payment_details && (
                  <>
                    <InfoRow
                      label="Provider"
                      value={order.payment_details.provider}
                    />
                    <InfoRow
                      label="Transaction ID"
                      value={order.payment_details.provider_payment_id}
                      copyValue={order.payment_details.provider_payment_id}
                      mono
                      stacked
                    />
                    <InfoRow
                      label="Status"
                      value={order.payment_details.status}
                      valueColor="var(--success)"
                    />
                    {order.payment_details.verified_at && (
                      <InfoRow
                        label="Verified At"
                        value={formatDateTime(order.payment_details.verified_at)}
                      />
                    )}
                  </>
                )}
              </div>

              <div className="card-subsection">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "6px",
                  }}
                >
                  <span className="eyebrow">GST Invoice</span>
                  {order.invoice_pdf_path && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Download size={14} />}
                      loading={isDownloadingInvoice}
                      onClick={handleDownloadInvoice}
                    >
                      Download
                    </Button>
                  )}
                </div>
                {order.invoice_number ? (
                  <>
                    <InfoRow
                      label="Invoice Number"
                      value={order.invoice_number}
                      copyValue={order.invoice_number}
                      mono
                      stacked
                    />
                    {order.invoice_generated_at && (
                      <InfoRow
                        label="Generated"
                        value={formatDateTime(order.invoice_generated_at)}
                      />
                    )}
                  </>
                ) : (
                  <div
                    style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}
                  >
                    Not yet generated
                  </div>
                )}
              </div>

              {(order.refund_status || canRefundOrder(order)) && (
                <div className="card-subsection">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "6px",
                    }}
                  >
                    <span className="eyebrow">Refund</span>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: "8px" }}
                    >
                      {order.refund_status && (
                        <span
                          className={`badge badge-${getRefundBadgeColor(order.refund_status)}`}
                        >
                          {order.refund_status.replace(/_/g, " ")}
                        </span>
                      )}
                      {canIssueStandaloneRefund && (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<IndianRupee size={14} />}
                          onClick={handleOpenRefundModal}
                        >
                          Issue Refund
                        </Button>
                      )}
                    </div>
                  </div>
                  {order.refund_amount != null && (
                    <InfoRow
                      label="Refund Amount"
                      value={`₹${formatCurrency(order.refund_amount)}`}
                    />
                  )}
                  {order.razorpay_refund_id && (
                    <InfoRow
                      label="Refund ID"
                      value={order.razorpay_refund_id}
                      copyValue={order.razorpay_refund_id}
                      mono
                      stacked
                    />
                  )}
                  {order.refunded_at && (
                    <InfoRow
                      label="Refunded At"
                      value={formatDateTime(order.refunded_at)}
                    />
                  )}
                  {order.refund_status && !canIssueStandaloneRefund && (
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--text-secondary)",
                        marginTop: "4px",
                      }}
                    >
                      Fully refunded.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Shipping Logistics */}
          <div className="card" style={{ padding: "1.5rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "1.5rem",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <Truck size={20} color="var(--accent-primary)" />
                <h3 style={{ fontSize: "1.1rem" }}>Shipping & Logistics</h3>
              </div>
              {!isLocal && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RefreshCcw size={14} />}
                  onClick={handleOpenShippingModal}
                  style={{ color: "var(--accent-primary)" }}
                >
                  Update
                </Button>
              )}
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
              }}
            >
              {isLocal ? (
                <div className="card-subsection">
                  <div className="eyebrow" style={{ marginBottom: "6px" }}>
                    Delivery Method
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "8px",
                      fontSize: "0.85rem",
                      color: "var(--text-primary)",
                    }}
                  >
                    <MapPin
                      size={16}
                      color="var(--accent-primary)"
                      style={{ flexShrink: 0, marginTop: "2px" }}
                    />
                    <span>
                      This order is hand-delivered locally — no courier,
                      AWB, or Shiprocket tracking applies. Update its status
                      directly from the dropdown above as it moves through
                      processing and delivery.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="card-subsection">
                  <div className="eyebrow" style={{ marginBottom: "6px" }}>
                    Courier &amp; Tracking
                  </div>
                  <InfoRow
                    label="Courier Partner"
                    value={order.shiprocket_courier_name || "Not assigned"}
                  />
                  {order.shiprocket_awb_code && (
                    <InfoRow
                      label="AWB Code"
                      value={order.shiprocket_awb_code}
                      copyValue={order.shiprocket_awb_code}
                      mono
                      stacked
                    />
                  )}
                  {order.shiprocket_tracking_url && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        marginTop: "8px",
                      }}
                    >
                      <a
                        href={order.shiprocket_tracking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          fontSize: "0.85rem",
                          color: "var(--accent-primary)",
                          textDecoration: "none",
                        }}
                      >
                        Track Shipment <ExternalLink size={14} />
                      </a>
                    </div>
                  )}
                </div>
              )}

              {order.shipping_error && (
                <div
                  style={{
                    padding: "10px 12px",
                    background: "rgba(239, 68, 68, 0.1)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--danger)",
                      fontWeight: 600,
                      marginBottom: "2px",
                    }}
                  >
                    Logistics Error
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--danger)" }}>
                    {order.shipping_error}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Rejection Modal */}
      {showRejectionModal && (
        <Modal
          onClose={() => setShowRejectionModal(false)}
          title="Reject Order"
          icon={<XCircle size={20} />}
          maxWidth="400px"
          closeDisabled={isUpdating}
        >
          <p
            style={{
              color: "var(--text-secondary)",
              marginBottom: "1.5rem",
              fontSize: "0.9rem",
            }}
          >
            Please provide a reason for rejecting this order. This will be
            visible to the customer.
          </p>
          <div className="form-group">
            <label>Rejection Reason</label>
            <textarea
              autoFocus
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Out of stock, Delivery area not covered"
              style={{ minHeight: "100px" }}
            />
          </div>
          <div
            style={{
              display: "flex",
              gap: "1rem",
              justifyContent: "flex-end",
              marginTop: "1.5rem",
            }}
          >
            <Button
              variant="secondary"
              onClick={() => setShowRejectionModal(false)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!rejectionReason.trim()}
              loading={isUpdating}
              onClick={handleConfirmRejection}
            >
              Confirm Rejection
            </Button>
          </div>
        </Modal>
      )}

      {/* Cancel Order Modal */}
      {showCancelModal && order && (
        <Modal
          onClose={() => setShowCancelModal(false)}
          title="Cancel Order"
          icon={<Ban size={20} />}
          maxWidth="440px"
          closeDisabled={isCancelling}
        >
          <p
            style={{
              color: "var(--text-secondary)",
              marginBottom: "1.5rem",
              fontSize: "0.9rem",
            }}
          >
            {order.shiprocket_order_id
              ? "This will cancel the Shiprocket shipment for this order."
              : "This order has no shipment to cancel yet."}
          </p>

          <div className="form-group">
            <label>Cancellation Reason</label>
            <textarea
              autoFocus
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Customer requested cancellation"
              style={{ minHeight: "80px" }}
            />
          </div>

          {canRefundOrder(order) && (
            <div className="form-group" style={{ marginTop: "1rem" }}>
              <label>Refund</label>
              <select
                value={refundMode}
                onChange={(e) => setRefundMode(e.target.value as RefundMode)}
              >
                <option value="full">
                  Full refund (₹{formatCurrency(order.total_amount)})
                </option>
                <option value="partial">Partial refund</option>
                <option value="none">No refund</option>
              </select>

              {refundMode === "partial" && (
                <input
                  type="number"
                  min={1}
                  max={order.total_amount}
                  value={displayNumber(refundAmount)}
                  onChange={(e) => setRefundAmount(parseNumberInput(e.target.value))}
                  placeholder="Refund amount (₹)"
                  style={{ marginTop: "0.75rem" }}
                />
              )}
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: "1rem",
              justifyContent: "flex-end",
              marginTop: "1.5rem",
            }}
          >
            <Button
              variant="secondary"
              onClick={() => setShowCancelModal(false)}
              disabled={isCancelling}
            >
              Back
            </Button>
            <Button
              variant="danger"
              disabled={!cancelReason.trim()}
              loading={isCancelling}
              onClick={handleConfirmCancel}
            >
              Confirm Cancellation
            </Button>
          </div>
        </Modal>
      )}

      {/* Refund Modal */}
      {showRefundModal && order && (
        <Modal
          onClose={() => setShowRefundModal(false)}
          title="Issue Refund"
          icon={<IndianRupee size={20} />}
          maxWidth="440px"
          closeDisabled={isRefunding}
        >
          <p
            style={{
              color: "var(--text-secondary)",
              marginBottom: "1.5rem",
              fontSize: "0.9rem",
            }}
          >
            Refunds this order's Razorpay payment directly — the order's
            status is left as-is. Up to ₹{formatCurrency(refundableBalance)}{" "}
            can still be refunded.
          </p>

          <div className="form-group">
            <label>Refund Reason</label>
            <textarea
              autoFocus
              value={standaloneRefundReason}
              onChange={(e) => setStandaloneRefundReason(e.target.value)}
              placeholder="e.g. Damaged item returned, partial order shortfall"
              style={{ minHeight: "80px" }}
            />
          </div>

          <div className="form-group" style={{ marginTop: "1rem" }}>
            <label>Refund Amount</label>
            <select
              value={standaloneRefundMode}
              onChange={(e) =>
                setStandaloneRefundMode(
                  e.target.value as Exclude<RefundMode, "none">,
                )
              }
            >
              <option value="full">
                Full remaining balance (₹{formatCurrency(refundableBalance)})
              </option>
              <option value="partial">Partial refund</option>
            </select>

            {standaloneRefundMode === "partial" && (
              <input
                type="number"
                min={1}
                max={refundableBalance}
                value={displayNumber(standaloneRefundAmount)}
                onChange={(e) =>
                  setStandaloneRefundAmount(parseNumberInput(e.target.value))
                }
                placeholder="Refund amount (₹)"
                style={{ marginTop: "0.75rem" }}
              />
            )}
          </div>

          <div
            style={{
              display: "flex",
              gap: "1rem",
              justifyContent: "flex-end",
              marginTop: "1.5rem",
            }}
          >
            <Button
              variant="secondary"
              onClick={() => setShowRefundModal(false)}
              disabled={isRefunding}
            >
              Back
            </Button>
            <Button
              variant="danger"
              disabled={!standaloneRefundReason.trim()}
              loading={isRefunding}
              onClick={handleConfirmRefund}
            >
              Confirm Refund
            </Button>
          </div>
        </Modal>
      )}

      {/* Update Shipping Details Modal */}
      {showShippingModal && (
        <Modal
          onClose={() => setShowShippingModal(false)}
          title="Update Shipping Details"
          icon={<RefreshCcw size={20} />}
          iconColor="var(--accent-primary)"
          maxWidth="440px"
          closeDisabled={isSyncingShipping}
        >
          <p
            style={{
              color: "var(--text-secondary)",
              marginBottom: "1.5rem",
              fontSize: "0.9rem",
            }}
          >
            Use this when automatic Shiprocket sync failed. Enter whichever
            identifier you have — if you provide the AWB Code, courier name,
            status, and tracking link are fetched automatically.
          </p>

          <div className="form-group">
            <label>Shiprocket Order ID</label>
            <input
              type="text"
              value={shipOrderId}
              onChange={(e) => setShipOrderId(e.target.value)}
              placeholder="e.g. 123456789"
            />
          </div>
          <div className="form-group" style={{ marginTop: "1rem" }}>
            <label>Shipment ID</label>
            <input
              type="text"
              value={shipShipmentId}
              onChange={(e) => setShipShipmentId(e.target.value)}
              placeholder="e.g. 987654321"
            />
          </div>
          <div className="form-group" style={{ marginTop: "1rem" }}>
            <label>AWB Code</label>
            <input
              type="text"
              autoFocus
              value={shipAwbCode}
              onChange={(e) => setShipAwbCode(e.target.value)}
              placeholder="e.g. 141234567890"
            />
          </div>

          <div
            style={{
              display: "flex",
              gap: "1rem",
              justifyContent: "flex-end",
              marginTop: "1.5rem",
            }}
          >
            <Button
              variant="secondary"
              onClick={() => setShowShippingModal(false)}
              disabled={isSyncingShipping}
            >
              Cancel
            </Button>
            <Button
              disabled={
                !shipOrderId.trim() && !shipShipmentId.trim() && !shipAwbCode.trim()
              }
              loading={isSyncingShipping}
              onClick={handleConfirmSyncShipping}
            >
              Save & Sync
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
