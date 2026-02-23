import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "../../lib/supabase/server";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// POST /api/associates
// Creates an associate record then sends a Supabase invite email via SES.
// The invite trigger (014 migration) links the auth user back to this row
// when they accept.
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Caller must be owner or supervisor
  const { data: member } = await supabaseAdmin
    .from("company_members")
    .select("id, role, company_id, location_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || !["owner", "supervisor"].includes(member.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const firstName    = String(body.firstName    ?? "").trim();
  const lastName     = String(body.lastName     ?? "").trim();
  const email        = String(body.email        ?? "").trim().toLowerCase();
  const hireDate     = String(body.hireDate     ?? "").trim();
  const locationId   = String(body.locationId   ?? member.location_id ?? "").trim();
  const positionId   = (body.positionId   as string | null) ?? null;
  const departmentId = (body.departmentId as string | null) ?? null;
  const stationId    = (body.stationId    as string | null) ?? null;

  if (!firstName || !lastName || !email || !hireDate || !locationId) {
    return NextResponse.json(
      { error: "firstName, lastName, email, hireDate, and locationId are required" },
      { status: 400 }
    );
  }

  // Reject duplicate email within this company
  const { data: existing } = await supabaseAdmin
    .from("associates")
    .select("id, locations(company_id)")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: `An associate with email ${email} already exists. Check the roster or use a different address.` },
      { status: 409 }
    );
  }

  // Create the associates row (user_id left null until invite accepted)
  const { data: associate, error: assocErr } = await supabaseAdmin
    .from("associates")
    .insert({
      location_id:   locationId,
      supervisor_id: member.role === "supervisor" ? member.id : null,
      email,
      first_name:    firstName,
      last_name:     lastName,
      hire_date:     hireDate,
      position_id:   positionId || null,
      department_id: departmentId || null,
      station_id:    stationId || null,
      status:        "active",
    })
    .select("id")
    .single();

  if (assocErr) {
    console.error("[/api/associates] INSERT error:", assocErr.message);
    return NextResponse.json({ error: assocErr.message }, { status: 500 });
  }

  // Send invite — Supabase Auth uses the configured SES SMTP
  const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: `${APP_URL}/auth/callback`,
      data: { full_name: `${firstName} ${lastName}` },
    }
  );

  if (inviteErr) {
    console.error("[/api/associates] invite error:", inviteErr.message);
    // Associate row exists — they can be re-invited later. Don't block.
    return NextResponse.json({
      associateId: associate.id,
      invited: false,
      inviteError: inviteErr.message,
    });
  }

  return NextResponse.json({ associateId: associate.id, invited: true });
}
