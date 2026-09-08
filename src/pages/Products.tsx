import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus,
  Edit2,
  Trash2,
  Sprout,
  Package,
  Search,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useProductStore } from "../store/productStore";
import { type Product, type ProductVariant } from "../types/product";
import { ImageUpload } from "../components/ImageUpload";
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
import { getStockStatus } from "../utils/stockStatus";
import { formatCurrency } from "../utils/currency";
import { parseWeightKg } from "../utils/weight";
import { displayNumber, parseNumberInput } from "../utils/number";

type SortField =
  | "none"
  | "name"
  | "price"
  | "status"
  | "category"
  | "weight";
type SortDirection = "asc" | "desc";

const sortFieldLabels: Record<Exclude<SortField, "none">, string> = {
  name: "Name",
  price: "Price",
  status: "Status",
  category: "Category",
  weight: "Weight",
};

// In-stock products sort first in ascending order, then low stock, then out
// of stock — matches the order they should read top-to-bottom by default.
const STOCK_STATUS_RANK: Record<string, number> = {
  in_stock: 0,
  low_stock: 1,
  out_of_stock: 2,
};

// A product with variants has no single meaningful stock level of its own
// — each size/weight tracks its own quantity — so its status badge reflects
// the worst case across all variants rather than the (unused) base fields.
function getProductAggregateStatus(product: Product) {
  if (!product.variants || product.variants.length === 0) {
    return getStockStatus(product);
  }
  const statuses = product.variants.map((v) => getStockStatus(v).status);
  if (statuses.every((s) => s === "out_of_stock")) {
    return getStockStatus({ available_quantity: 0, low_stock_threshold: 0 });
  }
  if (statuses.some((s) => s === "out_of_stock" || s === "low_stock")) {
    return { status: "low_stock" as const, label: "Low Stock", variant: "warning" };
  }
  return { status: "in_stock" as const, label: "In Stock", variant: "success" };
}

function compareProducts(a: Product, b: Product, field: SortField): number {
  switch (field) {
    case "name":
      return a.name.localeCompare(b.name);
    case "price":
      return a.price - b.price;
    case "status":
      return (
        STOCK_STATUS_RANK[getProductAggregateStatus(a).status] -
        STOCK_STATUS_RANK[getProductAggregateStatus(b).status]
      );
    case "category":
      return (a.category || "").localeCompare(b.category || "");
    case "weight":
      return parseWeightKg(a.weight) - parseWeightKg(b.weight);
    default:
      return 0;
  }
}

