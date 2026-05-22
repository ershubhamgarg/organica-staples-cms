import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Package,
  Truck,
  CreditCard,
  MapPin,
  Loader2,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  X,
} from "lucide-react";
import { useOrderStore, type Order } from "../store/orderStore";

export default function OrderDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getOrderById, updateOrderStatus, isLoading } = useOrderStore();
  const [order, setOrder] = useState<Order | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  useEffect(() => {
    if (id) {
      getOrderById(id).then(setOrder);
    }
  }, [id, getOrderById]);

  const handleStatusUpdate = async (newStatus: string) => {
    if (!id) return;

    if (newStatus === "rejected") {
      setShowRejectionModal(true);
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

  if (!order) {
    return (
      <div
        style={{ display: "flex", justifyContent: "center", padding: "4rem" }}
      >
        <Loader2
          className="animate-spin"
          size={48}
          color="var(--accent-primary)"
        />
      </div>
    );
  }

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
          marginBottom: "2rem",
        }}
      >
        <div>
          <h1 className="page-title">
            Order #ORD-{order.id.slice(0, 8).toUpperCase()}
          </h1>
          <p className="page-subtitle">
            Placed on {new Date(order.created_at).toLocaleString()}
          </p>
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
              disabled={isUpdating}
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
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="processing">Processing</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          {order.status === "rejected" && order.rejection_reason && (
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
              <span>Reason: {order.rejection_reason}</span>
            </div>
          )}
        </div>
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "2rem" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {/* Order Items */}
          <div className="glass-card" style={{ padding: "1.5rem" }}>
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
                    <div
                      style={{
                        width: "50px",
                        height: "50px",
                        background: "var(--bg-tertiary)",
                        borderRadius: "8px",
                        overflow: "hidden",
                      }}
                    >
                      <img
                        src={item.image}
                        alt={item.name}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{item.name}</div>
                      <div
                        style={{
                          fontSize: "0.85rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        Qty: {item.quantity} × ₹{item.price}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontWeight: 600 }}>
                    ₹{(item.price * item.quantity).toLocaleString()}
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
                  <span>₹{order.total_amount.toLocaleString()}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: "var(--text-secondary)",
                  }}
                >
                  <span>Shipping</span>
                  <span style={{ color: "var(--accent-primary)" }}>Free</span>
                </div>
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
                  <span>₹{order.total_amount.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {/* Customer Details */}
          <div className="glass-card" style={{ padding: "1.5rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "1.5rem",
              }}
            >
              <MapPin size={20} color="var(--accent-primary)" />
              <h3 style={{ fontSize: "1.1rem" }}>Delivery Address</h3>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: "1rem" }}>
                {order.delivery_address.name}
              </div>
              <div
                style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}
              >
                {order.delivery_address.email}
              </div>
              <div
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "0.9rem",
                  marginBottom: "1rem",
                }}
              >
                {order.delivery_address.phone}
              </div>
              <div
                style={{
                  padding: "1rem",
                  background: "var(--bg-primary)",
                  borderRadius: "var(--radius-md)",
                  fontSize: "0.9rem",
                  lineHeight: "1.6",
                }}
              >
                {order.delivery_address.address}
                <br />
                {order.delivery_address.city}, {order.delivery_address.zipCode}
              </div>
            </div>
          </div>

          {/* Payment Info */}
          <div className="glass-card" style={{ padding: "1.5rem" }}>
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
                padding: "1rem",
                background: "var(--bg-primary)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <div
                style={{
                  fontSize: "0.9rem",
                  color: "var(--text-secondary)",
                  marginBottom: "4px",
                }}
              >
                Method
              </div>
              <div style={{ fontWeight: 600, textTransform: "capitalize" }}>
                {order.payment_method}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Rejection Modal */}
      {showRejectionModal && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.8)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
          }}
        >
          <div
            className="glass-card"
            style={{
              width: "90%",
              maxWidth: "400px",
              padding: "2rem",
              position: "relative",
            }}
          >
            <button
              className="btn-ghost"
              onClick={() => setShowRejectionModal(false)}
              style={{ position: "absolute", top: "1rem", right: "1rem" }}
            >
              <X size={20} />
            </button>
            <h2
              style={{
                marginBottom: "1rem",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <XCircle color="var(--danger)" />
              Reject Order
            </h2>
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
                style={{
                  width: "100%",
                  minHeight: "100px",
                  padding: "0.75rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                }}
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
              <button
                className="btn btn-secondary"
                onClick={() => setShowRejectionModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ backgroundColor: "var(--danger)" }}
                disabled={!rejectionReason.trim() || isUpdating}
                onClick={handleConfirmRejection}
              >
                {isUpdating ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  "Confirm Rejection"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
