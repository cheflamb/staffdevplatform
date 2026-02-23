import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "../../lib/supabase/server";

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

type AnswerInput = {
  question_id: string;
  answer_text?: string;
  passed?: boolean | null;
};

export async function POST(req: Request) {
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
  const {
    associate_id,
    template_id,
    answers,
    overall_passed,
    notes,
    current_classification,
    proposed_classification,
  } = body;

  if (!isValidUUID(associate_id)) {
    return NextResponse.json({ error: "Invalid associate_id" }, { status: 400 });
  }
  if (!isValidUUID(template_id)) {
    return NextResponse.json({ error: "Invalid template_id" }, { status: 400 });
  }
  if (!Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json({ error: "answers required" }, { status: 400 });
  }
  if (typeof overall_passed !== "boolean") {
    return NextResponse.json({ error: "overall_passed must be boolean" }, { status: 400 });
  }
  if (typeof notes !== "string" || notes.trim().length === 0) {
    return NextResponse.json({ error: "notes required" }, { status: 400 });
  }

  // Verify associate belongs to caller's company
  const { data: assoc } = await supabaseAdmin
    .from("associates")
    .select("id, location_id, locations(company_id)")
    .eq("id", associate_id)
    .maybeSingle();

  if (!assoc) {
    return NextResponse.json({ error: "Associate not found" }, { status: 404 });
  }
  const locData = assoc.locations as unknown as { company_id: string } | null;
  if (locData?.company_id !== member.company_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify template belongs to same location
  const { data: template } = await supabaseAdmin
    .from("assessment_templates")
    .select("id, location_id, position_id")
    .eq("id", template_id)
    .maybeSingle();

  if (!template || template.location_id !== assoc.location_id) {
    return NextResponse.json({ error: "Template not found or location mismatch" }, { status: 400 });
  }

  // Insert assessment_results row
  const { data: result, error: resultErr } = await supabaseAdmin
    .from("assessment_results")
    .insert({
      associate_id,
      template_id,
      evaluator_id: member.id,
      date: new Date().toISOString().slice(0, 10),
      passed: overall_passed,
      notes: notes.trim(),
      current_classification: typeof current_classification === "string" ? current_classification : null,
      proposed_classification: typeof proposed_classification === "string" ? proposed_classification : null,
    })
    .select("id")
    .single();

  if (resultErr || !result) {
    return NextResponse.json({ error: "Failed to create assessment result" }, { status: 500 });
  }

  // Bulk insert answers
  const answerRows = (answers as AnswerInput[])
    .filter((a) => isValidUUID(a.question_id))
    .map((a) => ({
      result_id: result.id,
      question_id: a.question_id,
      answer_text: typeof a.answer_text === "string" ? a.answer_text : null,
      passed: typeof a.passed === "boolean" ? a.passed : null,
    }));

  if (answerRows.length > 0) {
    const { error: answersErr } = await supabaseAdmin
      .from("assessment_answers")
      .insert(answerRows);
    if (answersErr) {
      // Non-fatal — result exists; log but continue
      console.error("Failed to insert some assessment answers:", answersErr);
    }
  }

  // On pass: advance associate position to target position
  if (overall_passed) {
    await supabaseAdmin
      .from("associates")
      .update({ position_id: template.position_id })
      .eq("id", associate_id);
  }

  return NextResponse.json({ resultId: result.id, passed: overall_passed });
}