function toDatetimeLocalValue(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type ProductFormData = Omit<Product, "id" | "created_at">;

const blankVariantRow = (sortOrder: number): ProductVariant => ({
  label: "",
  weight: "",
  price: 0,
  wholesale_price: 0,
  discount_percent: 0,
  available_quantity: 0,
  low_stock_threshold: 5,
  sort_order: sortOrder,
});

export default function Products() {
  const {
    products,
    isLoading,
    error,
    fetchProducts,
    addProduct,
    updateProduct,
    deleteProduct,
    uploadImage,
    updateInventory,
    replaceVariants,
  } = useProductStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("none");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(
    new Set(),
  );

  const toggleExpanded = (productId: string) => {
    setExpandedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };
  const blankFormData: ProductFormData = {
    name: "",
    description: "",
    price: 0,
    wholesale_price: 0,
    images: [],
    category: "",
    origin: "",
    weight: "",
    benefits: [],
    isVisible: true,
    available_quantity: 0,
    low_stock_threshold: 5,
    hsn_code: "",
    launch_status: "available",
    launch_date: "",
    launch_badge_text: "",
    variants: [],
  };
  const [formData, setFormData] = useState<ProductFormData>(blankFormData);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        description: product.description,
        price: product.price,
        wholesale_price: product.wholesale_price || 0,
        images: Array.isArray(product.images)
          ? product.images
          : typeof product.images === "string" && product.images
            ? [product.images]
            : [],
        category: product.category,
        origin: product.origin,
        weight: product.weight,
        benefits: product.benefits || [],
        isVisible: product.isVisible ?? true,
        available_quantity: product.available_quantity ?? 0,
        low_stock_threshold: product.low_stock_threshold ?? 5,
        hsn_code: product.hsn_code || "",
        launch_status: product.launch_status || "available",
        launch_date: toDatetimeLocalValue(product.launch_date),
        launch_badge_text: product.launch_badge_text || "",
        variants: product.variants ?? [],
      });
    } else {
      setEditingProduct(null);
      setFormData(blankFormData);
    }
    setIsModalOpen(true);
  };

  useEffect(() => {
    const highlightId = searchParams.get("highlight");
    if (!highlightId || products.length === 0) return;

    const match = products.find((p) => p.id === highlightId);
    if (match) {
      // Deep-linking a search result into its edit modal is exactly the
      // kind of "synchronize with an external system" (the URL) an effect
      // is for, even though it looks like the generally-discouraged
      // setState-in-effect pattern.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleOpenModal(match);
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("highlight");
        return next;
      },
      { replace: true },
    );
    // Only re-run when the URL's highlight param or the loaded product list
    // changes — handleOpenModal is intentionally excluded, it's re-created
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, products]);

  const handleImagesChange = (newImages: string[]) => {
    setFormData({ ...formData, images: newImages });
  };

  const hasVariants = (formData.variants?.length ?? 0) > 0;

  const toggleHasVariants = (checked: boolean) => {
    setFormData({
      ...formData,
      variants: checked
        ? formData.variants && formData.variants.length > 0
          ? formData.variants
          : [blankVariantRow(0)]
        : [],
    });
  };

  const addVariantRow = () => {
    const current = formData.variants ?? [];
    setFormData({
      ...formData,
      variants: [...current, blankVariantRow(current.length)],
    });
  };

  const updateVariantRow = (index: number, patch: Partial<ProductVariant>) => {
    const current = formData.variants ?? [];
    setFormData({
      ...formData,
      variants: current.map((v, i) => (i === index ? { ...v, ...patch } : v)),
    });
  };

  const removeVariantRow = (index: number) => {
    const current = formData.variants ?? [];
    setFormData({
      ...formData,
      variants: current.filter((_, i) => i !== index),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      const {
        available_quantity,
        low_stock_threshold,
        launch_date,
        variants,
        ...productFields
      } = formData;
      const inventoryUpdates = {
        available_quantity: available_quantity ?? 0,
        low_stock_threshold: low_stock_threshold ?? 5,
      };
      const productPayload = {
        ...productFields,
        launch_date: launch_date ? new Date(launch_date).toISOString() : null,
      };

      let productId: string;
      if (editingProduct) {
        await updateProduct(editingProduct.id, productPayload);
        await updateInventory(editingProduct.id, inventoryUpdates);
        productId = editingProduct.id;
        toast.success("Product updated.");
      } else {
        const created = await addProduct(productPayload);
        await updateInventory(created.id, inventoryUpdates);
        productId = created.id;
        toast.success("Product added.");
      }

      if (variants && variants.length > 0) {
        await replaceVariants(productId, variants);
      } else if (editingProduct?.variants?.length) {
        // Variants were turned off for a product that previously had them.
        await replaceVariants(productId, []);
      }

      setIsModalOpen(false);
    } catch (err) {
      console.error("Failed to save product:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save product.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (product: Product) => {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) {
      return;
    }
    try {
      setDeletingId(product.id);
      await deleteProduct(product.id);
      toast.success("Product deleted.");
    } catch (err) {
      console.error("Failed to delete product:", err);
      toast.error(err instanceof Error ? err.message : "Failed to delete product.");
    } finally {
      setDeletingId(null);
    }
  };

  const categories = useMemo(
    () =>
      Array.from(
        new Set(products.map((p) => p.category).filter((c): c is string => Boolean(c))),
      ).sort((a, b) => a.localeCompare(b)),
    [products],
  );

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch = !query || product.name.toLowerCase().includes(query);
      const matchesCategory =
        categoryFilter === "all" || product.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [products, search, categoryFilter]);

  const sortedProducts = useMemo(() => {
    if (sortField === "none") return filteredProducts;
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...filteredProducts].sort(
      (a, b) => compareProducts(a, b, sortField) * direction,
    );
  }, [filteredProducts, sortField, sortDirection]);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Pantry Essentials"
        subtitle="Curating premium organic staples with care."
        action={
          <Button icon={<Plus size={18} />} onClick={() => handleOpenModal()}>
            Add Product
          </Button>
        }
      />

      {error && <ErrorBanner message={error} />}

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
              placeholder="Search products by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field"
              style={{ paddingLeft: "36px" }}
            />
          </div>
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {categories.length > 0 && (
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <button
                  onClick={() => setCategoryFilter("all")}
                  className={
                    categoryFilter === "all" ? "btn btn-secondary" : "btn-ghost"
                  }
                  style={{
                    padding: "6px 14px",
                    fontSize: "0.85rem",
                    borderRadius: "var(--radius-full)",
                  }}
                >
                  All
                </button>
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setCategoryFilter(category)}
                    className={
                      categoryFilter === category
                        ? "btn btn-secondary"
                        : "btn-ghost"
                    }
                    style={{
                      padding: "6px 14px",
                      fontSize: "0.85rem",
                      borderRadius: "var(--radius-full)",
                    }}
                  >
                    {category}
                  </button>
                ))}
              </div>
            )}
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
        </div>

        <div style={{ overflowX: "auto" }}>
          {isLoading && products.length === 0 ? (
            <Spinner />
          ) : filteredProducts.length === 0 ? (
            <EmptyState
              icon={Sprout}
              message={
                search || categoryFilter !== "all"
                  ? "No products match your filters."
                  : "No products yet — add your first pantry essential."
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
                  <th style={{ padding: "12px 0 12px 16px", width: "28px" }} />
                  <th
                    style={{
                      padding: "12px 16px",
                      fontWeight: 500,
                      width: "60px",
                    }}
                  >
                    Image
                  </th>
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>
                    Name
                  </th>
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>
                    Category
                  </th>
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>
                    Price
                  </th>
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>
                    Weight
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
                {sortedProducts.map((product) => {
                  const variants = product.variants ?? [];
                  const hasVariants = variants.length > 0;
                  const isExpanded = expandedProductIds.has(product.id);
                  const aggregateStatus = getProductAggregateStatus(product);
                  const variantPrices = variants.map((v) => v.price);
                  const minPrice = Math.min(...variantPrices);
                  const maxPrice = Math.max(...variantPrices);

                  return (
                    <Fragment key={product.id}>
                      <tr
                        style={{ borderBottom: hasVariants && isExpanded ? "none" : "1px solid var(--border-color)" }}
                      >
                        <td style={{ padding: "16px 0 16px 16px" }}>
                          {hasVariants && (
                            <IconButton
                              icon={
                                isExpanded ? (
                                  <ChevronDown size={16} />
                                ) : (
                                  <ChevronRight size={16} />
                                )
                              }
                              tooltip={
                                isExpanded ? "Hide variants" : "Show variants"
                              }
                              onClick={() => toggleExpanded(product.id)}
                            />
                          )}
                        </td>
                        <td style={{ padding: "16px" }}>
                          <ProductImage
                            src={getProductThumbnail(product)}
                            alt={product.name}
                          />
                        </td>
                        <td style={{ padding: "16px", fontWeight: 600 }}>
                          {product.name}
                          {hasVariants && (
                            <span
                              className="badge badge-secondary"
                              style={{
                                marginLeft: "8px",
                                fontWeight: 600,
                                verticalAlign: "middle",
                              }}
                            >
                              {variants.length} variant
                              {variants.length === 1 ? "" : "s"}
                            </span>
                          )}
                        </td>
                        <td
                          style={{
                            padding: "16px",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {product.category}
                        </td>
                        <td style={{ padding: "16px", fontWeight: 500 }}>
                          {hasVariants
                            ? minPrice === maxPrice
                              ? `₹${formatCurrency(minPrice)}`
                              : `₹${formatCurrency(minPrice)} – ₹${formatCurrency(maxPrice)}`
                            : `₹${formatCurrency(product.price)}`}
                        </td>
                        <td style={{ padding: "16px" }}>
                          {hasVariants
                            ? `${variants.length} size${variants.length === 1 ? "" : "s"}`
                            : product.weight}
                        </td>
                        <td style={{ padding: "16px" }}>
                          <div
                            style={{
                              display: "flex",
                              gap: "6px",
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              className={`badge badge-${aggregateStatus.variant}`}
                            >
                              {aggregateStatus.label}
                            </span>
                            {product.isVisible === false && (
                              <span className="badge badge-secondary">
                                Hidden
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "16px", textAlign: "right" }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "flex-end",
                              gap: "4px",
                            }}
                          >
                            <IconButton
                              icon={<Edit2 size={16} />}
                              tooltip="Edit product"
                              onClick={() => handleOpenModal(product)}
                            />
                            <IconButton
                              icon={
                                deletingId === product.id ? (
                                  <Spinner size={16} padding="0" />
                                ) : (
                                  <Trash2 size={16} />
                                )
                              }
                              tooltip="Delete product"
                              danger
                              disabled={deletingId === product.id}
                              onClick={() => handleDelete(product)}
                            />
                          </div>
                        </td>
                      </tr>
                      {hasVariants && isExpanded && (
                        <tr
                          key={`${product.id}-variants`}
                          style={{ borderBottom: "1px solid var(--border-color)" }}
                        >
                          <td></td>
                          <td colSpan={7} style={{ padding: "0 16px 16px" }}>
                            <div
                              style={{
                                background: "var(--bg-primary)",
                                borderRadius: "var(--radius-md)",
                                overflow: "hidden",
                              }}
                            >
                              <table style={{ width: "100%", textAlign: "left" }}>
                                <thead>
                                  <tr
                                    style={{
                                      fontSize: "0.8rem",
                                      color: "var(--text-secondary)",
                                    }}
                                  >
                                    <th style={{ padding: "10px 12px", fontWeight: 500 }}>
                                      Variant
                                    </th>
                                    <th style={{ padding: "10px 12px", fontWeight: 500 }}>
                                      Weight
                                    </th>
                                    <th style={{ padding: "10px 12px", fontWeight: 500 }}>
                                      Price
                                    </th>
                                    <th style={{ padding: "10px 12px", fontWeight: 500 }}>
                                      Quantity
                                    </th>
                                    <th style={{ padding: "10px 12px", fontWeight: 500 }}>
                                      Status
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {variants
                                    .slice()
                                    .sort(
                                      (a, b) =>
                                        (a.sort_order ?? 0) - (b.sort_order ?? 0),
                                    )
                                    .map((variant, index) => {
                                      const variantStatus = getStockStatus(variant);
                                      const discountPercent =
                                        variant.discount_percent ?? 0;
                                      return (
                                        <tr
                                          key={variant.id ?? index}
                                          style={{ fontSize: "0.85rem" }}
                                        >
                                          <td style={{ padding: "10px 12px", fontWeight: 500 }}>
                                            {variant.label}
                                          </td>
                                          <td style={{ padding: "10px 12px" }}>
                                            {variant.weight}
                                          </td>
                                          <td style={{ padding: "10px 12px" }}>
                                            {discountPercent > 0 ? (
                                              <div
                                                style={{
                                                  display: "flex",
                                                  alignItems: "center",
                                                  gap: "6px",
                                                }}
                                              >
                                                <span
                                                  style={{
                                                    color: "var(--text-secondary)",
                                                    textDecoration: "line-through",
                                                  }}
                                                >
                                                  ₹{formatCurrency(variant.price)}
                                                </span>
                                                <span
                                                  style={{
                                                    fontWeight: 600,
                                                    color: "var(--success)",
                                                  }}
                                                >
                                                  ₹
                                                  {formatCurrency(
                                                    variant.price *
                                                      (1 - discountPercent / 100),
                                                  )}
                                                </span>
                                                <span className="badge badge-success">
                                                  -{discountPercent}%
                                                </span>
                                              </div>
                                            ) : (
                                              `₹${formatCurrency(variant.price)}`
                                            )}
                                          </td>
                                          <td style={{ padding: "10px 12px" }}>
                                            {variant.available_quantity ?? 0}
                                          </td>
                                          <td style={{ padding: "10px 12px" }}>
                                            <span
                                              className={`badge badge-${variantStatus.variant}`}
                                            >
                                              {variantStatus.label}
                                            </span>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {isModalOpen && (
        <Modal
          onClose={() => setIsModalOpen(false)}
          title={editingProduct ? "Edit Product" : "Add New Product"}
          icon={<Package size={20} />}
          iconColor="var(--accent-primary)"
          maxWidth="600px"
          closeDisabled={isSaving}
        >
          <form onSubmit={handleSubmit}>
            <div
              className="responsive-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
                marginBottom: "1.5rem",
              }}
            >
              <div className="form-group" style={{ gridColumn: "span 2" }}>
                <label>Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>
              <div className="form-group" style={{ gridColumn: "span 2" }}>
                <label>Description</label>
                <textarea
                  required
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  style={{ minHeight: "100px" }}
                />
              </div>
              <div className="form-group">
                <label>Selling Price (₹)</label>
                <input
                  type="number"
                  required
                  value={displayNumber(formData.price)}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      price: parseNumberInput(e.target.value),
                    })
                  }
                />
              </div>
              <div className="form-group">
                <label>Wholesale Price / Cost (₹)</label>
                <input
                  type="number"
                  required
                  value={displayNumber(formData.wholesale_price)}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      wholesale_price: parseNumberInput(e.target.value),
                    })
                  }
                />
              </div>
              <div className="form-group">
                <label>Available Quantity</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={displayNumber(formData.available_quantity)}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      available_quantity: parseNumberInput(e.target.value),
                    })
                  }
                />
              </div>
              <div className="form-group">
                <label>Low Stock Threshold</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={displayNumber(formData.low_stock_threshold)}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      low_stock_threshold: parseNumberInput(e.target.value),
                    })
                  }
                />
              </div>
              <div className="form-group">
                <label>HSN Code</label>
                <input
                  type="text"
                  placeholder="e.g. 09103020"
                  value={formData.hsn_code ?? ""}
                  onChange={(e) =>
                    setFormData({ ...formData, hsn_code: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>Category</label>
                <input
                  type="text"
                  required
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>Weight</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 500g, 1kg"
                  value={formData.weight}
                  onChange={(e) =>
                    setFormData({ ...formData, weight: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>Origin</label>
                <input
                  type="text"
                  required
                  value={formData.origin}
                  onChange={(e) =>
                    setFormData({ ...formData, origin: e.target.value })
                  }
                />
              </div>

              <div className="form-group" style={{ gridColumn: "span 2" }}>
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
                    checked={hasVariants}
                    onChange={(e) => toggleHasVariants(e.target.checked)}
                    style={{ width: "auto" }}
                  />
                  This product has size/weight variants
                </label>
                {hasVariants && (
                  <p
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--text-secondary)",
                      marginTop: "0.4rem",
                    }}
                  >
                    The Selling Price and Weight fields above are used only as
                    a fallback for products without variants.
                  </p>
                )}
              </div>

              {hasVariants && (
                <div style={{ gridColumn: "span 2" }}>
                  <label
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                      display: "block",
                      marginBottom: "0.5rem",
                    }}
                  >
                    Variants
                  </label>
                  {(formData.variants ?? []).map((variant, index) => {
                    const discountPercent = variant.discount_percent ?? 0;
                    const effectivePrice =
                      variant.price * (1 - discountPercent / 100);

                    return (
                      <div
                        key={variant.id ?? `new-${index}`}
                        className="card-subsection"
                        style={{ marginBottom: "1rem" }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: "1rem",
                            paddingBottom: "0.75rem",
                            borderBottom: "1px solid var(--border-color)",
                          }}
                        >
                          <span className="eyebrow">Variant {index + 1}</span>
                          <IconButton
                            icon={<Trash2 size={16} />}
                            tooltip="Remove variant"
                            danger
                            onClick={() => removeVariantRow(index)}
                          />
                        </div>

                        <div
                          className="responsive-grid"
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1.3fr 1fr",
                            gap: "1rem",
                            marginBottom: "1rem",
                          }}
                        >
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>Variant Label</label>
                            <input
                              type="text"
                              placeholder="e.g. 5 Kg Pack"
                              required
                              value={variant.label}
                              onChange={(e) =>
                                updateVariantRow(index, { label: e.target.value })
                              }
                            />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>Weight</label>
                            <input
                              type="text"
                              placeholder="e.g. 5kg"
                              required
                              value={variant.weight}
                              onChange={(e) =>
                                updateVariantRow(index, { weight: e.target.value })
                              }
                            />
                          </div>
                        </div>

                        <div
                          className="eyebrow"
                          style={{ marginBottom: "0.6rem" }}
                        >
                          Pricing
                        </div>
                        <div
                          className="responsive-grid"
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr",
                            gap: "1rem",
                            marginBottom: "1rem",
                          }}
                        >
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>Selling Price (₹)</label>
                            <input
                              type="number"
                              placeholder="e.g. 649"
                              min={0}
                              required
                              value={displayNumber(variant.price)}
                              onChange={(e) =>
                                updateVariantRow(index, {
                                  price: parseNumberInput(e.target.value),
                                })
                              }
                            />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>Discount (%)</label>
                            <input
                              type="number"
                              placeholder="e.g. 10"
                              min={0}
                              max={100}
                              value={displayNumber(variant.discount_percent)}
                              onChange={(e) =>
                                updateVariantRow(index, {
                                  discount_percent: parseNumberInput(
                                    e.target.value,
                                  ),
                                })
                              }
                            />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>Customer Pays</label>
                            <div
                              style={{
                                padding: "12px 16px",
                                background: "var(--bg-secondary)",
                                border: "1px solid var(--border-color)",
                                borderRadius: "var(--radius-md)",
                                fontWeight: 600,
                                color:
                                  discountPercent > 0
                                    ? "var(--success)"
                                    : "var(--text-primary)",
                              }}
                            >
                              ₹{formatCurrency(effectivePrice)}
                            </div>
                          </div>
                        </div>

                        <div
                          className="eyebrow"
                          style={{ marginBottom: "0.6rem" }}
                        >
                          Cost &amp; Inventory
                        </div>
                        <div
                          className="responsive-grid"
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr",
                            gap: "1rem",
                          }}
                        >
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>Wholesale Price (₹)</label>
                            <input
                              type="number"
                              placeholder="e.g. 480"
                              min={0}
                              value={displayNumber(variant.wholesale_price)}
                              onChange={(e) =>
                                updateVariantRow(index, {
                                  wholesale_price: parseNumberInput(
                                    e.target.value,
                                  ),
                                })
                              }
                            />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>Stock Quantity</label>
                            <input
                              type="number"
                              placeholder="e.g. 50"
                              min={0}
                              value={displayNumber(variant.available_quantity)}
                              onChange={(e) =>
                                updateVariantRow(index, {
                                  available_quantity: parseNumberInput(
                                    e.target.value,
                                  ),
                                })
                              }
                            />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>Low Stock Alert Below</label>
                            <input
                              type="number"
                              placeholder="e.g. 5"
                              min={0}
                              value={displayNumber(variant.low_stock_threshold)}
                              onChange={(e) =>
                                updateVariantRow(index, {
                                  low_stock_threshold: parseNumberInput(
                                    e.target.value,
                                  ),
                                })
                              }
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={<Plus size={14} />}
                    onClick={addVariantRow}
                  >
                    Add Variant
                  </Button>
                </div>
              )}

              <div className="form-group">
                <label>Launch Status</label>
                <select
                  value={formData.launch_status ?? "available"}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      launch_status: e.target
                        .value as Product["launch_status"],
                    })
                  }
                >
                  <option value="available">Available</option>
                  <option value="just_launched">Just Launched</option>
                  <option value="launching_soon">Launching Soon</option>
                </select>
              </div>
              {formData.launch_status !== "available" && (
                <>
                  <div className="form-group">
                    <label>Launch Date</label>
                    <input
                      type="datetime-local"
                      value={formData.launch_date ?? ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          launch_date: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: "span 2" }}>
                    <label>Launch Badge Text</label>
                    <input
                      type="text"
                      placeholder="e.g. LIMITED DROP, COMING FRIDAY"
                      value={formData.launch_badge_text ?? ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          launch_badge_text: e.target.value,
                        })
                      }
                    />
                  </div>
                </>
              )}
              <div className="form-group" style={{ gridColumn: "span 2" }}>
                <label>Benefits (comma separated)</label>
                <input
                  type="text"
                  value={formData.benefits.join(", ")}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      benefits: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="e.g. Organic, High Protein, Gluten Free"
                />
              </div>
              <div className="form-group" style={{ gridColumn: "span 2" }}>
                <ImageUpload
                  images={
                    Array.isArray(formData.images) ? formData.images : []
                  }
                  onChange={handleImagesChange}
                  onUpload={uploadImage}
                />
              </div>
              <div className="form-group" style={{ gridColumn: "span 2" }}>
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
                    checked={formData.isVisible as boolean}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        isVisible: e.target.checked,
                      })
                    }
                    style={{ width: "auto" }}
                  />
                  Visible on store
                </label>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: "1rem",
                justifyContent: "flex-end",
              }}
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
                {editingProduct ? "Update Product" : "Add Product"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
