import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "../../../lib/supabase/server";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// GET /api/locations/[id] → fetch a single location (owner only)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: member } = await supabaseAdmin
    .from("company_members")
    .select("role, company_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || member.role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: location, error } = await supabaseAdmin
    .from("locations")
    .select("id, name, street_address, suite, city, state, zip, timezone, phone, gm_first_name, gm_last_name, gm_phone, logo_url")
    .eq("id", id)
    .eq("company_id", member.company_id)
    .maybeSingle();

  if (error || !location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  return NextResponse.json(location);
}

// PATCH /api/locations/[id] → update an existing location (owner only)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Only owners can edit locations
  const { data: member } = await supabaseAdmin
    .from("company_members")
    .select("role, company_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || member.role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Confirm the location belongs to this owner's company
  const { data: existing } = await supabaseAdmin
    .from("locations")
    .select("id")
    .eq("id", id)
    .eq("company_id", member.company_id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const name           = String(body.name           ?? "").trim();
  const street_address = String(body.street_address ?? "").trim();
  const city           = String(body.city           ?? "").trim();
  const state          = String(body.state          ?? "").trim();
  const timezone       = String(body.timezone       ?? "").trim() || "America/New_York";
  const suite          = String(body.suite          ?? "").trim() || null;
  const zip            = String(body.zip            ?? "").trim();
  const phone          = String(body.phone          ?? "").trim();
  const gm_first_name  = String(body.gm_first_name  ?? "").trim();
  const gm_last_name   = String(body.gm_last_name   ?? "").trim();
  const gm_phone       = String(body.gm_phone       ?? "").trim();
  // logo_url is optional — only update if explicitly included in the body
  const logo_url = "logo_url" in body
    ? (String(body.logo_url ?? "").trim() || null)
    : undefined;

  const missing = [
    !name           && "Location name",
    !street_address && "Street address",
    !city           && "City",
    !state          && "State",
    !zip            && "Zip code",
    !phone          && "Phone",
    !gm_first_name  && "GM first name",
    !gm_last_name   && "GM last name",
    !gm_phone       && "GM phone",
  ].filter(Boolean);

  if (missing.length) {
    return NextResponse.json(
      { error: `Required: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  const { error: updateErr } = await supabaseAdmin
    .from("locations")
    .update({
      name,
      street_address,
      suite,
      city,
      state,
      zip,
      timezone,
      phone,
      gm_first_name,
      gm_last_name,
      gm_phone,
      ...(logo_url !== undefined ? { logo_url } : {}),
    })
    .eq("id", id);

  if (updateErr) {
    console.error("[/api/locations/[id]] UPDATE error:", updateErr.message);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ updated: true });
}
