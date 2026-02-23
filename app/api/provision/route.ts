import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "../../lib/supabase/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required.");
if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");

// Admin client — uses service role key for privileged DB operations (bypasses RLS).
const supabaseAdmin = createAdminClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

// Reads the authenticated user from the cookie-based session.
async function getAuthenticatedUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

// GET /api/provision → "Does this user already have a company?"
export async function GET() {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[/api/provision] SELECT company_members error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const companyId = data?.company_id ?? null;
  return NextResponse.json({ hasCompany: Boolean(companyId), companyId });
}

// POST /api/provision → create company + first location + owner membership + seed defaults
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const name = String(body?.companyName ?? "").trim();
  const locationName = String(body?.locationName ?? "").trim();

  if (!name) {
    return NextResponse.json({ error: "Company name is required" }, { status: 400 });
  }
  if (!locationName) {
    return NextResponse.json({ error: "Location name is required" }, { status: 400 });
  }

  // Return existing company rather than erroring
  const existing = await supabaseAdmin
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    console.error("[/api/provision] existing lookup error:", existing.error.message);
    return NextResponse.json({ error: existing.error.message }, { status: 500 });
  }

  if (existing.data?.company_id) {
    return NextResponse.json({ companyId: existing.data.company_id, alreadyExists: true });
  }

  const { data: company, error: companyErr } = await supabaseAdmin
    .from("companies")
    .insert({ name })
    .select("id")
    .single();

  if (companyErr) {
    console.error("[/api/provision] INSERT companies error:", companyErr.message);
    return NextResponse.json({ error: companyErr.message }, { status: 500 });
  }

  const { error: memberErr } = await supabaseAdmin.from("company_members").insert({
    company_id: company.id,
    user_id: user.id,
    role: "owner",
  });

  if (memberErr) {
    console.error("[/api/provision] INSERT company_members error:", memberErr.message);
    return NextResponse.json({ error: memberErr.message }, { status: 500 });
  }

  const { data: location, error: locationErr } = await supabaseAdmin
    .from("locations")
    .insert({ company_id: company.id, name: locationName })
    .select("id")
    .single();

  if (locationErr) {
    console.error("[/api/provision] INSERT locations error:", locationErr.message);
    return NextResponse.json({ error: locationErr.message }, { status: 500 });
  }

  const { error: seedErr } = await supabaseAdmin.rpc("seed_location_defaults", {
    p_location_id: location.id,
  });

  if (seedErr) {
    // Non-fatal — defaults can be re-seeded manually; don't block account creation
    console.error("[/api/provision] seed_location_defaults error:", seedErr.message);
  }

  // Seed per-company alert escalation defaults (non-fatal)
  const { error: alertSeedErr } = await supabaseAdmin.rpc("seed_company_alert_defaults", {
    p_company_id: company.id,
  });

  if (alertSeedErr) {
    console.error("[/api/provision] seed_company_alert_defaults error:", alertSeedErr.message);
  }

  return NextResponse.json({ companyId: company.id, locationId: location.id, created: true });
}
