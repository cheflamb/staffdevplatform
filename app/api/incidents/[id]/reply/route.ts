import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "../../../../lib/supabase/server";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ---------------------------------------------------------------------------
// POST /api/incidents/[id]/reply
// Staff member submits their right-of-reply on an incident in their record.
// One-time write — the DB function enforces idempotency.
// Side-effect: notifies the supervisor who recorded the incident.
// ---------------------------------------------------------------------------
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: incidentId } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Only staff members (associates) may submit a right-of-reply
  const { data: member } = await supabaseAdmin
    .from("company_members")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || member.role !== "associate") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const response = String(body.response ?? "").trim();
  if (!response) return NextResponse.json({ error: "response is required" }, { status: 400 });

  // Call the existing one-time-write DB function
  const { error: rpcErr } = await supabaseAdmin.rpc("submit_associate_response", {
    p_incident_id: incidentId,
    p_response:    response,
  });

  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 400 });
  }

  // Fetch the incident so we can notify the supervisor who recorded it
  const { data: incident } = await supabaseAdmin
    .from("incidents")
    .select("id, associate_id, recorded_by, type, associates(first_name, last_name), company_members(user_id)")
    .eq("id", incidentId)
    .maybeSingle();

  if (incident) {
    const supervisorUserId = (incident.company_members as unknown as { user_id: string } | null)?.user_id;
    const assocName = (() => {
      const a = incident.associates as unknown as { first_name: string; last_name: string } | null;
      return a ? `${a.first_name} ${a.last_name}` : "A staff member";
    })();

    if (supervisorUserId) {
      await supabaseAdmin
        .from("notifications")
        .insert({
          user_id: supervisorUserId,
          title:   `${assocName} submitted a reply`,
          body:    response.length > 120 ? response.slice(0, 117) + "…" : response,
          link:    `/dashboard/associates/${incident.associate_id}`,
        });
    }
  }

  return NextResponse.json({ replied: true });
}
