import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "../../../../lib/supabase/server";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ---------------------------------------------------------------------------
// PATCH /api/milestones/completions/[id]
// Marks a ninety_day_completion as completed or skipped.
// Body: { status: "completed" | "skipped", checklistState: Record<string,boolean>, notes?: string }
// ---------------------------------------------------------------------------
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
    .select("id, role, company_id, location_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || !["owner", "supervisor"].includes(member.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify this completion is accessible to the caller (via plan → location → company)
  const { data: comp } = await supabaseAdmin
    .from("ninety_day_completions")
    .select("id, plan_id, ninety_day_plans(location_id, locations(company_id))")
    .eq("id", id)
    .maybeSingle();

  if (!comp) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const plan = comp.ninety_day_plans as {
    location_id: string;
    locations: { company_id: string } | null;
  } | null;

  if (!plan || plan.locations?.company_id !== member.company_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (member.role === "supervisor" && plan.location_id !== member.location_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const status = String(body.status ?? "").trim();
  const notes  = String(body.notes  ?? "").trim() || null;
  const checklistState =
    typeof body.checklistState === "object" && body.checklistState !== null
      ? (body.checklistState as Record<string, boolean>)
      : {};

  if (!["completed", "skipped"].includes(status)) {
    return NextResponse.json(
      { error: 'status must be "completed" or "skipped"' },
      { status: 400 }
    );
  }

  const { error: updateErr } = await supabaseAdmin
    .from("ninety_day_completions")
    .update({
      status,
      completed_at:    new Date().toISOString(),
      completed_by:    member.id,
      checklist_state: checklistState,
      notes,
    })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ updated: true });
}
