import { redirect } from "next/navigation";
import { createClient as createServerSupabase } from "../../../lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import AssessmentForm from "./AssessmentForm";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export type AssessmentQuestion = {
  id: string;           // assessment_questions.id
  question_text: string;
  question_type: "written" | "practical" | "yes_no";
  skill_category: string;
  sort_order: number;
};

export default async function NewAssessmentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const { associate_id } = await searchParams;

  // Auth gate
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: member } = await supabaseAdmin
    .from("company_members")
    .select("id, role, company_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || !["owner", "supervisor"].includes(member.role)) {
    redirect("/dashboard");
  }

  if (!associate_id) redirect("/dashboard");

  // Fetch associate
  const { data: assoc } = await supabaseAdmin
    .from("associates")
    .select("id, first_name, last_name, position_id, location_id, locations(company_id)")
    .eq("id", associate_id)
    .maybeSingle();

  if (!assoc) redirect("/dashboard");

  const locData = assoc.locations as { company_id: string } | null;
  if (locData?.company_id !== member.company_id) redirect("/dashboard");

  if (!assoc.position_id) redirect(`/dashboard/associates/${associate_id}`);

  // Fetch current position
  const { data: currentPos } = await supabaseAdmin
    .from("positions")
    .select("id, title, level, department_id")
    .eq("id", assoc.position_id)
    .maybeSingle();

  if (!currentPos) redirect(`/dashboard/associates/${associate_id}`);

  // Derive target position (same dept + location, level + 1)
  const { data: targetPos } = await supabaseAdmin
    .from("positions")
    .select("id, title, level")
    .eq("location_id", assoc.location_id)
    .eq("department_id", currentPos.department_id)
    .eq("level", currentPos.level + 1)
    .maybeSingle();

  // If no target position, associate is already at max level
  if (!targetPos) redirect(`/dashboard/associates/${associate_id}`);

  // Find or create assessment template for (location, target position)
  let templateId: string;

  const { data: existingTemplate } = await supabaseAdmin
    .from("assessment_templates")
    .select("id")
    .eq("location_id", assoc.location_id)
    .eq("position_id", targetPos.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (existingTemplate) {
    templateId = existingTemplate.id;
  } else {
    // Create a new template
    const { data: newTemplate, error: tmplErr } = await supabaseAdmin
      .from("assessment_templates")
      .insert({
        location_id: assoc.location_id,
        position_id: targetPos.id,
        type: "written",  // mixed; stored on questions
        title: `${targetPos.title} Assessment`,
        is_active: true,
        created_by: member.id,
      })
      .select("id")
      .single();

    if (tmplErr || !newTemplate) redirect(`/dashboard/associates/${associate_id}`);
    templateId = newTemplate.id;

    // Auto-populate questions from global library for target level
    const { data: libraryQs } = await supabaseAdmin
      .from("question_library")
      .select("id, skill_category, question_text, question_type")
      .eq("is_global", true)
      .eq("position_level", targetPos.level)
      .order("skill_category")
      .order("id");

    if (libraryQs && libraryQs.length > 0) {
      const questionRows = libraryQs.map((q, idx) => ({
        template_id: templateId,
        library_question_id: q.id,
        sort_order: idx,
      }));
      await supabaseAdmin.from("assessment_questions").insert(questionRows);
    }
  }

  // Fetch template questions joined to library
  const { data: rawQuestions } = await supabaseAdmin
    .from("assessment_questions")
    .select(`
      id,
      sort_order,
      custom_text,
      question_library (
        skill_category,
        question_text,
        question_type
      )
    `)
    .eq("template_id", templateId)
    .order("sort_order");

  const questions: AssessmentQuestion[] = (rawQuestions ?? []).map((q) => {
    const lib = q.question_library as {
      skill_category: string;
      question_text: string;
      question_type: "written" | "practical" | "yes_no";
    } | null;
    return {
      id: q.id,
      question_text: q.custom_text ?? lib?.question_text ?? "",
      question_type: lib?.question_type ?? "written",
      skill_category: lib?.skill_category ?? "General",
      sort_order: q.sort_order,
    };
  }).filter((q) => q.question_text.length > 0);

  const associateName = `${assoc.first_name} ${assoc.last_name}`;

  return (
    <AssessmentForm
      associateId={associate_id}
      associateName={associateName}
      currentPosition={currentPos.title}
      targetPosition={targetPos.title}
      templateId={templateId}
      questions={questions}
    />
  );
}
