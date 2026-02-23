import { redirect } from "next/navigation";
import { createClient as createServerSupabase } from "../../../lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import SelfReviewForm from "./SelfReviewForm";
import SupervisorReviewForm from "./SupervisorReviewForm";
import ConversationView from "./ConversationView";
import CompletedSummary from "./CompletedSummary";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type SkillArea = {
  id: string;
  label: string;
  description: string | null;
  sort_order: number;
};

export type ReviewResponse = {
  skill_area_id: string;
  respondent_type: "self" | "supervisor";
  score: number;
};

export type ReviewNarrative = {
  question_key: string;
  respondent_type: "self" | "supervisor";
  response_text: string;
};

export type ProgressionPlan = {
  id: string;
  outcome: "strengthen_current" | "advance_to_next";
};

export type ProgressionMilestone = {
  day_target: number;
  goal_text: string;
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Caller's role
  const { data: member } = await supabaseAdmin
    .from("company_members")
    .select("id, role, company_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) redirect("/login");

  // Fetch the review
  const { data: review } = await supabaseAdmin
    .from("reviews")
    .select("id, status, type, review_year, associate_id, location_id")
    .eq("id", reviewId)
    .maybeSingle();

  if (!review) redirect("/dashboard");

  // Verify access
  if (member.role === "associate") {
    // Must be the associate who owns this review
    const { data: assocRecord } = await supabaseAdmin
      .from("associates")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!assocRecord || assocRecord.id !== review.associate_id) redirect("/dashboard");
  } else if (["owner", "supervisor"].includes(member.role)) {
    // Must belong to the same company
    const { data: loc } = await supabaseAdmin
      .from("locations")
      .select("company_id")
      .eq("id", review.location_id)
      .maybeSingle();
    if (!loc || loc.company_id !== member.company_id) redirect("/dashboard");
  } else {
    redirect("/dashboard");
  }

  // Associate name
  const { data: assoc } = await supabaseAdmin
    .from("associates")
    .select("first_name, last_name, id")
    .eq("id", review.associate_id)
    .maybeSingle();

  const associateName = assoc
    ? `${assoc.first_name} ${assoc.last_name}`
    : "Associate";

  // Skill areas for this location
  const { data: skillAreasRaw } = await supabaseAdmin
    .from("review_skill_areas")
    .select("id, label, description, sort_order")
    .eq("location_id", review.location_id)
    .order("sort_order");

  const skillAreas: SkillArea[] = (skillAreasRaw ?? []) as SkillArea[];

  // All responses for this review
  const { data: responsesRaw } = await supabaseAdmin
    .from("review_responses")
    .select("skill_area_id, respondent_type, score")
    .eq("review_id", reviewId);

  const responses: ReviewResponse[] = (responsesRaw ?? []) as ReviewResponse[];

  // All narratives for this review
  const { data: narrativesRaw } = await supabaseAdmin
    .from("review_narratives")
    .select("question_key, respondent_type, response_text")
    .eq("review_id", reviewId);

  const narratives: ReviewNarrative[] = (narrativesRaw ?? []) as ReviewNarrative[];

  // Helper partitions
  const selfResponses = responses.filter((r) => r.respondent_type === "self");
  const supResponses  = responses.filter((r) => r.respondent_type === "supervisor");
  const selfNarratives = narratives.filter((n) => n.respondent_type === "self");
  const supNarratives  = narratives.filter((n) => n.respondent_type === "supervisor");

  // Progression plan + milestones (completed reviews only)
  let plan: ProgressionPlan | null = null;
  let milestones: ProgressionMilestone[] = [];

  if (review.status === "completed") {
    const { data: planRaw } = await supabaseAdmin
      .from("progression_plans")
      .select("id, outcome")
      .eq("review_id", reviewId)
      .maybeSingle();

    if (planRaw) {
      plan = planRaw as ProgressionPlan;
      const { data: msRaw } = await supabaseAdmin
        .from("progression_milestones")
        .select("day_target, goal_text")
        .eq("plan_id", planRaw.id)
        .order("day_target");
      milestones = (msRaw ?? []) as ProgressionMilestone[];
    }
  }

  const reviewYear = review.review_year ?? new Date().getFullYear();

  // ---------------------------------------------------------------------------
  // Route by status + role
  // ---------------------------------------------------------------------------

  // COMPLETED — both roles see the same read-only summary
  if (review.status === "completed") {
    return (
      <CompletedSummary
        reviewId={reviewId}
        associateId={review.associate_id}
        associateName={associateName}
        reviewYear={reviewYear}
        skillAreas={skillAreas}
        selfResponses={selfResponses}
        supResponses={supResponses}
        selfNarratives={selfNarratives}
        supNarratives={supNarratives}
        plan={plan}
        milestones={milestones}
      />
    );
  }

  // IN CONVERSATION — supervisor sees full comparison + outcome form
  if (review.status === "in_conversation") {
    if (member.role === "associate") {
      return (
        <WaitingMessage
          associateName={associateName}
          reviewYear={reviewYear}
          message="Your supervisor is reviewing both sides and will reach out to schedule your review conversation."
          statusLabel="In conversation"
        />
      );
    }
    return (
      <ConversationView
        reviewId={reviewId}
        associateId={review.associate_id}
        associateName={associateName}
        reviewYear={reviewYear}
        skillAreas={skillAreas}
        selfResponses={selfResponses}
        supResponses={supResponses}
        selfNarratives={selfNarratives}
        supNarratives={supNarratives}
      />
    );
  }

  // PENDING SUPERVISOR
  if (review.status === "pending_supervisor") {
    if (member.role === "associate") {
      return (
        <WaitingMessage
          associateName={associateName}
          reviewYear={reviewYear}
          message="Your self-review has been submitted. Your supervisor will complete their assessment and then schedule a conversation with you."
          statusLabel="Awaiting supervisor"
        />
      );
    }
    return (
      <SupervisorReviewForm
        reviewId={reviewId}
        associateId={review.associate_id}
        associateName={associateName}
        reviewYear={reviewYear}
        skillAreas={skillAreas}
        selfResponses={selfResponses}
        selfNarratives={selfNarratives}
        existingSupResponses={supResponses}
        existingSupNarratives={supNarratives}
      />
    );
  }

  // PENDING SELF
  if (review.status === "pending_self") {
    if (member.role !== "associate") {
      return (
        <WaitingMessage
          associateName={associateName}
          reviewYear={reviewYear}
          message={`${associateName} has not yet completed their self-review. They will receive access to this form through their portal.`}
          statusLabel="Awaiting self-review"
        />
      );
    }
    return (
      <SelfReviewForm
        reviewId={reviewId}
        associateName={associateName}
        reviewYear={reviewYear}
        skillAreas={skillAreas}
        existingResponses={selfResponses}
        existingNarratives={selfNarratives}
      />
    );
  }

  redirect("/dashboard");
}

// ---------------------------------------------------------------------------
// Minimal waiting-state component (server-rendered, no interactivity needed)
// ---------------------------------------------------------------------------
function WaitingMessage({
  associateName,
  reviewYear,
  message,
  statusLabel,
}: {
  associateName: string;
  reviewYear: number;
  message: string;
  statusLabel: string;
}) {
  return (
    <main
      style={{
        padding: "40px 24px",
        maxWidth: 860,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <a
        href="/dashboard"
        style={{
          display: "inline-block",
          marginBottom: 24,
          fontSize: 14,
          color: "#6b7280",
          textDecoration: "none",
        }}
      >
        ← Dashboard
      </a>

      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
        {associateName} — Annual Review {reviewYear}
      </h1>
      <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 32 }}>{statusLabel}</p>

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: "28px 24px",
          color: "#374151",
          fontSize: 15,
          lineHeight: 1.6,
        }}
      >
        {message}
      </div>
    </main>
  );
}
