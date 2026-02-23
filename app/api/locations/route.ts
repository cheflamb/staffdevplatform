import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "../../lib/supabase/server";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// POST /api/locations → create a new location for the owner's company + seed defaults
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Only owners can create locations
  const { data: member } = await supabaseAdmin
    .from("company_members")
    .select("role, company_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || member.role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
  const logo_url       = String(body.logo_url       ?? "").trim() || null;

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

  const { data: location, error: locationErr } = await supabaseAdmin
    .from("locations")
    .insert({
      company_id: member.company_id,
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
      logo_url,
    })
    .select("id")
    .single();

  if (locationErr) {
    console.error("[/api/locations] INSERT error:", locationErr.message);
    return NextResponse.json({ error: locationErr.message }, { status: 500 });
  }

  const { error: seedErr } = await supabaseAdmin.rpc("seed_location_defaults", {
    p_location_id: location.id,
  });

  if (seedErr) {
    console.error("[/api/locations] seed_location_defaults error:", seedErr.message);
  }

  return NextResponse.json({ locationId: location.id, created: true });
}
