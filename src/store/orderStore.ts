import { create } from "zustand";
import { supabase } from "../utils/supabase";

export interface Address {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  zipCode: string;
  state?: string;
  country?: string;
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  wholesale_price?: number;
  [key: string]: any;
}

export type PaymentDetails = {
  provider: "razorpay";
  provider_order_id: string;
  provider_payment_id: string;
  provider_signature: string;
  amount: number;
  currency: string;
  status: "verified";
  verified_at: string;
  method?: string;
  payment_phase?: "deposit" | "balance" | "full";
  remaining_balance?: number;
};

export type OrderPricingDetails = {
  subtotalAmount: number;
  productDiscountAmount: number;
  discountCode: string | null;
  discountPercent: number;
  couponDiscountAmount: number;
  shippingAmount: number;
  extraShippingAmount?: number;
  convenienceFeeAmount: number;
  codAmount?: number;
};

export interface Order {
  id: string;
  user_id: string | null;
  items: CartItem[];
  delivery_address: Address;
  payment_method: string;
  payment_details?: PaymentDetails | null;
  subtotal_amount?: number | null;
  discount_code?: string | null;
  discount_percent?: number | null;
  product_discount_amount?: number | null;
  coupon_discount_amount?: number | null;
  discount_amount?: number | null;
  shipping_amount?: number | null;
  extra_shipping_amount?: number | null;
  convenience_fee_amount?: number | null;
  cod_amount?: number | null;
  wholesale_total_amount?: number | null;
  cost_to_company?: number | null;
  profit_loss?: number | null;
  total_amount: number;
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled";
  shiprocket_order_id?: string | null;
  shiprocket_shipment_id?: string | null;
  shiprocket_awb_code?: string | null;
  shiprocket_courier_name?: string | null;
  shiprocket_tracking_url?: string | null;
  shipping_status?:
    | "pending"
    | "not_configured"
    | "sync_failed"
    | "created"
    | "awb_assigned"
    | "in_transit"
    | "out_for_delivery"
    | "delivered"
    | "cancelled"
    | string
    | null;
  shipping_error?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  created_at: string;
  rejection_reason?: string | null;
  cancellation_reason?: string | null;
  customer_name?: string | null;
  invoice_number?: string | null;
  invoice_generated_at?: string | null;
  razorpay_refund_id?: string | null;
  refund_status?: "pending" | "processed" | "failed" | string | null;
  refund_amount?: number | null;
  refunded_at?: string | null;
  refund_checked_at?: string | null;
}

export type RefundMode = "full" | "partial" | "none";

export type CancelOrderStepResult = {
  attempted: boolean;
  success: boolean;
  message: string | null;
};

export type CancelOrderResult = {
  order: Order;
  shipment: CancelOrderStepResult;
  refund: CancelOrderStepResult & {
    status: string | null;
    amount: number | null;
  };
};

export type SyncShippingResult = {
  order: Order;
  tracking: {
    attempted: boolean;
    success: boolean;
    message: string | null;
    courierName: string | null;
    status: string | null;
    trackingUrl: string | null;
  };
};

interface OrderState {
  orders: Order[];
  isLoading: boolean;
  error: string | null;
  fetchOrders: () => Promise<void>;
  updateOrderStatus: (
    id: string,
    status: string,
    rejectionReason?: string,
  ) => Promise<void>;
  getOrderById: (id: string) => Promise<Order | null>;
  cancelOrderWithRefund: (
    id: string,
    input: { reason: string; refund: { mode: RefundMode; amount?: number } },
  ) => Promise<CancelOrderResult>;
  syncShippingDetails: (
    id: string,
    input: {
      shiprocketOrderId?: string;
      shiprocketShipmentId?: string;
      awbCode?: string;
    },
  ) => Promise<SyncShippingResult>;
}

async function postToOrdersApi<T>(path: string, body: unknown): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("You must be signed in to do this.");
  }

  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(result?.error || "Request failed.");
  }

  return result as T;
}

export const useOrderStore = create<OrderState>()((set) => ({
  orders: [],
  isLoading: false,
  error: null,

  fetchOrders: async () => {
    set({ isLoading: true, error: null });
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      set({ error: error.message, isLoading: false });
      return;
    }

    set({ orders: data || [], isLoading: false });
  },

  updateOrderStatus: async (id, status, rejectionReason) => {
    set({ isLoading: true, error: null });
    const { data, error } = await supabase
      .from("orders")
      .update({
        status,
        rejection_reason: rejectionReason || null,
      })
      .eq("id", id)
      .select();

    if (error) {
      set({ error: error.message, isLoading: false });
      throw new Error(error.message);
    }

    if (data) {
      set((state) => ({
        orders: state.orders.map((o) => (o.id === id ? data[0] : o)),
        isLoading: false,
      }));
    }
  },

  getOrderById: async (id: string) => {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching order:", error);
      return null;
    }

    return data;
  },

  cancelOrderWithRefund: async (id, input) => {
    set({ isLoading: true, error: null });

    try {
      const result = await postToOrdersApi<CancelOrderResult>(
        "/api/orders/cancel",
        { orderId: id, ...input },
      );

      set((state) => ({
        orders: state.orders.map((o) => (o.id === id ? result.order : o)),
        isLoading: false,
      }));

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to cancel order.";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  syncShippingDetails: async (id, input) => {
    set({ isLoading: true, error: null });

    try {
      const result = await postToOrdersApi<SyncShippingResult>(
        "/api/orders/sync-shipping",
        { orderId: id, ...input },
      );

      set((state) => ({
        orders: state.orders.map((o) => (o.id === id ? result.order : o)),
        isLoading: false,
      }));

      return result;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update shipping details.";
      set({ error: message, isLoading: false });
      throw err;
    }
  },
}));
