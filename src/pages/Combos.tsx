import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { useComboStore, type ComboSettings } from "../store/comboStore";
import { useProductStore } from "../store/productStore";
import PageHeader from "../components/ui/PageHeader";
import ErrorBanner from "../components/ui/ErrorBanner";
import Spinner from "../components/ui/Spinner";
import EmptyState from "../components/ui/EmptyState";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { formatCurrency } from "../utils/currency";
import { getStockStatus } from "../utils/stockStatus";
import { displayNumber, parseNumberInput } from "../utils/number";

/** One purchasable unit the storefront builder will offer. */
type EligibleUnit = {
  key: string;
  productId: string;
  productName: string;
  size: string;
  price: number;
  effectivePrice: number;
  availableQuantity: number | null;
  lowStockThreshold: number | null;
  isVisible: boolean;
};

export default function Combos() {
  const { settings, isLoading, isSaving, error, fetchSettings, updateSettings } =
    useComboStore();
  const {
    products,
    isLoading: productsLoading,
    fetchProducts,
  } = useProductStore();

  const [formData, setFormData] = useState<ComboSettings | null>(null);

  useEffect(() => {
    fetchSettings();
    fetchProducts();
  }, [fetchSettings, fetchProducts]);

  useEffect(() => {
    setFormData(settings);
  }, [settings]);

  // Mirrors app/api/combo/route.ts: a product with eligible variants is bought
  // as a variant, so its own flag is ignored in that case.
  const eligibleUnits = useMemo<EligibleUnit[]>(() => {
    const units: EligibleUnit[] = [];

    for (const product of products) {
      const isVisible = product.isVisible !== false;
      const variants = (product.variants ?? []).filter(
        (v) => v.is_active !== false && v.is_combo_eligible,
      );

      if (variants.length > 0) {
        for (const variant of variants) {
          units.push({
            key: `${product.id}-${variant.id}`,
            productId: product.id,
            productName: product.name,
            size: variant.label || variant.weight,
            price: variant.price,
            effectivePrice:
              variant.price * (1 - (variant.discount_percent ?? 0) / 100),
            availableQuantity: variant.available_quantity ?? null,
            lowStockThreshold: variant.low_stock_threshold ?? null,
            isVisible,
          });
        }
        continue;
      }

      if (!product.is_combo_eligible) continue;

      units.push({
        key: product.id,
        productId: product.id,
        productName: product.name,
        size: product.weight,
        price: product.price,
        effectivePrice: product.price * (1 - (product.discount ?? 0) / 100),
        availableQuantity: product.available_quantity ?? null,
        lowStockThreshold: product.low_stock_threshold ?? null,
        isVisible,
      });
    }

    return units.sort((a, b) => a.effectivePrice - b.effectivePrice);
  }, [products]);

  // The storefront hides any unit that is out of stock or on a hidden product,
  // so only these actually count towards a completable combo.
  const buyableUnits = useMemo(
    () =>
      eligibleUnits.filter(
        (unit) => unit.isVisible && (unit.availableQuantity ?? 0) > 0,
      ),
    [eligibleUnits],
  );

  const minItems = formData?.min_items ?? settings.min_items;
  const isShortOfMinimum = buyableUnits.length < minItems;
  const cheapestCombo = buyableUnits
    .slice(0, minItems)
    .reduce((sum, unit) => sum + unit.effectivePrice, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData) return;

    try {
      await updateSettings({
        is_enabled: formData.is_enabled,
        min_items: formData.min_items,
        title: formData.title.trim() || "Build Your Own Combo",
        subtitle: formData.subtitle?.trim() || null,
      });
      toast.success("Combo settings saved.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save combo settings.",
      );
    }
  };

  if (isLoading && !formData) {
    return <Spinner />;
  }

  return (
    <div>
      <PageHeader
        title="Combos"
        subtitle="Let customers assemble their own sampler pack from small pack sizes."
      />

      {error && <ErrorBanner message={error} />}

      {formData && (
        <form onSubmit={handleSubmit}>
          <Card style={{ marginBottom: "1.5rem" }}>
            <h2
              style={{
                fontSize: "1rem",
                fontWeight: 600,
                marginBottom: "1.25rem",
              }}
            >
              Rules
            </h2>

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
                  checked={formData.is_enabled}
                  onChange={(e) =>
                    setFormData({ ...formData, is_enabled: e.target.checked })
                  }
                  style={{ width: "auto" }}
                />
                Show the combo builder on the website
              </label>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "1rem",
              }}
            >
              <div className="form-group">
                <label>Minimum Items</label>
                <input
                  type="number"
                  min={2}
                  required
                  value={displayNumber(formData.min_items)}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      min_items: parseNumberInput(e.target.value) ?? 2,
                    })
                  }
                />
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-secondary)",
                    marginTop: "0.25rem",
                    display: "block",
                  }}
                >
                  How many items a customer must pick before they can order.
                </span>
              </div>

              <div className="form-group">
                <label>Title</label>
                <input
                  type="text"
                  required
                  placeholder="Build Your Own Combo"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="form-group">
              <label>Subtitle</label>
              <input
                type="text"
                placeholder="Leave blank to use the default wording"
                value={formData.subtitle ?? ""}
                onChange={(e) =>
                  setFormData({ ...formData, subtitle: e.target.value })
                }
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button type="submit" loading={isSaving}>
                Save Settings
              </Button>
            </div>
          </Card>
        </form>
      )}

      {formData?.is_enabled && isShortOfMinimum && !productsLoading && (
        <Card
          style={{
            marginBottom: "1.5rem",
            borderLeft: "3px solid var(--warning, #d97706)",
          }}
        >
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <AlertTriangle
              size={18}
              color="var(--warning, #d97706)"
              style={{ flexShrink: 0, marginTop: "0.1rem" }}
            />
            <div>
              <strong style={{ display: "block", marginBottom: "0.25rem" }}>
                Customers cannot complete a combo right now
              </strong>
              <span
                style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}
              >
                Only {buyableUnits.length} eligible{" "}
                {buyableUnits.length === 1 ? "item is" : "items are"} visible
                and in stock, but the minimum is {minItems}. The builder stays
                hidden on the website until there are enough. Mark more items
                eligible from the{" "}
                <Link
                  to="/products"
                  style={{
                    color: "var(--accent-primary)",
                    textDecoration: "underline",
                  }}
                >
                  Products page
                </Link>
                .
              </span>
            </div>
          </div>
        </Card>
      )}

      <Card padding="0">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
            padding: "1.5rem",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div>
            <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>
              Eligible Items ({eligibleUnits.length})
            </h2>
            <span
              style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}
            >
              Set per item on the Products page — a product&apos;s own checkbox,
              or one per variant when it is sold by size.
            </span>
          </div>
          {buyableUnits.length >= minItems && (
            <div style={{ textAlign: "right" }}>
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-secondary)",
                  display: "block",
                }}
              >
                Cheapest possible combo
              </span>
              <strong style={{ fontSize: "1.125rem" }}>
                ₹{formatCurrency(cheapestCombo)}
              </strong>
            </div>
          )}
        </div>

        {productsLoading && eligibleUnits.length === 0 ? (
          <Spinner />
        ) : eligibleUnits.length === 0 ? (
          <EmptyState
            icon={Boxes}
            message="No items are marked combo-eligible yet."
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Size</th>
                  <th>Customer Pays</th>
                  <th>Stock</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {eligibleUnits.map((unit) => {
                  const stock = getStockStatus({
                    available_quantity: unit.availableQuantity,
                    low_stock_threshold: unit.lowStockThreshold,
                  });

                  return (
                    <tr key={unit.key}>
                      <td>
                        <span style={{ fontWeight: 500 }}>
                          {unit.productName}
                        </span>
                        {!unit.isVisible && (
                          <span
                            className="badge badge-danger"
                            style={{ marginLeft: "0.5rem" }}
                          >
                            Hidden
                          </span>
                        )}
                      </td>
                      <td>{unit.size}</td>
                      <td>
                        ₹{formatCurrency(unit.effectivePrice)}
                        {unit.effectivePrice < unit.price && (
                          <span
                            style={{
                              marginLeft: "0.5rem",
                              fontSize: "0.75rem",
                              color: "var(--text-secondary)",
                              textDecoration: "line-through",
                            }}
                          >
                            ₹{formatCurrency(unit.price)}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`badge badge-${stock.variant}`}>
                          {stock.label}
                        </span>
                        <span
                          style={{
                            marginLeft: "0.5rem",
                            fontSize: "0.75rem",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {unit.availableQuantity ?? 0}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Link
                          to="/products"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            fontSize: "0.75rem",
                            color: "var(--accent-primary)",
                          }}
                        >
                          Edit <ExternalLink size={12} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
