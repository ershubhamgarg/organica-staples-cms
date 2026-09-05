import { useEffect, useState } from "react";
import { Plus, Edit2, Trash2, Sprout, Package } from "lucide-react";
import { toast } from "sonner";
import { useProductStore } from "../store/productStore";
import { type Product } from "../types/product";
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

function toDatetimeLocalValue(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type ProductFormData = Omit<Product, "id" | "created_at">;

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
  } = useProductStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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
      });
    } else {
      setEditingProduct(null);
      setFormData(blankFormData);
    }
    setIsModalOpen(true);
  };

  const handleImagesChange = (newImages: string[]) => {
    setFormData({ ...formData, images: newImages });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      const {
        available_quantity,
        low_stock_threshold,
        launch_date,
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

      if (editingProduct) {
        await updateProduct(editingProduct.id, productPayload);
        await updateInventory(editingProduct.id, inventoryUpdates);
        toast.success("Product updated.");
      } else {
        const created = await addProduct(productPayload);
        await updateInventory(created.id, inventoryUpdates);
        toast.success("Product added.");
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
        <div style={{ overflowX: "auto" }}>
          {isLoading && products.length === 0 ? (
            <Spinner />
          ) : products.length === 0 ? (
            <EmptyState
              icon={Sprout}
              message="No products yet — add your first pantry essential."
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
                {products.map((product) => (
                  <tr
                    key={product.id}
                    style={{ borderBottom: "1px solid var(--border-color)" }}
                  >
                    <td style={{ padding: "16px" }}>
                      <ProductImage
                        src={getProductThumbnail(product)}
                        alt={product.name}
                      />
                    </td>
                    <td style={{ padding: "16px", fontWeight: 600 }}>
                      {product.name}
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
                      ₹{formatCurrency(product.price)}
                    </td>
                    <td style={{ padding: "16px" }}>{product.weight}</td>
                    <td style={{ padding: "16px" }}>
                      <div
                        style={{
                          display: "flex",
                          gap: "6px",
                          flexWrap: "wrap",
                        }}
                      >
                        {(() => {
                          const stock = getStockStatus(product);
                          return (
                            <span className={`badge badge-${stock.variant}`}>
                              {stock.label}
                            </span>
                          );
                        })()}
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
                ))}
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
                  value={formData.price}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      price: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="form-group">
                <label>Wholesale Price / Cost (₹)</label>
                <input
                  type="number"
                  required
                  value={formData.wholesale_price}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      wholesale_price: Number(e.target.value),
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
                  value={formData.available_quantity ?? 0}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      available_quantity: Number(e.target.value),
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
                  value={formData.low_stock_threshold ?? 5}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      low_stock_threshold: Number(e.target.value),
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
