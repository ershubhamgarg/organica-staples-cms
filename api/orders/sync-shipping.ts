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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Mirrors lib/shiprocket.ts's normalizeTrackingStatus in the storefront repo,
// so a given Shiprocket status string always maps to the same shipping_status
// value here as it would via the automated webhook/polling path.
function normalizeTrackingStatus(status: string | null | undefined): string {
  const value = status?.toLowerCase() ?? "";

  if (value.includes("deliver")) return "delivered";
  if (value.includes("out for delivery")) return "out_for_delivery";
  if (value.includes("transit") || value.includes("shipped")) return "in_transit";
  if (value.includes("cancel")) return "cancelled";
  if (value.includes("pick") || value.includes("manifest")) return "awb_assigned";

  return "awb_assigned";
}

const getTrackingUrl = (awbCode: string) =>
  `https://www.shiprocket.in/shipment-tracking/?awb=${awbCode}`;

async function trackByAwb(awbCode: string): Promise<TrackingResult> {
  const email = process.env.SHIPROCKET_EMAIL?.trim();
  const password = process.env.SHIPROCKET_PASSWORD?.trim();

  if (!email || !password) {
    return {
      attempted: true,
      success: false,
      message: "Shiprocket credentials are not configured.",
      courierName: null,
      status: null,
      trackingUrl: null,
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

    const trackRes = await fetch(
      `${SHIPROCKET_API_BASE}/courier/track/awb/${encodeURIComponent(awbCode)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${authBody.token}` },
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
    .select("id")
    .eq("id", orderId)
    .single();

  if (fetchError || !order) {
    return json({ error: fetchError?.message ?? "Order was not found." }, 400);
  }

  const tracking: TrackingResult = awbCode
    ? await trackByAwb(awbCode)
    : {
        attempted: false,
        success: false,
        message: null,
        courierName: null,
        status: null,
        trackingUrl: null,
      };

  // Whatever identifiers the admin provided are saved regardless of whether
  // the tracking lookup succeeded — the goal is to let them fix a broken
  // record even if Shiprocket's tracking API is temporarily unhelpful.
  const updates: Record<string, unknown> = { shipping_error: null };
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

  return json({ order: updatedOrder, tracking });
}
