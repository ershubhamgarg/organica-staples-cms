import { useEffect, useMemo, useState } from "react";
import { Boxes, Edit2, Search } from "lucide-react";
import { toast } from "sonner";
import { useProductStore } from "../store/productStore";
import { type Product } from "../types/product";
import PageHeader from "../components/ui/PageHeader";
import ErrorBanner from "../components/ui/ErrorBanner";
import Spinner from "../components/ui/Spinner";
import EmptyState from "../components/ui/EmptyState";
import Card from "../components/ui/Card";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import IconButton from "../components/ui/IconButton";
import ProductImage from "../components/ui/ProductImage";
import { getProductThumbnail } from "../utils/productImage";
import { getStockStatus, type StockStatus } from "../utils/stockStatus";

type FilterOption = "all" | StockStatus;

const filterOptions: { value: FilterOption; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in_stock", label: "In Stock" },
  { value: "low_stock", label: "Low Stock" },
  { value: "out_of_stock", label: "Out of Stock" },
];

export default function Inventory() {
  const { products, isLoading, error, fetchProducts, updateInventory } =
    useProductStore();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterOption>("all");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(0);
  const [threshold, setThreshold] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        String(product.id).includes(query);
      const matchesFilter =
        filter === "all" || getStockStatus(product).status === filter;
      return matchesSearch && matchesFilter;
    });
  }, [products, search, filter]);

  const counts = useMemo(() => {
    const result = { in_stock: 0, low_stock: 0, out_of_stock: 0 };
    for (const product of products) {
      result[getStockStatus(product).status] += 1;
    }
    return result;
  }, [products]);

  const handleOpenEdit = (product: Product) => {
    setEditingProduct(product);
    setQuantity(product.available_quantity ?? 0);
    setThreshold(product.low_stock_threshold ?? 5);
  };

  const handleSaveInventory = async () => {
    if (!editingProduct) return;
    if (quantity < 0 || threshold < 0) {
      toast.error("Quantity and threshold cannot be negative.");
      return;
    }
    try {
      setIsSaving(true);
      await updateInventory(editingProduct.id, {
        available_quantity: quantity,
        low_stock_threshold: threshold,
      });
      toast.success(`Inventory updated for ${editingProduct.name}.`);
      setEditingProduct(null);
    } catch (err) {
      console.error("Failed to update inventory:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to update inventory.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Inventory"
        subtitle="Track and update stock levels across your catalog."
      />

      {error && <ErrorBanner message={error} />}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <Card padding="1rem 1.25rem">
          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            In Stock
          </div>
          <div
            style={{
              fontSize: "1.5rem",
              fontFamily: "'Fraunces', Georgia, serif",
              color: "var(--success)",
            }}
          >
            {counts.in_stock}
          </div>
        </Card>
        <Card padding="1rem 1.25rem">
          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            Low Stock
          </div>
          <div
            style={{
              fontSize: "1.5rem",
              fontFamily: "'Fraunces', Georgia, serif",
              color: "var(--warning)",
            }}
          >
            {counts.low_stock}
          </div>
        </Card>
        <Card padding="1rem 1.25rem">
          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            Out of Stock
          </div>
          <div
            style={{
              fontSize: "1.5rem",
              fontFamily: "'Fraunces', Georgia, serif",
              color: "var(--danger)",
            }}
          >
            {counts.out_of_stock}
          </div>
        </Card>
      </div>

      <Card>
        <div
          style={{
            display: "flex",
            gap: "1rem",
            flexWrap: "wrap",
            justifyContent: "space-between",
            marginBottom: "1.25rem",
          }}
        >
          <div style={{ position: "relative", minWidth: "240px", flex: 1 }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-secondary)",
              }}
            />
            <input
              type="text"
              placeholder="Search by name or product ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field"
              style={{ paddingLeft: "36px" }}
            />
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {filterOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setFilter(option.value)}
                className={filter === option.value ? "btn btn-secondary" : "btn-ghost"}
                style={{
                  padding: "6px 14px",
                  fontSize: "0.85rem",
                  borderRadius: "var(--radius-full)",
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          {isLoading && products.length === 0 ? (
            <Spinner />
          ) : filteredProducts.length === 0 ? (
            <EmptyState
              icon={Boxes}
              message={
                search || filter !== "all"
                  ? "No products match your filters."
                  : "No products yet."
              }
            />
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
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>Product</th>
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>
                    Product ID
                  </th>
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>
                    Available Qty
                  </th>
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>
                    Low Stock Threshold
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
                {filteredProducts.map((product) => {
                  const stock = getStockStatus(product);
                  return (
                    <tr
                      key={product.id}
                      style={{ borderBottom: "1px solid var(--border-color)" }}
                    >
                      <td style={{ padding: "16px" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                          }}
                        >
                          <ProductImage
                            src={getProductThumbnail(product)}
                            alt={product.name}
                          />
                          <span style={{ fontWeight: 600 }}>{product.name}</span>
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "16px",
                          color: "var(--text-secondary)",
                          fontFamily: "monospace",
                          fontSize: "0.85rem",
                        }}
                      >
                        #{product.id}
                      </td>
                      <td style={{ padding: "16px", fontWeight: 600 }}>
                        {product.available_quantity ?? 0}
                      </td>
                      <td style={{ padding: "16px", color: "var(--text-secondary)" }}>
                        {product.low_stock_threshold ?? "—"}
                      </td>
                      <td style={{ padding: "16px" }}>
                        <span className={`badge badge-${stock.variant}`}>
                          {stock.label}
                        </span>
                      </td>
                      <td style={{ padding: "16px", textAlign: "right" }}>
                        <IconButton
                          icon={<Edit2 size={16} />}
                          tooltip="Update inventory"
                          onClick={() => handleOpenEdit(product)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {editingProduct && (
        <Modal
          onClose={() => setEditingProduct(null)}
          title="Update Inventory"
          icon={<Boxes size={20} />}
          iconColor="var(--accent-primary)"
          maxWidth="420px"
          closeDisabled={isSaving}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "1.5rem",
              padding: "0.75rem",
              background: "var(--bg-tertiary)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <ProductImage
              src={getProductThumbnail(editingProduct)}
              alt={editingProduct.name}
            />
            <div>
              <div style={{ fontWeight: 600 }}>{editingProduct.name}</div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                Product ID #{editingProduct.id}
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>Available Quantity</label>
            <input
              type="number"
              min={0}
              autoFocus
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </div>
          <div className="form-group" style={{ marginTop: "1rem" }}>
            <label>Low Stock Threshold</label>
            <input
              type="number"
              min={0}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
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
              onClick={() => setEditingProduct(null)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button loading={isSaving} onClick={handleSaveInventory}>
              Save Changes
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
