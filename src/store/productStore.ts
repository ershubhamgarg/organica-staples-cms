import { create } from "zustand";
import { type Product, type ProductVariant } from "../types/product";
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
  replaceVariants: (
    productId: string,
    variants: ProductVariant[],
  ) => Promise<void>;
}

type ProductInventoryRow = {
  available_quantity: number | null;
  reserved_quantity: number | null;
  low_stock_threshold: number | null;
};

type VariantInventoryRow = {
  available_quantity: number | null;
  low_stock_threshold: number | null;
};

type ProductVariantRow = ProductVariant & {
  product_variant_inventory?: VariantInventoryRow | VariantInventoryRow[] | null;
};

const VARIANTS_SELECT =
  "product_variants(*, product_variant_inventory(available_quantity, low_stock_threshold))";

function flattenVariantInventory(row: ProductVariantRow): ProductVariant {
  const inventory = Array.isArray(row.product_variant_inventory)
    ? row.product_variant_inventory[0]
    : row.product_variant_inventory;

  const { product_variant_inventory, ...rest } = row;
  void product_variant_inventory;

  return {
    ...rest,
    available_quantity: inventory?.available_quantity ?? null,
    low_stock_threshold: inventory?.low_stock_threshold ?? null,
  };
}

function flattenInventory(
  row: Product & {
    product_inventory?: ProductInventoryRow | ProductInventoryRow[] | null;
    product_variants?: ProductVariantRow[] | null;
  },
): Product {
  const inventory = Array.isArray(row.product_inventory)
    ? row.product_inventory[0]
    : row.product_inventory;

  const variants = (row.product_variants ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map(flattenVariantInventory);

  const { product_inventory, product_variants, ...rest } = row;
  void product_inventory;
  void product_variants;

  return {
    ...rest,
    available_quantity: inventory?.available_quantity ?? null,
    reserved_quantity: inventory?.reserved_quantity ?? null,
    low_stock_threshold: inventory?.low_stock_threshold ?? null,
    variants: variants.length > 0 ? variants : undefined,
  };
}

export const useProductStore = create<ProductState>()((set, get) => ({
  products: [],
  isLoading: false,
  error: null,

  fetchProducts: async () => {
    set({ isLoading: true, error: null });
    const { data, error } = await supabase
      .from("products")
      .select(
        `*, product_inventory(available_quantity, reserved_quantity, low_stock_threshold), ${VARIANTS_SELECT}`,
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
        `*, product_inventory(available_quantity, reserved_quantity, low_stock_threshold), ${VARIANTS_SELECT}`,
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
        `*, product_inventory(available_quantity, reserved_quantity, low_stock_threshold), ${VARIANTS_SELECT}`,
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

  replaceVariants: async (productId, variants) => {
    set({ isLoading: true, error: null });
    try {
      const existing = get().products.find((p) => p.id === productId)?.variants ?? [];
      const existingIds = new Set(existing.map((v) => v.id));
      const keptIds = new Set(variants.filter((v) => v.id !== undefined).map((v) => v.id));
      const idsToDelete = [...existingIds].filter((id) => !keptIds.has(id));

      if (idsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from("product_variants")
          .delete()
          .in("id", idsToDelete);

        if (deleteError) {
          throw new Error(
            deleteError.code === "23503"
              ? "Cannot remove a variant that already has orders against it. Mark it inactive instead."
              : deleteError.message,
          );
        }
      }

      for (const variant of variants) {
        const inventoryFields = {
          available_quantity: variant.available_quantity ?? 0,
          low_stock_threshold: variant.low_stock_threshold ?? 5,
        };

        if (variant.id !== undefined) {
          const { error: updateError } = await supabase
            .from("product_variants")
            .update({
              label: variant.label,
              weight: variant.weight,
              price: variant.price,
              wholesale_price: variant.wholesale_price ?? null,
              packet_cost: variant.packet_cost ?? null,
              sticker_cost: variant.sticker_cost ?? null,
              discount_percent: variant.discount_percent ?? 0,
              sort_order: variant.sort_order ?? 0,
              is_active: variant.is_active ?? true,
            })
            .eq("id", variant.id);

          if (updateError) throw new Error(updateError.message);

          const { error: inventoryError } = await supabase
            .from("product_variant_inventory")
            .update(inventoryFields)
            .eq("variant_id", variant.id);

          if (inventoryError) throw new Error(inventoryError.message);
        } else {
          const { data: created, error: insertError } = await supabase
            .from("product_variants")
            .insert({
              product_id: Number(productId),
              label: variant.label,
              weight: variant.weight,
              price: variant.price,
              wholesale_price: variant.wholesale_price ?? null,
              packet_cost: variant.packet_cost ?? null,
              sticker_cost: variant.sticker_cost ?? null,
              discount_percent: variant.discount_percent ?? 0,
              sort_order: variant.sort_order ?? 0,
            })
            .select()
            .single();

          if (insertError || !created) {
            throw new Error(insertError?.message || "Failed to create variant.");
          }

          // The on_variant_created trigger already inserted a zero-stock
          // row — this sets it to whatever the form specified.
          const { error: inventoryError } = await supabase
            .from("product_variant_inventory")
            .update(inventoryFields)
            .eq("variant_id", created.id);

          if (inventoryError) throw new Error(inventoryError.message);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save variants.";
      set({ error: message, isLoading: false });
      throw new Error(message, { cause: err });
    }

    set({ isLoading: false });
    await get().fetchProducts();
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
    // The real bucket is "images" (confirmed against every existing
    // product's stored image URL) — "products" doesn't exist, which is why
    // every upload was failing.
    const filePath = fileName;

    const { error: uploadError } = await supabase.storage
      .from("images")
      .upload(filePath, file);

    if (uploadError) {
      set({ error: uploadError.message, isLoading: false });
      throw new Error(uploadError.message);
    }

    const { data } = supabase.storage.from("images").getPublicUrl(filePath);

    set({ isLoading: false });
    return data.publicUrl;
  },
}));
