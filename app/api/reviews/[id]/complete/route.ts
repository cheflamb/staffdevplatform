import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "../../../../lib/supabase/server";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function isValidUUID(s: unknown): s is string {
  return (
    typeof s === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  );
}

const VALID_OUTCOMES = new Set(["strengthen_current", "advance_to_next"]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reviewId } = await params;
  if (!isValidUUID(reviewId)) {
    return NextResponse.json({ error: "Invalid review id" }, { status: 400 });
  }

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

  const { data: review } = await supabaseAdmin
    .from("reviews")
    .select("id, associate_id, location_id, status")
    .eq("id", reviewId)
    .maybeSingle();

  if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });
  if (review.status !== "in_conversation") {
    return NextResponse.json({ error: "Review is not in conversation stage" }, { status: 409 });
  }

  // Verify company access
  const { data: loc } = await supabaseAdmin
    .from("locations")
    .select("company_id")
    .eq("id", review.location_id)
    .maybeSingle();
  if (!loc || loc.company_id !== member.company_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { outcome, milestone_30, milestone_60, milestone_90 } = body;

  if (typeof outcome !== "string" || !VALID_OUTCOMES.has(outcome)) {
    return NextResponse.json({ error: "Invalid outcome" }, { status: 400 });
  }
  if (typeof milestone_30 !== "string" || !milestone_30.trim()) {
    return NextResponse.json({ error: "milestone_30 is required" }, { status: 400 });
  }
  if (typeof milestone_60 !== "string" || !milestone_60.trim()) {
    return NextResponse.json({ error: "milestone_60 is required" }, { status: 400 });
  }
  if (typeof milestone_90 !== "string" || !milestone_90.trim()) {
    return NextResponse.json({ error: "milestone_90 is required" }, { status: 400 });
  }

  // Create progression plan
  const { data: plan, error: planErr } = await supabaseAdmin
    .from("progression_plans")
    .insert({
      review_id:    reviewId,
      associate_id: review.associate_id,
      outcome,
      created_by:   member.id,
    })
    .select("id")
    .single();

  if (planErr || !plan) {
    return NextResponse.json({ error: "Failed to create progression plan" }, { status: 500 });
  }

  // Create milestones
  const { error: msErr } = await supabaseAdmin
    .from("progression_milestones")
    .insert([
      { plan_id: plan.id, day_target: 30, goal_text: milestone_30.trim() },
      { plan_id: plan.id, day_target: 60, goal_text: milestone_60.trim() },
      { plan_id: plan.id, day_target: 90, goal_text: milestone_90.trim() },
    ]);

  if (msErr) {
    return NextResponse.json({ error: "Failed to create milestones" }, { status: 500 });
  }

  // Mark review completed
  const today = new Date().toISOString().split("T")[0];
  await supabaseAdmin
    .from("reviews")
    .update({ status: "completed", completed_date: today })
    .eq("id", reviewId);

  return NextResponse.json({ ok: true, planId: plan.id });
}
