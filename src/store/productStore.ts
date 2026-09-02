import { create } from "zustand";
import { type Product } from "../types/product";
import { supabase } from "../utils/supabase";

interface ProductState {
  products: Product[];
  isLoading: boolean;
  error: string | null;
  fetchProducts: () => Promise<void>;
  addProduct: (
    product: Omit<Product, "id" | "created_at">,
  ) => Promise<Product>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  uploadImage: (file: File) => Promise<string>;
  updateInventory: (
    productId: string,
    updates: {
      available_quantity?: number;
      reserved_quantity?: number;
      low_stock_threshold?: number;
    },
  ) => Promise<void>;
}

type ProductInventoryRow = {
  available_quantity: number | null;
  reserved_quantity: number | null;
  low_stock_threshold: number | null;
};

function flattenInventory(
  row: Product & { product_inventory?: ProductInventoryRow | ProductInventoryRow[] | null },
): Product {
  const inventory = Array.isArray(row.product_inventory)
    ? row.product_inventory[0]
    : row.product_inventory;

  const { product_inventory, ...rest } = row;
  void product_inventory;

  return {
    ...rest,
    available_quantity: inventory?.available_quantity ?? null,
    reserved_quantity: inventory?.reserved_quantity ?? null,
    low_stock_threshold: inventory?.low_stock_threshold ?? null,
  };
}

export const useProductStore = create<ProductState>()((set) => ({
  products: [],
  isLoading: false,
  error: null,

  fetchProducts: async () => {
    set({ isLoading: true, error: null });
    const { data, error } = await supabase
      .from("products")
      .select(
        "*, product_inventory(available_quantity, reserved_quantity, low_stock_threshold)",
      )
      .order("created_at", { ascending: false });

    if (error) {
      set({ error: error.message, isLoading: false });
      return;
    }

    set({ products: (data || []).map(flattenInventory), isLoading: false });
  },

  addProduct: async (product) => {
    set({ isLoading: true, error: null });
    const { data, error } = await supabase
      .from("products")
      .insert([product])
      .select(
        "*, product_inventory(available_quantity, reserved_quantity, low_stock_threshold)",
      );

    if (error || !data || !data[0]) {
      const message = error?.message || "Failed to create product";
      set({ error: message, isLoading: false });
      throw new Error(message);
    }

    const created = flattenInventory(data[0]);
    set((state) => ({
      products: [created, ...state.products],
      isLoading: false,
    }));
    return created;
  },

  updateProduct: async (id, updates) => {
    set({ isLoading: true, error: null });
    const { data, error } = await supabase
      .from("products")
      .update(updates)
      .eq("id", id)
      .select(
        "*, product_inventory(available_quantity, reserved_quantity, low_stock_threshold)",
      );

    if (error) {
      set({ error: error.message, isLoading: false });
      throw new Error(error.message);
    }

    if (data) {
      const updated = flattenInventory(data[0]);
      set((state) => ({
        products: state.products.map((p) => (p.id === id ? updated : p)),
        isLoading: false,
      }));
    }
  },

  updateInventory: async (productId, updates) => {
    set({ isLoading: true, error: null });
    const { error } = await supabase
      .from("product_inventory")
      .update(updates)
      .eq("product_id", productId);

    if (error) {
      set({ error: error.message, isLoading: false });
      throw new Error(error.message);
    }

    set((state) => ({
      products: state.products.map((p) =>
        p.id === productId ? { ...p, ...updates } : p,
      ),
      isLoading: false,
    }));
  },

  deleteProduct: async (id) => {
    set({ isLoading: true, error: null });
    const { error } = await supabase.from("products").delete().eq("id", id);

    if (error) {
      set({ error: error.message, isLoading: false });
      throw new Error(error.message);
    }

    set((state) => ({
      products: state.products.filter((p) => p.id !== id),
      isLoading: false,
    }));
  },

  uploadImage: async (file: File) => {
    set({ isLoading: true, error: null });

    const fileExt = file.name.split(".").pop();
    const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `images/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("products")
      .upload(filePath, file);

    if (uploadError) {
      set({ error: uploadError.message, isLoading: false });
      throw new Error(uploadError.message);
    }

    const { data } = supabase.storage.from("products").getPublicUrl(filePath);

    set({ isLoading: false });
    return data.publicUrl;
  },
}));
