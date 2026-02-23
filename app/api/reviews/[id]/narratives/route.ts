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

const SELF_KEYS     = new Set(["proud_of", "want_to_improve", "next_skills", "how_can_we_support"]);
const SUP_KEYS      = new Set(["strongest", "needs_support", "growth_path"]);

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
  const { question_key, response_text, respondent_type } = body;

  if (respondent_type !== "self" && respondent_type !== "supervisor") {
    return NextResponse.json({ error: "Invalid respondent_type" }, { status: 400 });
  }
  if (typeof question_key !== "string" || !question_key) {
    return NextResponse.json({ error: "Invalid question_key" }, { status: 400 });
  }
  if (respondent_type === "self" && !SELF_KEYS.has(question_key)) {
    return NextResponse.json({ error: "Invalid question_key for self respondent" }, { status: 400 });
  }
  if (respondent_type === "supervisor" && !SUP_KEYS.has(question_key)) {
    return NextResponse.json({ error: "Invalid question_key for supervisor respondent" }, { status: 400 });
  }
  if (typeof response_text !== "string" || !response_text.trim()) {
    return NextResponse.json({ error: "response_text is required" }, { status: 400 });
  }
  if (response_text.length > 3000) {
    return NextResponse.json({ error: "response_text exceeds 3000 characters" }, { status: 400 });
  }

  const { data: review } = await supabaseAdmin
    .from("reviews")
    .select("id, associate_id, location_id, status")
    .eq("id", reviewId)
    .maybeSingle();

  if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });

  if (member.role === "associate") {
    if (respondent_type !== "self") {
      return NextResponse.json({ error: "Associates can only submit self narratives" }, { status: 403 });
    }
    if (review.status !== "pending_self") {
      return NextResponse.json({ error: "Self review is not currently open" }, { status: 409 });
    }
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
      return NextResponse.json({ error: "Supervisors submit supervisor narratives" }, { status: 403 });
    }
    if (review.status !== "pending_supervisor") {
      return NextResponse.json({ error: "Supervisor review is not currently open" }, { status: 409 });
    }
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
    .from("review_narratives")
    .upsert(
      { review_id: reviewId, respondent_type, question_key, response_text: response_text.trim() },
      { onConflict: "review_id,respondent_type,question_key" }
    );

  if (upsertErr) {
    return NextResponse.json({ error: "Failed to save narrative" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
