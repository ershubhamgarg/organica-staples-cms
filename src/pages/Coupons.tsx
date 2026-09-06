import { useEffect, useState } from "react";
import { Plus, Edit2, Trash2, TicketPercent } from "lucide-react";
import { toast } from "sonner";
import { useCouponStore, type Coupon } from "../store/couponStore";
import PageHeader from "../components/ui/PageHeader";
import ErrorBanner from "../components/ui/ErrorBanner";
import Spinner from "../components/ui/Spinner";
import EmptyState from "../components/ui/EmptyState";
import Card from "../components/ui/Card";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import IconButton from "../components/ui/IconButton";
import CopyButton from "../components/ui/CopyButton";
import { formatCurrency } from "../utils/currency";

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
  const [isSaving, setIsSaving] = useState(false);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);

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
      setIsSaving(true);
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
        toast.success("Coupon updated.");
      } else {
        await addCoupon(payload);
        toast.success("Coupon added.");
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error("Failed to save coupon:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save coupon.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (code: string) => {
    if (!window.confirm(`Delete coupon "${code}"?`)) return;
    try {
      setDeletingCode(code);
      await deleteCoupon(code);
      toast.success("Coupon deleted.");
    } catch (err) {
      console.error("Failed to delete coupon:", err);
      toast.error(err instanceof Error ? err.message : "Failed to delete coupon.");
    } finally {
      setDeletingCode(null);
    }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Coupons"
        subtitle="Manage discount codes offered at checkout."
        action={
          <Button icon={<Plus size={18} />} onClick={() => handleOpenModal()}>
            Add Coupon
          </Button>
        }
      />

      {error && <ErrorBanner message={error} />}

      <Card>
        <div style={{ overflowX: "auto" }}>
          {isLoading && coupons.length === 0 ? (
            <Spinner />
          ) : coupons.length === 0 ? (
            <EmptyState icon={TicketPercent} message="No coupons yet." />
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
                {coupons.map((coupon) => (
                  <tr
                    key={coupon.code}
                    style={{ borderBottom: "1px solid var(--border-color)" }}
                  >
                    <td
                      style={{
                        padding: "16px",
                        fontWeight: 600,
                        fontFamily: "monospace",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        {coupon.code}
                        <CopyButton value={coupon.code} label="Coupon Code" />
                      </div>
                    </td>
                    <td style={{ padding: "16px", color: "var(--text-secondary)" }}>
                      {coupon.label || "—"}
                    </td>
                    <td style={{ padding: "16px", fontWeight: 500 }}>
                      {coupon.percent}%
                    </td>
                    <td style={{ padding: "16px" }}>
                      {coupon.min_order_value != null
                        ? `₹${formatCurrency(coupon.min_order_value)}`
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
                        style={{ display: "flex", justifyContent: "flex-end", gap: "4px" }}
                      >
                        <IconButton
                          icon={<Edit2 size={16} />}
                          tooltip="Edit coupon"
                          onClick={() => handleOpenModal(coupon)}
                        />
                        <IconButton
                          icon={
                            deletingCode === coupon.code ? (
                              <Spinner size={16} padding="0" />
                            ) : (
                              <Trash2 size={16} />
                            )
                          }
                          tooltip="Delete coupon"
                          danger
                          disabled={deletingCode === coupon.code}
                          onClick={() => handleDelete(coupon.code)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {isModalOpen && (
        <Modal
          onClose={() => setIsModalOpen(false)}
          title={editingCode ? "Edit Coupon" : "Add New Coupon"}
          icon={<TicketPercent size={20} />}
          iconColor="var(--accent-primary)"
          maxWidth="500px"
          closeDisabled={isSaving}
        >
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
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsModalOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" loading={isSaving}>
                {editingCode ? "Update Coupon" : "Add Coupon"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
