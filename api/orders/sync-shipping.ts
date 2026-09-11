import { getSupabaseAdmin } from "../_lib/supabaseAdmin";

export const config = { runtime: "edge" };

const SHIPROCKET_API_BASE = "https://apiv2.shiprocket.in/v1/external";

type SyncRequestBody = {
  orderId?: string;
  shiprocketOrderId?: string;
  shiprocketShipmentId?: string;
  awbCode?: string;
};

type TrackingResult = {
  attempted: boolean;
  success: boolean;
  message: string | null;
  courierName: string | null;
  status: string | null;
  trackingUrl: string | null;
};

type CostCorrectionResult = {
  attempted: boolean;
  success: boolean;
  message: string | null;
  actualFreightCharge: number | null;
  delta: number | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

// Mirrors lib/shiprocket.ts's normalizeTrackingStatus in the storefront repo,
// so a given Shiprocket status string always maps to the same shipping_status
// value here as it would via the automated webhook/polling path.
function normalizeTrackingStatus(status: string | null | undefined): string {
  const value = status?.toLowerCase() ?? "";

  // "out for delivery" contains "deliver" as a substring — it must be
  // checked before the generic "deliver" branch below, or Shiprocket's
  // real "Out for Delivery" status (confirmed live, e.g. courier activity
  // code "OFD") gets misread as a completed "delivered" the moment a
  // courier picks up the package for the final leg, before it's actually
  // reached the customer.
  if (value.includes("out for delivery")) return "out_for_delivery";
  if (value.includes("deliver")) return "delivered";
  if (value.includes("transit") || value.includes("shipped")) return "in_transit";
  if (value.includes("cancel")) return "cancelled";
  if (value.includes("pick") || value.includes("manifest")) return "awb_assigned";

  return "awb_assigned";
}

const getTrackingUrl = (awbCode: string) =>
  `https://www.shiprocket.in/shipment-tracking/?awb=${awbCode}`;

async function getShiprocketToken(): Promise<
  { token: string; error: null } | { token: null; error: string }
> {
  const email = process.env.SHIPROCKET_EMAIL?.trim();
  const password = process.env.SHIPROCKET_PASSWORD?.trim();

  if (!email || !password) {
    return { token: null, error: "Shiprocket credentials are not configured." };
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
      return {
        token: null,
        error: authBody.message ?? `Shiprocket auth failed (${authRes.status}).`,
      };
    }

    return { token: authBody.token, error: null };
  } catch (error) {
    return {
      token: null,
      error: error instanceof Error ? error.message : "Shiprocket login failed.",
    };
  }
}

