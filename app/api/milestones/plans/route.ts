import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "../../../lib/supabase/server";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ---------------------------------------------------------------------------
// POST /api/milestones/plans
// Creates a ninety_day_plan for an associate and seeds completion rows for
// every milestone in the chosen track (BOH or FOH).
// Body: { associateId: string, departmentType: "BOH" | "FOH" }
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
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

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const associateId    = String(body.associateId    ?? "").trim();
  const departmentType = String(body.departmentType ?? "").trim();

  if (!associateId) {
    return NextResponse.json({ error: "associateId is required" }, { status: 400 });
  }
  if (!["BOH", "FOH"].includes(departmentType)) {
    return NextResponse.json({ error: 'departmentType must be "BOH" or "FOH"' }, { status: 400 });
  }

  // Verify the associate belongs to this company/location
  const { data: assoc } = await supabaseAdmin
    .from("associates")
    .select("id, hire_date, location_id, locations(company_id)")
    .eq("id", associateId)
    .maybeSingle();

  if (!assoc) {
    return NextResponse.json({ error: "Associate not found" }, { status: 404 });
  }

  const companyId = (assoc.locations as { company_id: string } | null)?.company_id;
  if (companyId !== member.company_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (member.role === "supervisor" && assoc.location_id !== member.location_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Idempotent — return existing plan if already created
  const { data: existing } = await supabaseAdmin
    .from("ninety_day_plans")
    .select("id")
    .eq("associate_id", associateId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ planId: existing.id, existed: true });
  }

  // Load all milestone IDs for this track
  const { data: milestones, error: msErr } = await supabaseAdmin
    .from("ninety_day_milestones")
    .select("id")
    .eq("department_type", departmentType);

  if (msErr || !milestones?.length) {
    return NextResponse.json({ error: "No milestones found for this track" }, { status: 500 });
  }

  // Create the plan
  const { data: plan, error: planErr } = await supabaseAdmin
    .from("ninety_day_plans")
    .insert({
      associate_id:    associateId,
      supervisor_id:   member.id,
      location_id:     assoc.location_id,
      department_type: departmentType,
      start_date:      assoc.hire_date ?? new Date().toISOString().split("T")[0],
    })
    .select("id")
    .single();

  if (planErr || !plan) {
    return NextResponse.json({ error: planErr?.message ?? "Failed to create plan" }, { status: 500 });
  }

  // Seed one completion row per milestone (all pending)
  const { error: compErr } = await supabaseAdmin
    .from("ninety_day_completions")
    .insert(milestones.map((m) => ({ plan_id: plan.id, milestone_id: m.id })));

  if (compErr) {
    return NextResponse.json({ error: compErr.message }, { status: 500 });
  }

  return NextResponse.json({ planId: plan.id });
}
