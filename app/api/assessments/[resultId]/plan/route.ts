import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "../../../../lib/supabase/server";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ resultId: string }> }
) {
  const { resultId } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: member } = await supabaseAdmin
    .from("company_members")
    .select("id, role, company_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || !["owner", "supervisor"].includes(member.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { milestone_30, milestone_60, milestone_90 } = body;

  if (
    typeof milestone_30 !== "string" || milestone_30.trim().length === 0 ||
    typeof milestone_60 !== "string" || milestone_60.trim().length === 0 ||
    typeof milestone_90 !== "string" || milestone_90.trim().length === 0
  ) {
    return NextResponse.json({ error: "All three milestones are required" }, { status: 400 });
  }

  // Fetch assessment result — must be a failed assessment
  const { data: result } = await supabaseAdmin
    .from("assessment_results")
    .select("id, associate_id, template_id, passed")
    .eq("id", resultId)
    .maybeSingle();

  if (!result) {
    return NextResponse.json({ error: "Assessment result not found" }, { status: 404 });
  }
  if (result.passed !== false) {
    return NextResponse.json({ error: "Can only create follow-up plan for a failed assessment" }, { status: 400 });
  }

  // Fetch template to get target position + location
  const { data: template } = await supabaseAdmin
    .from("assessment_templates")
    .select("id, location_id, position_id")
    .eq("id", result.template_id)
    .maybeSingle();

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Verify associate belongs to caller's company
  const { data: assoc } = await supabaseAdmin
    .from("associates")
    .select("id, location_id, locations(company_id)")
    .eq("id", result.associate_id)
    .maybeSingle();

  if (!assoc) {
    return NextResponse.json({ error: "Associate not found" }, { status: 404 });
  }
  const locData = assoc.locations as { company_id: string } | null;
  if (locData?.company_id !== member.company_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Create new advance_to_next progression plan
  const { data: plan, error: planErr } = await supabaseAdmin
    .from("progression_plans")
    .insert({
      associate_id: result.associate_id,
      outcome: "advance_to_next",
      target_position_id: template.position_id,
      created_by: member.id,
      review_id: null,
    })
    .select("id")
    .single();

  if (planErr || !plan) {
    return NextResponse.json({ error: "Failed to create progression plan" }, { status: 500 });
  }

  // Insert 3 milestones
  const milestones = [
    { plan_id: plan.id, day_target: 30, goal_text: milestone_30.trim(), assessment_template_id: template.id },
    { plan_id: plan.id, day_target: 60, goal_text: milestone_60.trim(), assessment_template_id: template.id },
    { plan_id: plan.id, day_target: 90, goal_text: milestone_90.trim(), assessment_template_id: template.id },
  ];

  const { error: milestonesErr } = await supabaseAdmin
    .from("progression_milestones")
    .insert(milestones);

  if (milestonesErr) {
    console.error("Failed to insert milestones:", milestonesErr);
  }

  return NextResponse.json({ planId: plan.id });
}