async function trackByAwb(awbCode: string, token: string): Promise<TrackingResult> {
  try {
    const trackRes = await fetch(
      `${SHIPROCKET_API_BASE}/courier/track/awb/${encodeURIComponent(awbCode)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const trackBody = (await trackRes.json().catch(() => ({}))) as {
      tracking_data?: {
        track_status?: number;
        error?: string;
        shipment_track?: Array<{
          courier_name?: string;
          current_status?: string;
        }>;
        track_url?: string;
      };
      message?: string;
    };

    if (!trackRes.ok) {
      throw new Error(trackBody.message ?? `Shiprocket track failed (${trackRes.status}).`);
    }

    const trackingData = trackBody.tracking_data;

    // A cancelled AWB is reported via tracking_data.error rather than a normal
    // status (e.g. "Ohh! This AWB has been cancelled.") — that's a real status,
    // not a lookup failure, so only genuine errors should be thrown here.
    if (trackingData?.error) {
      if (trackingData.error.toLowerCase().includes("cancel")) {
        return {
          attempted: true,
          success: true,
          message: "AWB is cancelled on Shiprocket.",
          courierName: null,
          status: "cancelled",
          trackingUrl: trackingData.track_url ?? getTrackingUrl(awbCode),
        };
      }
      throw new Error(trackingData.error);
    }

    const shipment = trackingData?.shipment_track?.[0];

    return {
      attempted: true,
      success: true,
      message: "Tracking details fetched.",
      courierName: shipment?.courier_name ?? null,
      status: normalizeTrackingStatus(shipment?.current_status),
      trackingUrl: trackingData?.track_url ?? getTrackingUrl(awbCode),
    };
  } catch (error) {
    return {
      attempted: true,
      success: false,
      message: error instanceof Error ? error.message : "Shiprocket tracking lookup failed.",
      courierName: null,
      status: null,
      trackingUrl: null,
    };
  }
}

// Shiprocket only knows the REAL freight charge once a courier/AWB has
// actually been assigned to a shipment — the amount used in the order's
// margin at creation time is a pre-purchase rate-check estimate (see
// lib/shiprocket.ts's estimateShiprocketRate in the storefront repo), which
// can differ from what's actually billed once weight is verified and a
// courier is locked in. This fetches that real figure from Shiprocket's
// order-details endpoint, keyed by Shiprocket's own order id (not ours).
async function fetchActualFreightCharge(
  shiprocketOrderId: string,
  token: string,
): Promise<{ freightCharge: number | null; error: string | null }> {
  try {
    const res = await fetch(
      `${SHIPROCKET_API_BASE}/orders/show/${encodeURIComponent(shiprocketOrderId)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const body = (await res.json().catch(() => ({}))) as {
      data?: {
        awb_data?: { charges?: { freight_charges?: number | string } };
      };
      message?: string;
    };

    if (!res.ok) {
      return {
        freightCharge: null,
        error: body.message ?? `Shiprocket order lookup failed (${res.status}).`,
      };
    }

    // Verified against live orders: the real (undocumented) shape is
    // data.awb_data.charges.freight_charges (a numeric string) — there is
    // no data.shipments[].freight_charges or top-level data.freight_charges
    // despite that being the more obvious guess from Shiprocket's public
    // docs. `data.shipments` does exist, but as a single object (not an
    // array) holding shipment status/courier/AWB info, not charges. Also
    // observed live: this field can be `""` (freight not yet finalized on
    // Shiprocket's side, e.g. pickup not yet scheduled) rather than simply
    // absent — `Number("")` is `0` in JS, which would otherwise be read as
    // "Shiprocket charged nothing" and wipe out a real cost, so empty/
    // whitespace-only strings are treated the same as "not present yet".
    const raw = body.data?.awb_data?.charges?.freight_charges;
    const hasValue =
      raw !== undefined &&
      raw !== null &&
      !(typeof raw === "string" && raw.trim() === "");
    const freightCharge = hasValue ? Number(raw) : null;

    if (freightCharge === null || !Number.isFinite(freightCharge)) {
      return {
        freightCharge: null,
        error:
          "Shiprocket hasn't finalized a freight charge for this shipment yet.",
      };
    }

    return { freightCharge, error: null };
  } catch (error) {
    return {
      freightCharge: null,
      error:
        error instanceof Error ? error.message : "Shiprocket order lookup failed.",
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
    return json({ error: "Please sign in to update shipping details." }, 401);
  }

  const {
    data: { user },
  } = await supabaseAdmin.auth.getUser(bearerToken);

  if (!user) {
    return json({ error: "Please sign in to update shipping details." }, 401);
  }

  let payload: SyncRequestBody;
  try {
    payload = (await request.json()) as SyncRequestBody;
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const orderId = payload.orderId;
  const shiprocketOrderId = payload.shiprocketOrderId?.trim() || undefined;
  const shiprocketShipmentId = payload.shiprocketShipmentId?.trim() || undefined;
  const awbCode = payload.awbCode?.trim() || undefined;

  if (!orderId) {
    return json({ error: "orderId is required." }, 400);
  }
  if (!shiprocketOrderId && !shiprocketShipmentId && !awbCode) {
    return json(
      { error: "Provide at least one of Shiprocket Order ID, Shipment ID, or AWB Code." },
      400,
    );
  }

  const { data: order, error: fetchError } = await supabaseAdmin
    .from("orders")
    .select(
      "id, status, shiprocket_order_id, shiprocket_awb_code, shipping_amount, extra_shipping_amount, cost_to_company, profit_loss",
    )
    .eq("id", orderId)
    .single();

  if (fetchError || !order) {
    return json({ error: fetchError?.message ?? "Order was not found." }, 400);
  }

  const effectiveShiprocketOrderId = shiprocketOrderId ?? order.shiprocket_order_id ?? undefined;
  const effectiveAwbCode = awbCode ?? order.shiprocket_awb_code ?? undefined;

  let shiprocketToken: string | null = null;
  let tokenError: string | null = null;
  if (awbCode || effectiveShiprocketOrderId) {
    const tokenResult = await getShiprocketToken();
    shiprocketToken = tokenResult.token;
    tokenError = tokenResult.error;
  }

  const tracking: TrackingResult =
    awbCode && shiprocketToken
      ? await trackByAwb(awbCode, shiprocketToken)
      : awbCode
        ? {
            attempted: true,
            success: false,
            message: tokenError,
            courierName: null,
            status: null,
            trackingUrl: null,
          }
        : {
            attempted: false,
            success: false,
            message: null,
            courierName: null,
            status: null,
            trackingUrl: null,
          };

  // The margin correction only makes sense once Shiprocket has actually
  // locked in a courier for this shipment (an AWB exists) — before that,
  // there's nothing "actual" to fetch yet, just the pre-purchase estimate
  // already baked into the order at creation time.
  const costCorrection: CostCorrectionResult = { attempted: false, success: false, message: null, actualFreightCharge: null, delta: null };
  const updates: Record<string, unknown> = { shipping_error: null };

  if (effectiveAwbCode && effectiveShiprocketOrderId) {
    costCorrection.attempted = true;

    if (!shiprocketToken) {
      costCorrection.message = tokenError;
    } else {
      const { freightCharge, error: freightError } = await fetchActualFreightCharge(
        effectiveShiprocketOrderId,
        shiprocketToken,
      );

      if (freightCharge === null) {
        costCorrection.message = freightError;
      } else {
        const shippingAmount = order.shipping_amount ?? 0;
        const previousExtraShipping = order.extra_shipping_amount ?? 0;
        const actualExtraShipping = Math.max(0, round2(freightCharge - shippingAmount));
        const delta = round2(actualExtraShipping - previousExtraShipping);

        costCorrection.success = true;
        costCorrection.actualFreightCharge = freightCharge;
        costCorrection.delta = delta;

        // Skip a no-op write when the estimate already matched (within
        // rounding) what Shiprocket actually charged.
        if (Math.abs(delta) >= 0.01) {
          updates.freight_charge = freightCharge;
          updates.extra_shipping_amount = actualExtraShipping;
          updates.cost_to_company = round2((order.cost_to_company ?? 0) + delta);
          updates.profit_loss = round2((order.profit_loss ?? 0) - delta);
          costCorrection.message = `Margin updated using Shiprocket's actual freight charge of ₹${freightCharge.toFixed(2)}.`;
        } else {
          costCorrection.message = "Actual freight charge matches the original estimate — no margin change needed.";
        }
      }
    }
  }

  // Whatever identifiers the admin provided are saved regardless of whether
  // the tracking lookup succeeded — the goal is to let them fix a broken
  // record even if Shiprocket's tracking API is temporarily unhelpful.
  if (shiprocketOrderId) updates.shiprocket_order_id = shiprocketOrderId;
  if (shiprocketShipmentId) updates.shiprocket_shipment_id = shiprocketShipmentId;
  if (awbCode) updates.shiprocket_awb_code = awbCode;
  if (tracking.success) {
    if (tracking.courierName) updates.shiprocket_courier_name = tracking.courierName;
    if (tracking.trackingUrl) updates.shiprocket_tracking_url = tracking.trackingUrl;
    if (tracking.status) {
      updates.shipping_status = tracking.status;
      if (tracking.status === "delivered") {
        updates.delivered_at = new Date().toISOString();
      }
      // A cancelled shipment (RTO, failed pickup, a manual cancel on
      // Shiprocket's own dashboard) is not the same as a cancelled order —
      // the order still needs fulfilling, typically via a new AWB — so this
      // sends it back to "processing" rather than leaving/setting "cancelled"
      // on the order itself, unless it's already cancelled or delivered
      // (both terminal states set deliberately elsewhere, left alone here).
      if (
        tracking.status === "cancelled" &&
        order.status !== "cancelled" &&
        order.status !== "delivered"
      ) {
        updates.status = "processing";
      }
    }
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

  return json({ order: updatedOrder, tracking, costCorrection });
}
