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

const SELF_KEYS = ["proud_of", "want_to_improve", "next_skills", "how_can_we_support"];
const SUP_KEYS  = ["strongest", "needs_support", "growth_path"];

export async function PATCH(
  _req: Request,
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

  const { data: review } = await supabaseAdmin
    .from("reviews")
    .select("id, associate_id, location_id, status")
    .eq("id", reviewId)
    .maybeSingle();

  if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });

  // ---------------------------------------------------------------------------
  // pending_self → pending_supervisor (associate submits their self-review)
  // ---------------------------------------------------------------------------
  if (review.status === "pending_self") {
    if (member.role !== "associate") {
      return NextResponse.json({ error: "Only the associate can submit their self-review" }, { status: 403 });
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

    // Count skill areas for the location
    const { count: areaCount } = await supabaseAdmin
      .from("review_skill_areas")
      .select("*", { count: "exact", head: true })
      .eq("location_id", review.location_id);

    // Count self responses
    const { count: responseCount } = await supabaseAdmin
      .from("review_responses")
      .select("*", { count: "exact", head: true })
      .eq("review_id", reviewId)
      .eq("respondent_type", "self");

    if ((responseCount ?? 0) < (areaCount ?? 0)) {
      return NextResponse.json(
        { error: `Please score all ${areaCount} skill areas before submitting` },
        { status: 422 }
      );
    }

    // Count self narratives
    const { data: selfNarratives } = await supabaseAdmin
      .from("review_narratives")
      .select("question_key")
      .eq("review_id", reviewId)
      .eq("respondent_type", "self");

    const submittedKeys = new Set((selfNarratives ?? []).map((n) => n.question_key));
    const missingKeys = SELF_KEYS.filter((k) => !submittedKeys.has(k));
    if (missingKeys.length > 0) {
      return NextResponse.json(
        { error: "Please answer all four questions before submitting" },
        { status: 422 }
      );
    }

    await supabaseAdmin
      .from("reviews")
      .update({ status: "pending_supervisor" })
      .eq("id", reviewId);

    return NextResponse.json({ ok: true, newStatus: "pending_supervisor" });
  }

  // ---------------------------------------------------------------------------
  // pending_supervisor → in_conversation (supervisor submits their review)
  // ---------------------------------------------------------------------------
  if (review.status === "pending_supervisor") {
    if (!["owner", "supervisor"].includes(member.role)) {
      return NextResponse.json({ error: "Only supervisors can advance from this stage" }, { status: 403 });
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

    // Count skill areas
    const { count: areaCount } = await supabaseAdmin
      .from("review_skill_areas")
      .select("*", { count: "exact", head: true })
      .eq("location_id", review.location_id);

    // Count supervisor responses
    const { count: responseCount } = await supabaseAdmin
      .from("review_responses")
      .select("*", { count: "exact", head: true })
      .eq("review_id", reviewId)
      .eq("respondent_type", "supervisor");

    if ((responseCount ?? 0) < (areaCount ?? 0)) {
      return NextResponse.json(
        { error: `Please score all ${areaCount} skill areas before submitting` },
        { status: 422 }
      );
    }

    // Count supervisor narratives
    const { data: supNarratives } = await supabaseAdmin
      .from("review_narratives")
      .select("question_key")
      .eq("review_id", reviewId)
      .eq("respondent_type", "supervisor");

    const submittedKeys = new Set((supNarratives ?? []).map((n) => n.question_key));
    const missingKeys = SUP_KEYS.filter((k) => !submittedKeys.has(k));
    if (missingKeys.length > 0) {
      return NextResponse.json(
        { error: "Please answer all three questions before submitting" },
        { status: 422 }
      );
    }

    await supabaseAdmin
      .from("reviews")
      .update({ status: "in_conversation" })
      .eq("id", reviewId);

    return NextResponse.json({ ok: true, newStatus: "in_conversation" });
  }

  return NextResponse.json(
    { error: `Cannot advance from status '${review.status}'` },
    { status: 409 }
  );
}
