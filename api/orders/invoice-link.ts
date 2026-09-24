import { getSupabaseAdmin } from "../_lib/supabaseAdmin";

export const config = { runtime: "edge" };

// A GST invoice is stored in a private Storage bucket (see invoice.ts) —
// there's no public URL a customer's browser could hit directly. This
// route mints a time-limited signed URL instead, specifically so the
// WhatsApp order-confirmation message (api/orders/... isn't reachable from
// a customer's session at all) can include a link the customer themselves
// can open, without making the whole "invoices" bucket public.

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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
    return json({ error: "Please sign in to share invoices." }, 401);
  }

  const {
    data: { user },
  } = await supabaseAdmin.auth.getUser(bearerToken);

  if (!user) {
    return json({ error: "Please sign in to share invoices." }, 401);
  }

  let payload: { orderId?: string };
  try {
    payload = (await request.json()) as { orderId?: string };
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const orderId = payload.orderId;
  if (!orderId) {
    return json({ error: "orderId is required." }, 400);
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .select("id, invoice_number, invoice_pdf_path")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    return json({ error: orderError.message }, 500);
  }

  if (!order?.invoice_pdf_path) {
    return json(
      { error: "Invoice has not been generated for this order yet." },
      404,
    );
  }

  // Without `download`, Supabase serves the file with no
  // Content-Disposition header at all, so the browser just renders the PDF
  // inline instead of saving it — verified live (curl -I showed no
  // content-disposition without this option, and "attachment" with it).
  const filename = `${(order.invoice_number || orderId).replace(/\//g, "-")}.pdf`;
  const { data: signed, error: signError } = await supabaseAdmin.storage
    .from("invoices")
    .createSignedUrl(order.invoice_pdf_path, SIGNED_URL_TTL_SECONDS, {
      download: filename,
    });

  if (signError || !signed) {
    return json(
      { error: signError?.message || "Unable to create a shareable invoice link." },
      500,
    );
  }

  return json({ url: signed.signedUrl });
}
