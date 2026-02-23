import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "../../lib/supabase/server";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const VALID_TYPES = ["verbal", "written", "separation", "commendation", "termination"] as const;
type IncidentType = typeof VALID_TYPES[number];

const TYPE_LABELS: Record<IncidentType, string> = {
  verbal:       "Verbal warning",
  written:      "Written warning",
  separation:   "Separation warning",
  commendation: "Commendation",
  termination:  "Separation record",
};

// ---------------------------------------------------------------------------
// POST /api/incidents
// Supervisor or owner logs an incident or commendation for a staff member.
// Body: { associateId, type, description }
// Side-effect: inserts a notification for the staff member (if they have an
//              account) so they know something was added to their record.
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: member } = await supabaseAdmin
    .from("company_members")
    .select("id, role, company_id, location_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || !["owner", "supervisor"].includes(member.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const associateId  = String(body.associateId  ?? "").trim();
  const type         = String(body.type         ?? "").trim() as IncidentType;
  const description  = String(body.description  ?? "").trim();

  if (!associateId) return NextResponse.json({ error: "associateId is required" }, { status: 400 });
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(", ")}` }, { status: 400 });
  }
  if (!description) return NextResponse.json({ error: "description is required" }, { status: 400 });

  // Verify associate access
  const { data: assoc } = await supabaseAdmin
    .from("associates")
    .select("id, user_id, first_name, last_name, location_id, locations(company_id)")
    .eq("id", associateId)
    .maybeSingle();

  if (!assoc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const companyId = (assoc.locations as unknown as { company_id: string } | null)?.company_id;
  if (companyId !== member.company_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (member.role === "supervisor" && assoc.location_id !== member.location_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Create incident record
  const { data: incident, error: insertErr } = await supabaseAdmin
    .from("incidents")
    .insert({
      associate_id: associateId,
      location_id:  assoc.location_id,
      recorded_by:  member.id,
      type,
      description,
    })
    .select("id")
    .single();

  if (insertErr || !incident) {
    return NextResponse.json({ error: insertErr?.message ?? "Failed to create incident" }, { status: 500 });
  }

  // Notify the staff member (if they have an account) ─────────────────────
  const associateUserId = assoc.user_id as string | null;
  if (associateUserId) {
    const isCommendation = type === "commendation";
    await supabaseAdmin
      .from("notifications")
      .insert({
        user_id: associateUserId,
        title:   isCommendation
          ? "You received a commendation"
          : `${TYPE_LABELS[type]} added to your record`,
        body: description.length > 120 ? description.slice(0, 117) + "…" : description,
        link: "/dashboard/associate",
      });
  }

  return NextResponse.json({ incidentId: incident.id });
}
