import { getSupabaseAdmin } from "../_lib/supabaseAdmin";

export const config = { runtime: "edge" };

// The PDF is generated once, at order confirmation on the storefront (see
// ensureInvoiceGenerated in the storefront's lib/invoiceGeneration.ts), and
// stored in the private "invoices" Supabase Storage bucket — this route
// only ever fetches that stored file, it never renders a PDF itself. No
// @react-pdf/renderer dependency needed here as a result.

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") {
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
    return json({ error: "Please sign in to download invoices." }, 401);
  }

  const {
    data: { user },
  } = await supabaseAdmin.auth.getUser(bearerToken);

  if (!user) {
    return json({ error: "Please sign in to download invoices." }, 401);
  }

  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");

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

  if (!order) {
    return json({ error: "Order was not found." }, 404);
  }

  if (!order.invoice_pdf_path) {
    return json(
      { error: "Invoice has not been generated for this order yet." },
      404,
    );
  }

  const { data: fileBlob, error: downloadError } = await supabaseAdmin.storage
    .from("invoices")
    .download(order.invoice_pdf_path);

  if (downloadError || !fileBlob) {
    return json(
      { error: downloadError?.message || "Unable to retrieve the invoice file." },
      500,
    );
  }

  const filename = `${(order.invoice_number || orderId).replace(/\//g, "-")}.pdf`;

  return new Response(fileBlob, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
