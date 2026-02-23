import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "../../../lib/supabase/server";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const VALID_STATUSES = ["active", "inactive", "terminated"];

// PATCH /api/associates/[id] — update name, hire date, status, position, department
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

  const { data: member } = await supabaseAdmin
    .from("company_members")
    .select("role, company_id, location_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || !["owner", "supervisor"].includes(member.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify the associate belongs to a location in this company
  const { data: assoc } = await supabaseAdmin
    .from("associates")
    .select("id, location_id, user_id, locations(company_id)")
    .eq("id", id)
    .maybeSingle();

  if (!assoc) {
    return NextResponse.json({ error: "Associate not found" }, { status: 404 });
  }

  const companyId = (assoc.locations as { company_id: string } | null)?.company_id;
  if (companyId !== member.company_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Supervisors can only update associates at their own location
  if (member.role === "supervisor" && assoc.location_id !== member.location_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  // ── Location transfer (owner-only, handled separately) ──────────────────
  if ("locationId" in body) {
    if (member.role !== "owner") {
      return NextResponse.json({ error: "Only owners can transfer associates between locations" }, { status: 403 });
    }

    const newLocationId = String(body.locationId ?? "").trim();
    if (!newLocationId) {
      return NextResponse.json({ error: "locationId is required" }, { status: 400 });
    }

    // Verify the target location belongs to this company
    const { data: targetLoc } = await supabaseAdmin
      .from("locations")
      .select("id, company_id")
      .eq("id", newLocationId)
      .maybeSingle();

    if (!targetLoc || targetLoc.company_id !== member.company_id) {
      return NextResponse.json({ error: "Location not found or does not belong to your company" }, { status: 403 });
    }

    // Update the associate row
    const { error: transferErr } = await supabaseAdmin
      .from("associates")
      .update({
        location_id:   newLocationId,
        // Clear role-specific fields that may not exist at the new location
        department_id: null,
        position_id:   null,
        station_id:    null,
      })
      .eq("id", id);

    if (transferErr) {
      return NextResponse.json({ error: transferErr.message }, { status: 500 });
    }

    // If the associate has a registered account, update their company_members location too
    if (assoc.user_id) {
      await supabaseAdmin
        .from("company_members")
        .update({ location_id: newLocationId })
        .eq("user_id", assoc.user_id as string)
        .eq("company_id", member.company_id);
    }

    return NextResponse.json({ updated: true, transferred: true });
  }

  // ── Standard profile update ─────────────────────────────────────────────
  const firstName    = String(body.firstName    ?? "").trim();
  const lastName     = String(body.lastName     ?? "").trim();
  const hireDate     = String(body.hireDate     ?? "").trim();
  const status       = String(body.status       ?? "active").trim();
  const positionId   = (body.positionId   as string | null) ?? null;
  const departmentId = (body.departmentId as string | null) ?? null;
  const stationId    = (body.stationId    as string | null) ?? null;

  if (!firstName || !lastName || !hireDate) {
    return NextResponse.json(
      { error: "firstName, lastName, and hireDate are required" },
      { status: 400 }
    );
  }

  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  // Supervisors cannot assign managerial positions
  if (positionId && member.role === "supervisor") {
    const { data: pos } = await supabaseAdmin
      .from("positions")
      .select("is_managerial")
      .eq("id", positionId)
      .maybeSingle();

    if (pos?.is_managerial) {
      return NextResponse.json(
        { error: "Only owners can assign managerial positions" },
        { status: 403 }
      );
    }
  }

  const { error: updateErr } = await supabaseAdmin
    .from("associates")
    .update({
      first_name:    firstName,
      last_name:     lastName,
      hire_date:     hireDate,
      status,
      position_id:   positionId,
      department_id: departmentId,
      station_id:    stationId,
    })
    .eq("id", id);

  if (updateErr) {
    console.error("[/api/associates/[id]] UPDATE error:", updateErr.message);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ updated: true });
}
