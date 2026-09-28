import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabaseAdmin";

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export type AuthedContext = { supabaseAdmin: SupabaseClient; user: User };

/**
 * Shared POST-only-auth-then-JSON boilerplate every api/orders/*.ts and
 * api/skus/*.ts handler in this module needs, to keep those files focused on
 * their actual logic. Not applied to the pre-existing api/orders/*.ts files
 * outside this feature — avoiding an unrelated refactor of code this task
 * didn't touch.
 */
export async function requireAuthedAdmin(
  request: Request,
): Promise<AuthedContext | Response> {
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
    return json({ error: "Please sign in." }, 401);
  }

  const {
    data: { user },
  } = await supabaseAdmin.auth.getUser(bearerToken);

  if (!user) {
    return json({ error: "Please sign in." }, 401);
  }

  return { supabaseAdmin, user };
}
