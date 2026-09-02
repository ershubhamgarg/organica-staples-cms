import { useEffect, useState } from "react";
import {
  Plus,
  Edit2,
  Trash2,
  Image as ImageIcon,
  X,
  Loader2,
} from "lucide-react";
import { useProductStore } from "../store/productStore";
import { type Product } from "../types/product";
import { ImageUpload } from "../components/ImageUpload";

function getStockStatus(product: Product): { label: string; variant: string } {
  const qty = product.available_quantity;

  if (qty == null) {
    return product.available !== false
      ? { label: "Available", variant: "success" }
      : { label: "Unavailable", variant: "danger" };
  }

  if (qty <= 0) {
    return { label: "Out of Stock", variant: "danger" };
  }

  if (
    product.low_stock_threshold != null &&
    qty <= product.low_stock_threshold
  ) {
    return { label: "Low Stock", variant: "warning" };
  }

  return { label: "In Stock", variant: "success" };
}

function toDatetimeLocalValue(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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
  const blankFormData: Omit<Product, "id" | "created_at"> = {
    name: "",
    description: "",
    price: 0,
    wholesale_price: 0,
    image: "",
    images: [],
    category: "",
    origin: "",
    weight: "",
    benefits: [],
    available: true,
    isVisible: true,
    available_quantity: 0,
    low_stock_threshold: 5,
    hsn_code: "",
    launch_status: "available",
    launch_date: "",
    launch_badge_text: "",
  };
  const [formData, setFormData] =
    useState<Omit<Product, "id" | "created_at">>(blankFormData);

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
        image: product.image,
        images: Array.isArray(product.images)
          ? product.images
          : typeof product.images === "string"
            ? [product.images]
            : [],
        category: product.category,
        origin: product.origin,
        weight: product.weight,
        benefits: product.benefits || [],
        available: product.available ?? true,
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
    setFormData({
      ...formData,
      images: newImages,
      image: newImages.length > 0 ? newImages[0] : "", // Set first image as main thumbnail
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
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
      } else {
        const created = await addProduct(productPayload);
        await updateInventory(created.id, inventoryUpdates);
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error("Failed to save product:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this product?")) {
      try {
        await deleteProduct(id);
      } catch (err) {
        console.error("Failed to delete product:", err);
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
          <h1 className="page-title">Pantry Essentials</h1>
          <p className="page-subtitle">
            Curating premium organic staples with care.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => handleOpenModal()}>
          <Plus size={18} />
          Add Product
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
          {isLoading && products.length === 0 ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                padding: "2rem",
              }}
            >
              <Loader2 className="animate-spin" />
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                textAlign: "left",
              }}
            >
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
                    style={{
                      borderBottom: "1px solid var(--border-color)",
                      transition: "background 0.2s",
                    }}
                  >
                    <td style={{ padding: "16px" }}>
                      <div
                        style={{
                          width: "40px",
                          height: "40px",
                          background: "var(--bg-tertiary)",
                          borderRadius: "8px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          overflow: "hidden",
                        }}
                      >
                        {product.image ? (
                          <img
                            src={product.image}
                            alt={product.name}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                        ) : (
                          <ImageIcon size={20} color="var(--text-secondary)" />
                        )}
                      </div>
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
                      ₹{product.price}
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
                          gap: "8px",
                        }}
                      >
                        <button
                          className="btn-ghost"
                          onClick={() => handleOpenModal(product)}
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
                          onClick={() => handleDelete(product.id)}
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
                ))}
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
              maxWidth: "600px",
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
              {editingProduct ? "Edit Product" : "Add New Product"}
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
                      checked={formData.available as boolean}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          available: e.target.checked,
                        })
                      }
                      style={{ width: "auto" }}
                    />
                    Available for purchase
                  </label>
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
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : editingProduct ? (
                    "Update Product"
                  ) : (
                    "Add Product"
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
