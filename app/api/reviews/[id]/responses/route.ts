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

function isValidScore(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5;
}

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

  if (!member) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { skill_area_id, score, respondent_type } = body;

  if (!isValidUUID(skill_area_id)) {
    return NextResponse.json({ error: "Invalid skill_area_id" }, { status: 400 });
  }
  if (!isValidScore(score)) {
    return NextResponse.json({ error: "Score must be an integer from 1 to 5" }, { status: 400 });
  }
  if (respondent_type !== "self" && respondent_type !== "supervisor") {
    return NextResponse.json({ error: "Invalid respondent_type" }, { status: 400 });
  }

  // Fetch the review + associate's location for company check
  const { data: review } = await supabaseAdmin
    .from("reviews")
    .select("id, associate_id, location_id, status")
    .eq("id", reviewId)
    .maybeSingle();

  if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });

  if (member.role === "associate") {
    if (respondent_type !== "self") {
      return NextResponse.json({ error: "Associates can only submit self responses" }, { status: 403 });
    }
    if (review.status !== "pending_self") {
      return NextResponse.json({ error: "Self review is not currently open" }, { status: 409 });
    }
    // Verify this associate owns the review
    const { data: assocRecord } = await supabaseAdmin
      .from("associates")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!assocRecord || assocRecord.id !== review.associate_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (["owner", "supervisor"].includes(member.role)) {
    if (respondent_type !== "supervisor") {
      return NextResponse.json({ error: "Supervisors submit supervisor responses" }, { status: 403 });
    }
    if (review.status !== "pending_supervisor") {
      return NextResponse.json({ error: "Supervisor review is not currently open" }, { status: 409 });
    }
    // Verify location belongs to caller's company
    const { data: loc } = await supabaseAdmin
      .from("locations")
      .select("company_id")
      .eq("id", review.location_id)
      .maybeSingle();
    if (!loc || loc.company_id !== member.company_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error: upsertErr } = await supabaseAdmin
    .from("review_responses")
    .upsert(
      { review_id: reviewId, respondent_type, skill_area_id, score },
      { onConflict: "review_id,respondent_type,skill_area_id" }
    );

  if (upsertErr) {
    return NextResponse.json({ error: "Failed to save response" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
