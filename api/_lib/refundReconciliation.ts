import type { SupabaseClient } from "@supabase/supabase-js";
import { getPaymentRefundState } from "./razorpay";

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export type OrderRow = {
  id: string;
  payment_method?: string | null;
  payment_details?: { provider_payment_id?: string } | null;
  refund_amount?: number | null;
  refund_status?: string | null;
  razorpay_refund_id?: string | null;
  [key: string]: unknown;
};

export type ReconcileRefundResult = {
  order: OrderRow;
  refund: {
    attempted: boolean;
    changed: boolean;
    previousAmount?: number;
    amount?: number;
    status?: string | null;
    message?: string | null;
  };
};

/**
 * Reconciles an order's refund_status/refund_amount/razorpay_refund_id
 * against Razorpay's own record for that payment — the single trusted
 * write path both api/orders/refund-status.ts (the automatic "on page
 * load" check and the manual "Refresh" button) and
 * api/orders/apply-refund-id.ts (a manually-entered refund ID, once
 * confirmed to actually belong to this order's payment) go through, so
 * there's exactly one place that decides what counts as "changed" and one
 * place that guards against regressing a previously-recorded refund.
 */
export async function reconcileOrderRefund(
  supabaseAdmin: SupabaseClient,
  order: OrderRow,
): Promise<ReconcileRefundResult> {
  const paymentDetails = order.payment_details;
  if (order.payment_method !== "razorpay" || !paymentDetails?.provider_payment_id) {
    return { order, refund: { attempted: false, changed: false } };
  }

  const refundState = await getPaymentRefundState(paymentDetails.provider_payment_id);

  if (!refundState.success) {
    // Non-fatal — this can run as a silent background check (page load), not
    // just a user-initiated one, so a Razorpay hiccup shouldn't necessarily
    // read as a hard failure to whichever caller invoked this.
    return {
      order,
      refund: { attempted: true, changed: false, message: refundState.message },
    };
  }

  const previousAmount = order.refund_amount ?? 0;
  const nextAmount = refundState.hasAnyRefund ? round2(refundState.amount ?? 0) : 0;

  // Razorpay has no "un-refund" operation, so it reporting *less* refunded
  // than what's already on record is far more likely to mean this check ran
  // against the wrong Razorpay account/mode (e.g. a stale test-mode key
  // somewhere while the real payment is live-mode) than a genuine reversal —
  // refuse to regress the stored amount. This previously let a single
  // wrong-credentialed check silently wipe out a correctly-recorded refund.
  if (nextAmount < previousAmount) {
    return {
      order,
      refund: {
        attempted: true,
        changed: false,
        message:
          "Razorpay reported a lower refunded amount than already on record — ignored as a likely credential/mode mismatch rather than applied.",
      },
    };
  }

  const changed =
    nextAmount !== previousAmount ||
    (refundState.status ?? null) !== (order.refund_status ?? null) ||
    (refundState.refundId ?? null) !== (order.razorpay_refund_id ?? null);

  if (!changed) {
    return { order, refund: { attempted: true, changed: false } };
  }

  const updates = {
    razorpay_refund_id: refundState.refundId,
    refund_status: refundState.status,
    refund_amount: refundState.hasAnyRefund ? nextAmount : null,
    refunded_at: refundState.refundedAt,
    refund_checked_at: new Date().toISOString(),
  };

  const { data: updatedOrder, error: updateError } = await supabaseAdmin
    .from("orders")
    .update(updates)
    .eq("id", order.id)
    .select()
    .single();

  if (updateError) {
    throw new Error(updateError.message);
  }

  return {
    order: updatedOrder,
    refund: {
      attempted: true,
      changed: true,
      previousAmount,
      amount: nextAmount,
      status: refundState.status,
    },
  };
}
