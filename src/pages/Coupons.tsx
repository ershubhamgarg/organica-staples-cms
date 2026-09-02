import { useEffect, useState } from "react";
import { Plus, Edit2, Trash2, X, Loader2 } from "lucide-react";
import { useCouponStore, type Coupon } from "../store/couponStore";

const blankCoupon: Coupon = {
  code: "",
  percent: 0,
  label: "",
  is_active: true,
  is_public: true,
  min_order_value: null,
  valid_upto: null,
};

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export default function Coupons() {
  const {
    coupons,
    isLoading,
    error,
    fetchCoupons,
    addCoupon,
    updateCoupon,
    deleteCoupon,
  } = useCouponStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [formData, setFormData] = useState<Coupon>(blankCoupon);

  useEffect(() => {
    fetchCoupons();
  }, [fetchCoupons]);

  const handleOpenModal = (coupon?: Coupon) => {
    if (coupon) {
      setEditingCode(coupon.code);
      setFormData({
        ...coupon,
        valid_upto: toDateInputValue(coupon.valid_upto),
      });
    } else {
      setEditingCode(null);
      setFormData(blankCoupon);
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: Coupon = {
        ...formData,
        code: formData.code.trim().toUpperCase(),
        valid_upto: formData.valid_upto
          ? new Date(formData.valid_upto).toISOString()
          : null,
      };

      if (editingCode) {
        const { code: _code, ...updates } = payload;
        void _code;
        await updateCoupon(editingCode, updates);
      } else {
        await addCoupon(payload);
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error("Failed to save coupon:", err);
    }
  };

  const handleDelete = async (code: string) => {
    if (window.confirm(`Delete coupon "${code}"?`)) {
      try {
        await deleteCoupon(code);
      } catch (err) {
        console.error("Failed to delete coupon:", err);
      }
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
          <h1 className="page-title">Coupons</h1>
          <p className="page-subtitle">
            Manage discount codes offered at checkout.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => handleOpenModal()}>
          <Plus size={18} />
          Add Coupon
        </button>
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
          {isLoading && coupons.length === 0 ? (
            <div
              style={{ display: "flex", justifyContent: "center", padding: "2rem" }}
            >
              <Loader2 className="animate-spin" />
            </div>
          ) : (
            <table
              style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--border-color)",
                    color: "var(--text-secondary)",
                    fontSize: "0.9rem",
                  }}
                >
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>Code</th>
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>Label</th>
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>Discount</th>
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>
                    Min Order
                  </th>
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>
                    Valid Upto
                  </th>
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>Status</th>
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
                {coupons.length > 0 ? (
                  coupons.map((coupon) => (
                    <tr
                      key={coupon.code}
                      style={{
                        borderBottom: "1px solid var(--border-color)",
                        transition: "background 0.2s",
                      }}
                    >
                      <td
                        style={{
                          padding: "16px",
                          fontWeight: 600,
                          fontFamily: "monospace",
                        }}
                      >
                        {coupon.code}
                      </td>
                      <td style={{ padding: "16px", color: "var(--text-secondary)" }}>
                        {coupon.label || "—"}
                      </td>
                      <td style={{ padding: "16px", fontWeight: 500 }}>
                        {coupon.percent}%
                      </td>
                      <td style={{ padding: "16px" }}>
                        {coupon.min_order_value != null
                          ? `₹${coupon.min_order_value.toLocaleString()}`
                          : "—"}
                      </td>
                      <td style={{ padding: "16px" }}>
                        {coupon.valid_upto
                          ? new Date(coupon.valid_upto).toLocaleDateString()
                          : "No expiry"}
                      </td>
                      <td style={{ padding: "16px" }}>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          <span
                            className={`badge badge-${coupon.is_active ? "success" : "secondary"}`}
                          >
                            {coupon.is_active ? "Active" : "Inactive"}
                          </span>
                          {!coupon.is_public && (
                            <span className="badge badge-warning">Private</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "16px", textAlign: "right" }}>
                        <div
                          style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}
                        >
                          <button
                            className="btn-ghost"
                            onClick={() => handleOpenModal(coupon)}
                            style={{
                              padding: "6px",
                              borderRadius: "6px",
                              color: "var(--text-secondary)",
                            }}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            className="btn-ghost"
                            onClick={() => handleDelete(coupon.code)}
                            style={{
                              padding: "6px",
                              borderRadius: "6px",
                              color: "var(--danger)",
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        padding: "2rem",
                        textAlign: "center",
                        color: "var(--text-secondary)",
                      }}
                    >
                      No coupons yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            className="glass-card"
            style={{
              width: "90%",
              maxWidth: "500px",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "2rem",
              position: "relative",
            }}
          >
            <button
              className="btn-ghost"
              onClick={() => setIsModalOpen(false)}
              style={{ position: "absolute", top: "1rem", right: "1rem" }}
            >
              <X size={24} />
            </button>
            <h2 style={{ marginBottom: "1.5rem" }}>
              {editingCode ? "Edit Coupon" : "Add New Coupon"}
            </h2>
            <form onSubmit={handleSubmit}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "1rem",
                  marginBottom: "1.5rem",
                }}
              >
                <div className="form-group" style={{ gridColumn: "span 2" }}>
                  <label>Code</label>
                  <input
                    type="text"
                    required
                    disabled={!!editingCode}
                    value={formData.code}
                    onChange={(e) =>
                      setFormData({ ...formData, code: e.target.value })
                    }
                    style={{ textTransform: "uppercase" }}
                  />
                </div>
                <div className="form-group" style={{ gridColumn: "span 2" }}>
                  <label>Label</label>
                  <input
                    type="text"
                    placeholder="e.g. Raksha Bandhan Special – 10% Off"
                    value={formData.label ?? ""}
                    onChange={(e) =>
                      setFormData({ ...formData, label: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Discount %</label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={100}
                    value={formData.percent}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        percent: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Min Order Value (₹)</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.min_order_value ?? ""}
                    placeholder="No minimum"
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        min_order_value: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  />
                </div>
                <div className="form-group" style={{ gridColumn: "span 2" }}>
                  <label>Valid Upto</label>
                  <input
                    type="date"
                    value={formData.valid_upto ?? ""}
                    onChange={(e) =>
                      setFormData({ ...formData, valid_upto: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          is_active: e.target.checked,
                        })
                      }
                      style={{ width: "auto" }}
                    />
                    Active
                  </label>
                </div>
                <div className="form-group">
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.is_public}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          is_public: e.target.checked,
                        })
                      }
                      style={{ width: "auto" }}
                    />
                    Public (listed to customers)
                  </label>
                </div>
              </div>
              <div
                style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : editingCode ? (
                    "Update Coupon"
                  ) : (
                    "Add Coupon"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
