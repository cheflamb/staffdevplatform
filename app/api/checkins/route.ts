import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "../../lib/supabase/server";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type PromptEntry = {
  promptId: string;
  notes?: string;
  tags?: string[];
};

type SelfAssessmentBody = {
  talkRatioScore: number;
  listeningScore: number;
  questionQualityScore: number;
  emotionalAcknowledgementScore: number;
  paraphrasingScore: number;
  coachingScore: number;
  distractionScore: number;
  nextStepScore: number;
  valueScore: number;
  improvementNotes?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isValidScore(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5;
}

function isValidUUID(s: unknown): s is string {
  return (
    typeof s === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  );
}

// ---------------------------------------------------------------------------
// Flag evaluation
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Wellness / safety keywords
// Words/phrases that suggest the associate may be struggling or the
// environment may be unsafe. Matched case-insensitively as whole words
// so "quit" doesn't fire on "quite", etc.
// ---------------------------------------------------------------------------
const CONCERN_PATTERNS = [
  /\bquit(ting)?\b/,
  /\bleaving\b/,
  /\bresign(ation|ed|ing)?\b/,
  /\bburnout\b/,
  /\bburnt?\s+out\b/,
  /\bexhaust(ed|ion)\b/,
  /\boverwhelm(ed|ing)\b/,
  /\bhostile?\b/,
  /\bconflict\b/,
  /\bunsafe\b/,
  /\bharassment\b/,
  /\bthreatened?\b/,
  /\bcrying\b/,
  /\bbroken\s+down\b/,
  /\btoxic\b/,
  /\bmistreat(ed|ment)\b/,
  /\bdisrespect(ed|ful)?\b/,
  /\bmental\s+health\b/,
  /\banxiet(y|ies)\b/,
  /\bdepressed?\b/,
  /\bstruggling\b/,
  /\bcan'?t\s+(cope|do\s+this|take\s+it)\b/,
  /\btoo\s+much\b/,
];

const CONCERN_TAGS = new Set(["stress", "friction"]);

// ---------------------------------------------------------------------------
// Discriminatory language — slurs and on-the-job substance use indicators.
// These produce a separate, higher-severity "discriminatory_language" reason.
// Patterns are matched case-insensitively.
// NOTE: This list is intentionally limited to unambiguous terms for the MVP.
//       Production deployments should supplement with a content-moderation API.
// ---------------------------------------------------------------------------
/* eslint-disable no-useless-escape */
const DISCRIMINATORY_PATTERNS: RegExp[] = [
  // ── Racial / ethnic slurs ────────────────────────────────────────────────
  /\bn[i1]gg[ae]r\b/i,
  /\bn[i1]gg[ae]rs\b/i,
  /\bspic\b/i,
  /\bwetback\b/i,
  /\bchink\b/i,
  /\bgook\b/i,
  /\btowelhead\b/i,
  /\bkike\b/i,
  /\bjig?aboo\b/i,
  /\bcoon\b/i,
  /\bbeaner\b/i,
  /\bporch\s*monkey\b/i,
  /\bzip\s*perhead\b/i,
  /\bslant\s*eye\b/i,
  // ── Gender / orientation slurs ───────────────────────────────────────────
  /\bf[a4]gg?[oi]t\b/i,
  /\bf[a4]gs\b/i,
  /\bdyke\b/i,
  // ── On-the-job substance use (contextual phrases, not bare drug names) ───
  /\bhigh\s+at\s+(work|the\s+store|the\s+restaurant)\b/i,
  /\bstoned\s+at\s+(work|the\s+store|the\s+restaurant)\b/i,
  /\bdrunk\s+at\s+(work|the\s+store|the\s+restaurant)\b/i,
  /\bsmoking\s+(weed|pot|dope|crack|meth|a\s+blunt|a\s+joint)\b/i,
  /\bsnorting\b/i,
  /\bshooting\s+up\b/i,
  /\boverdos(e|ed|ing)\b/i,
  /\bfentanyl\b/i,
  /\bheroin\b/i,
  /\bcrystal\s+meth\b/i,
  /\bdealing\s+(drugs|weed|dope|crack)\b/i,
];
/* eslint-enable no-useless-escape */

type FlagResult = { flagged: boolean; reasons: string[] };

function evaluateFlags(
  promptEntries: PromptEntry[],
  notesSummary: string,
  sa: Partial<SelfAssessmentBody>
): FlagResult {
  const reasons: string[] = [];

  // Combine all free-text for pattern matching
  const allText = [
    notesSummary,
    ...promptEntries.map((p) => p.notes ?? ""),
  ]
    .join(" ")
    .toLowerCase();

  // 1. Discriminatory language (highest severity — checked first, separate reason)
  const hasDiscriminatoryLanguage = DISCRIMINATORY_PATTERNS.some((re) => re.test(allText));
  if (hasDiscriminatoryLanguage) {
    reasons.push("discriminatory_language");
  }

  // 2. Wellness / safety keyword scan
  const hitPatterns = CONCERN_PATTERNS.filter((re) => re.test(allText));
  if (hitPatterns.length > 0) {
    reasons.push("concern_keywords");
  }

  // 3. Tag scan — stress or friction present on any prompt
  const hasConcernTag = promptEntries.some((p) =>
    (p.tags ?? []).some((t) => CONCERN_TAGS.has(t))
  );
  if (hasConcernTag) {
    reasons.push("concern_tags");
  }

  // 4. Poor self-assessment — meeting not valuable or no clear next step
  if ((sa.valueScore ?? 5) <= 2 || (sa.nextStepScore ?? 5) <= 2) {
    reasons.push("low_scores");
  }

  return { flagged: reasons.length > 0, reasons };
}

// ---------------------------------------------------------------------------
// POST /api/checkins
// Body:
//   associateId        — uuid
//   roleLevel          — "line" | "lead"
//   prompts            — PromptEntry[] (min 3, max 10)
//   notesSummary       — string (required)
//   followupCommitment — string (required)
//   revisitDate        — YYYY-MM-DD (optional)
//   shareWithAssociate — boolean (default false)
//   selfAssessment     — SelfAssessmentBody (required)
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Caller must be owner or supervisor
  const { data: member } = await supabaseAdmin
    .from("company_members")
    .select("id, role, company_id, location_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || !["owner", "supervisor"].includes(member.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  // ── Validate required fields ────────────────────────────────────────────
  const associateId         = String(body.associateId ?? "").trim();
  const scheduledCheckinId  = isValidUUID(body.scheduledCheckinId) ? (body.scheduledCheckinId as string) : null;
  const roleLevel           = String(body.roleLevel   ?? "").trim();
  const notesSummary       = String(body.notesSummary       ?? "").trim();
  const followupCommitment = String(body.followupCommitment ?? "").trim();
  const revisitDate        = String(body.revisitDate ?? "").trim() || null;
  const shareWithAssociate = Boolean(body.shareWithAssociate ?? false);
  const prompts            = Array.isArray(body.prompts) ? (body.prompts as PromptEntry[]) : [];
  const selfAssessment     = (body.selfAssessment ?? {}) as Partial<SelfAssessmentBody>;

  if (!associateId) {
    return NextResponse.json({ error: "associateId is required" }, { status: 400 });
  }
  if (!["line", "lead"].includes(roleLevel)) {
    return NextResponse.json(
      { error: 'roleLevel must be "line" or "lead"' },
      { status: 400 }
    );
  }
  if (!notesSummary) {
    return NextResponse.json({ error: "notesSummary is required" }, { status: 400 });
  }
  if (!followupCommitment) {
    return NextResponse.json({ error: "followupCommitment is required" }, { status: 400 });
  }
  if (prompts.length < 3) {
    return NextResponse.json(
      { error: "At least 3 prompts are required" },
      { status: 400 }
    );
  }
  for (const p of prompts) {
    if (!isValidUUID(p.promptId)) {
      return NextResponse.json({ error: "Each prompt entry must have a valid promptId" }, { status: 400 });
    }
  }

  // Validate self-assessment scores
  const saFields: (keyof SelfAssessmentBody)[] = [
    "talkRatioScore", "listeningScore", "questionQualityScore",
    "emotionalAcknowledgementScore", "paraphrasingScore", "coachingScore",
    "distractionScore", "nextStepScore", "valueScore",
  ];
  for (const field of saFields) {
    if (!isValidScore(selfAssessment[field])) {
      return NextResponse.json(
        { error: `selfAssessment.${field} must be an integer between 1 and 5` },
        { status: 400 }
      );
    }
  }

  // ── Verify associate belongs to caller's company ────────────────────────
  const { data: assoc } = await supabaseAdmin
    .from("associates")
    .select("id, location_id, locations(company_id)")
    .eq("id", associateId)
    .maybeSingle();

  if (!assoc) {
    return NextResponse.json({ error: "Associate not found" }, { status: 404 });
  }

  const companyId = (assoc.locations as unknown as { company_id: string } | null)?.company_id;
  if (companyId !== member.company_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (member.role === "supervisor" && assoc.location_id !== member.location_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const today      = new Date().toISOString().split("T")[0];
  const completedAt = new Date().toISOString();

  let checkinId: string;

  if (scheduledCheckinId) {
    // ── Fulfil an existing scheduled milestone row ──────────────────────
    // Verify the scheduled row actually belongs to this associate and is still open
    const { data: scheduled } = await supabaseAdmin
      .from("check_ins")
      .select("id, associate_id, status")
      .eq("id", scheduledCheckinId)
      .maybeSingle();

    const canFulfil =
      scheduled &&
      scheduled.associate_id === associateId &&
      scheduled.status === "scheduled";

    if (canFulfil) {
      const { error: updateErr } = await supabaseAdmin
        .from("check_ins")
        .update({
          supervisor_id:        member.id,
          completed_at:         completedAt,
          status:               "completed",
          role_level_snapshot:  roleLevel,
          notes_summary:        notesSummary,
          followup_commitment:  followupCommitment,
          revisit_date:         revisitDate || null,
          share_with_associate: shareWithAssociate,
        })
        .eq("id", scheduledCheckinId);

      if (updateErr) {
        console.error("[/api/checkins] UPDATE scheduled check-in error:", updateErr.message);
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      checkinId = scheduledCheckinId;
    } else {
      // Scheduled row is gone or mismatched — fall through to a new row
      const { data: newRow, error: insertErr } = await supabaseAdmin
        .from("check_ins")
        .insert({
          associate_id:         associateId,
          supervisor_id:        member.id,
          location_id:          assoc.location_id,
          scheduled_date:       today,
          completed_at:         completedAt,
          status:               "completed",
          role_level_snapshot:  roleLevel,
          notes_summary:        notesSummary,
          followup_commitment:  followupCommitment,
          revisit_date:         revisitDate || null,
          share_with_associate: shareWithAssociate,
        })
        .select("id")
        .single();
      if (insertErr || !newRow) {
        return NextResponse.json({ error: insertErr?.message ?? "Failed to create check-in" }, { status: 500 });
      }
      checkinId = newRow.id as string;
    }
  } else {
    // ── No scheduled row — insert a fresh adhoc check-in ─────────────────
    const { data: checkin, error: checkinErr } = await supabaseAdmin
      .from("check_ins")
      .insert({
        associate_id:         associateId,
        supervisor_id:        member.id,
        location_id:          assoc.location_id,
        scheduled_date:       today,
        completed_at:         completedAt,
        status:               "completed",
        role_level_snapshot:  roleLevel,
        notes_summary:        notesSummary,
        followup_commitment:  followupCommitment,
        revisit_date:         revisitDate || null,
        share_with_associate: shareWithAssociate,
      })
      .select("id")
      .single();

    if (checkinErr || !checkin) {
      console.error("[/api/checkins] INSERT check-in error:", checkinErr?.message);
      return NextResponse.json({ error: checkinErr?.message ?? "Failed to create check-in" }, { status: 500 });
    }

    checkinId = checkin.id as string;
  }

  // ── Insert checkin_prompts ──────────────────────────────────────────────
  const promptRows = prompts.map((p) => ({
    checkin_id: checkinId,
    prompt_id:  p.promptId,
    notes:      p.notes?.trim() ?? null,
    tags:       Array.isArray(p.tags) ? p.tags.filter((t) => typeof t === "string") : [],
  }));

  const { error: promptsErr } = await supabaseAdmin
    .from("checkin_prompts")
    .insert(promptRows);

  if (promptsErr) {
    console.error("[/api/checkins] INSERT prompts error:", promptsErr.message);
    // Cascade will clean checkin_prompts if we delete; leave check-in row for now
    return NextResponse.json({ error: promptsErr.message }, { status: 500 });
  }

  // ── Insert self_assessment ──────────────────────────────────────────────
  const { error: saErr } = await supabaseAdmin
    .from("self_assessments")
    .insert({
      checkin_id:                      checkinId,
      talk_ratio_score:                selfAssessment.talkRatioScore,
      listening_score:                 selfAssessment.listeningScore,
      question_quality_score:          selfAssessment.questionQualityScore,
      emotional_acknowledgement_score: selfAssessment.emotionalAcknowledgementScore,
      paraphrasing_score:              selfAssessment.paraphrasingScore,
      coaching_score:                  selfAssessment.coachingScore,
      distraction_score:               selfAssessment.distractionScore,
      next_step_score:                 selfAssessment.nextStepScore,
      value_score:                     selfAssessment.valueScore,
      improvement_notes:               selfAssessment.improvementNotes?.trim() ?? null,
    });

  if (saErr) {
    console.error("[/api/checkins] INSERT self_assessment error:", saErr.message);
    return NextResponse.json({ error: saErr.message }, { status: 500 });
  }

  // ── Flag evaluation ─────────────────────────────────────────────────────
  const { flagged, reasons } = evaluateFlags(prompts, notesSummary, selfAssessment);
  if (flagged) {
    await supabaseAdmin
      .from("check_ins")
      .update({ flagged: true, flag_reasons: reasons })
      .eq("id", checkinId);
    // Non-fatal — log but don't block the response if this update fails
  }

  return NextResponse.json({ checkinId, flagged });
}
