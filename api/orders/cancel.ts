import { getSupabaseAdmin } from "../_lib/supabaseAdmin";
import { refundRazorpayPayment } from "../_lib/razorpay";

export const config = { runtime: "edge" };

const SHIPROCKET_API_BASE = "https://apiv2.shiprocket.in/v1/external";

type RefundMode = "full" | "partial" | "none";

type CancelRequestBody = {
  orderId?: string;
  reason?: string;
  refund?: { mode?: RefundMode; amount?: number };
};

type StepResult = {
  attempted: boolean;
  success: boolean;
  message: string | null;
};

type PaymentDetails = {
  provider?: string;
  provider_payment_id?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function cancelShiprocketOrder(
  shiprocketOrderId: string,
): Promise<StepResult> {
  const email = process.env.SHIPROCKET_EMAIL?.trim();
  const password = process.env.SHIPROCKET_PASSWORD?.trim();

  if (!email || !password) {
    return {
      attempted: true,
      success: false,
      message: "Shiprocket credentials are not configured.",
    };
  }

  try {
    const authRes = await fetch(`${SHIPROCKET_API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const authBody = (await authRes.json().catch(() => ({}))) as {
      token?: string;
      message?: string;
    };

    if (!authRes.ok || !authBody.token) {
      throw new Error(
        authBody.message ?? `Shiprocket auth failed (${authRes.status}).`,
      );
    }

    const cancelRes = await fetch(`${SHIPROCKET_API_BASE}/orders/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authBody.token}`,
      },
      body: JSON.stringify({ ids: [shiprocketOrderId] }),
    });
    const cancelBody = (await cancelRes.json().catch(() => ({}))) as {
      message?: string;
    };

    if (!cancelRes.ok) {
      throw new Error(
        cancelBody.message ?? `Shiprocket cancel failed (${cancelRes.status}).`,
      );
    }

    return {
      attempted: true,
      success: true,
      message: cancelBody.message ?? "Shipment cancelled.",
    };
  } catch (error) {
    return {
      attempted: true,
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Shiprocket cancellation failed.",
    };
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const { client: supabaseAdmin, missing } = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return json(
      { error: `Server is missing Supabase configuration: ${missing.join(", ")}` },
      500,
    );
  }

  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  if (!bearerToken) {
    return json({ error: "Please sign in to cancel orders." }, 401);
  }

  const {
    data: { user },
  } = await supabaseAdmin.auth.getUser(bearerToken);

  if (!user) {
    return json({ error: "Please sign in to cancel orders." }, 401);
  }

  let payload: CancelRequestBody;
  try {
    payload = (await request.json()) as CancelRequestBody;
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const orderId = payload.orderId;
  const reason = payload.reason?.trim();
  const refundMode: RefundMode = payload.refund?.mode ?? "none";
  const refundAmountInput = payload.refund?.amount;

  if (!orderId) {
    return json({ error: "orderId is required." }, 400);
  }
  if (!reason) {
    return json({ error: "A cancellation reason is required." }, 400);
  }

  const { data: order, error: fetchError } = await supabaseAdmin
    .from("orders")
    .select(
      "id, status, total_amount, payment_method, payment_details, shiprocket_order_id, refund_amount",
    )
    .eq("id", orderId)
    .single();

  if (fetchError || !order) {
    return json({ error: fetchError?.message ?? "Order was not found." }, 400);
  }

  if (order.status === "cancelled") {
    return json({ error: "This order is already cancelled." }, 400);
  }

  const alreadyRefunded = order.refund_amount ?? 0;
  const refundableBalance = order.total_amount - alreadyRefunded;

  if (refundMode === "partial") {
    if (
      typeof refundAmountInput !== "number" ||
      !(refundAmountInput > 0) ||
      refundAmountInput > refundableBalance
    ) {
      return json(
        {
          error: `Refund amount must be greater than 0 and no more than ₹${refundableBalance.toFixed(2)}.`,
        },
        400,
      );
    }
  }

  const shipment: StepResult = order.shiprocket_order_id
    ? await cancelShiprocketOrder(order.shiprocket_order_id)
    : { attempted: false, success: false, message: null };

  const paymentDetails = order.payment_details as PaymentDetails | null;
  const canRefund =
    refundMode !== "none" &&
    order.payment_method === "razorpay" &&
    Boolean(paymentDetails?.provider_payment_id);

  const refund = canRefund
    ? await refundRazorpayPayment(
        paymentDetails!.provider_payment_id!,
        reason,
        refundMode === "partial" ? refundAmountInput : undefined,
        { cancelled_by: "admin_cms" },
      )
    : {
        attempted: false,
        success: false,
        message: null,
        status: null,
        amount: null,
        refundId: null,
      };

  const updates: Record<string, unknown> = {
    status: "cancelled",
    cancellation_reason: reason,
  };
  if (shipment.success) {
    updates.shipping_status = "cancelled";
  }
  if (refund.attempted) {
    updates.razorpay_refund_id = refund.refundId;
    updates.refund_status = refund.status;
    // Cumulative across all refunds ever issued for this order (a standalone
    // partial refund via api/orders/refund.ts may already have refunded some
    // of it before this cancellation) — never just the amount of this call.
    if (refund.success) {
      updates.refund_amount = alreadyRefunded + (refund.amount ?? 0);
      updates.refunded_at = new Date().toISOString();
    }
    updates.refund_checked_at = new Date().toISOString();
  }

  const { data: updatedOrder, error: updateError } = await supabaseAdmin
    .from("orders")
    .update(updates)
    .eq("id", orderId)
    .select()
    .single();

  if (updateError) {
    return json({ error: updateError.message }, 500);
  }

  return json({
    order: updatedOrder,
    shipment,
    refund,
  });
}
