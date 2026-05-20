import { create } from "zustand";
import { type Product } from "../types/product";
import { supabase } from "../utils/supabase";

interface ProductState {
  products: Product[];
  isLoading: boolean;
  error: string | null;
  fetchProducts: () => Promise<void>;
  addProduct: (product: Omit<Product, "id" | "created_at">) => Promise<void>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  uploadImage: (file: File) => Promise<string>;
}

export const useProductStore = create<ProductState>()((set, get) => ({
  products: [],
  isLoading: false,
  error: null,

  fetchProducts: async () => {
    set({ isLoading: true, error: null });
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      set({ error: error.message, isLoading: false });
      return;
    }

    set({ products: data || [], isLoading: false });
  },

  addProduct: async (product) => {
    set({ isLoading: true, error: null });
    const { data, error } = await supabase
      .from("products")
      .insert([product])
      .select();

    if (error) {
      set({ error: error.message, isLoading: false });
      throw new Error(error.message);
    }

    if (data) {
      set((state) => ({
        products: [data[0], ...state.products],
        isLoading: false,
      }));
    }
  },

  updateProduct: async (id, updates) => {
    set({ isLoading: true, error: null });
    const { data, error } = await supabase
      .from("products")
      .update(updates)
      .eq("id", id)
      .select();

    if (error) {
      set({ error: error.message, isLoading: false });
      throw new Error(error.message);
    }

    if (data) {
      set((state) => ({
        products: state.products.map((p) => (p.id === id ? data[0] : p)),
        isLoading: false,
      }));
    }
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
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `images/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('products')
      .upload(filePath, file);

    if (uploadError) {
      set({ error: uploadError.message, isLoading: false });
      throw new Error(uploadError.message);
    }

    const { data } = supabase.storage
      .from('products')
      .getPublicUrl(filePath);

    set({ isLoading: false });
    return data.publicUrl;
  },
}));
