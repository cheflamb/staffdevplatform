"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Prompt = { id: string; category: string; prompt_text: string };

type PromptEntry = {
  prompt: Prompt;
  notes: string;
  tags: string[];
};

type SelfAssessment = {
  talkRatioScore: number;
  listeningScore: number;
  questionQualityScore: number;
  emotionalAcknowledgementScore: number;
  paraphrasingScore: number;
  coachingScore: number;
  distractionScore: number;
  nextStepScore: number;
  valueScore: number;
  improvementNotes: string;
};

type Associate = {
  id: string;
  first_name: string;
  last_name: string;
  location_id: string;
  positions: { title: string; is_lead: boolean; is_managerial: boolean } | null;
  departments: { name: string } | null;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STEPS = ["Prompts", "Conversation", "Close", "Summarize", "Self-Assessment"] as const;
type Step = 0 | 1 | 2 | 3 | 4;

const CATEGORIES = ["clarity", "capacity", "competence", "connection"] as const;

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  clarity:    { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  capacity:   { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
  competence: { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
  connection: { bg: "#fdf4ff", text: "#7e22ce", border: "#e9d5ff" },
};

const FOLLOWUP_CUES = [
  "Go on…",
  "Tell me more.",
  "Why do you say that?",
  "How do you mean?",
  "Can you give me an example?",
  "What else?",
];

const OPTIONAL_TAGS = ["stress", "friction", "morale", "growth", "performance"];

const SA_QUESTIONS: { key: keyof SelfAssessment; label: string; lowLabel: string; highLabel: string }[] = [
  { key: "talkRatioScore",                label: "Did I talk too much?",                 lowLabel: "Definitely", highLabel: "Not at all"  },
  { key: "listeningScore",                label: "Did I actively listen?",               lowLabel: "No",         highLabel: "Yes"          },
  { key: "questionQualityScore",          label: "Did I ask meaningful questions?",       lowLabel: "No",         highLabel: "Yes"          },
  { key: "emotionalAcknowledgementScore", label: "Did I acknowledge their feelings?",     lowLabel: "No",         highLabel: "Yes"          },
  { key: "paraphrasingScore",             label: "Did I paraphrase key points?",          lowLabel: "No",         highLabel: "Yes"          },
  { key: "coachingScore",                 label: "Did I offer practical coaching?",       lowLabel: "No",         highLabel: "Yes"          },
  { key: "distractionScore",              label: "Was I distracted?",                     lowLabel: "Definitely", highLabel: "Not at all"  },
  { key: "nextStepScore",                 label: "Did we define a clear next step?",      lowLabel: "No",         highLabel: "Yes"          },
  { key: "valueScore",                    label: "Was this meeting valuable?",            lowLabel: "No",         highLabel: "Yes"          },
];

const DEFAULT_SA: SelfAssessment = {
  talkRatioScore: 0, listeningScore: 0, questionQualityScore: 0,
  emotionalAcknowledgementScore: 0, paraphrasingScore: 0, coachingScore: 0,
  distractionScore: 0, nextStepScore: 0, valueScore: 0,
  improvementNotes: "",
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "9px 10px",
  marginTop: 6,
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 14,
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  minHeight: 80,
};

// ---------------------------------------------------------------------------
// Component helpers
// ---------------------------------------------------------------------------
function StepIndicator({ current }: { current: Step }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 28 }}>
      {STEPS.map((label, i) => {
        const done    = i < current;
        const active  = i === current;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 24, height: 24, borderRadius: "50%",
                fontSize: 11, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
                backgroundColor: done ? "#111" : active ? "#374151" : "#e5e7eb",
                color: done || active ? "white" : "#9ca3af",
                flexShrink: 0,
              }}
            >
              {done ? "✓" : i + 1}
            </div>
            <span style={{ fontSize: 12, color: active ? "#111" : "#9ca3af", fontWeight: active ? 600 : 400 }}>
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <div style={{ width: 16, height: 1, backgroundColor: "#e5e7eb", flexShrink: 0 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScoreButton({ value, selected, onClick }: { value: number; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 40, height: 40,
        borderRadius: 6,
        border: selected ? "2px solid #111" : "1px solid #d1d5db",
        backgroundColor: selected ? "#111" : "white",
        color: selected ? "white" : "#374151",
        fontWeight: selected ? 700 : 400,
        fontSize: 14,
        cursor: "pointer",
      }}
    >
      {value}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function NewCheckinPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const associateId  = searchParams.get("associateId") ?? "";

  // Auth / loading
  const [loading, setLoading]         = useState(true);
  const [initError, setInitError]     = useState<string | null>(null);

  // Associate info
  const [associate, setAssociate]     = useState<Associate | null>(null);
  const [roleLevel, setRoleLevel]     = useState<"line" | "lead">("line");

  // Scheduled milestone linkage
  const [scheduledCheckinId, setScheduledCheckinId] = useState<string | null>(null);
  const [scheduledType, setScheduledType]           = useState<string | null>(null);

  // Step
  const [step, setStep]               = useState<Step>(0);

  // Step 0 – Prompts
  const [suggestions, setSuggestions] = useState<Prompt[]>([]);
  const [allPrompts, setAllPrompts]   = useState<Prompt[]>([]);
  const [selected, setSelected]       = useState<Prompt[]>([]);  // 4 chosen prompts (ordered by category)
  const [swapping, setSwapping]       = useState<string | null>(null); // category being swapped

  // Step 1 – Conversation notes per prompt
  const [entries, setEntries]         = useState<PromptEntry[]>([]);

  // Step 2 – Close the loop
  const [nextStep, setNextStep]       = useState("");
  const [followupCommitment, setFollowupCommitment] = useState("");
  const [revisitDate, setRevisitDate] = useState("");

  // Step 3 – Summary
  const [notesSummary, setNotesSummary] = useState("");
  const [shareWithAssociate, setShareWithAssociate] = useState(false);

  // Step 4 – Self-assessment
  const [sa, setSa]                   = useState<SelfAssessment>(DEFAULT_SA);

  // Submit
  const [busy, setBusy]               = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Load associate + suggest prompts
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!associateId) {
      setInitError("No associate specified.");
      setLoading(false);
      return;
    }

    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const { data: m } = await supabase
        .from("company_members")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!m || !["owner", "supervisor"].includes(m.role)) {
        router.replace("/dashboard");
        return;
      }

      // Fetch associate name
      const { data: assoc } = await supabase
        .from("associates")
        .select("id, first_name, last_name, location_id, positions(title, is_lead, is_managerial), departments(name)")
        .eq("id", associateId)
        .maybeSingle();

      if (!assoc) { setInitError("Associate not found."); setLoading(false); return; }
      setAssociate(assoc as Associate);

      // Check for an open scheduled milestone for this associate
      const { data: scheduled } = await supabase
        .from("check_ins")
        .select("id, type, scheduled_date")
        .eq("associate_id", associateId)
        .eq("status", "scheduled")
        .order("scheduled_date")
        .limit(1)
        .maybeSingle();

      if (scheduled) {
        setScheduledCheckinId(scheduled.id as string);
        setScheduledType(scheduled.type as string);
      }

      // Smart suggest
      const res = await fetch(`/api/checkins/suggest?associateId=${associateId}`);
      if (!res.ok) { setInitError("Failed to load prompt suggestions."); setLoading(false); return; }
      const json = await res.json() as { roleLevel: "line" | "lead"; suggestions: Prompt[] };
      setRoleLevel(json.roleLevel);
      setSuggestions(json.suggestions);
      setSelected(json.suggestions);

      // Load all prompts for swap UI
      const { data: pAll } = await supabase
        .from("prompts")
        .select("id, category, prompt_text")
        .order("sort_order");
      setAllPrompts((pAll ?? []) as Prompt[]);

      setLoading(false);
    })();
  }, [associateId, router]);

  // Sync entries when selected prompts change (preserve existing notes)
  useEffect(() => {
    setEntries((prev) =>
      selected.map((p) => {
        const existing = prev.find((e) => e.prompt.id === p.id);
        return existing ?? { prompt: p, notes: "", tags: [] };
      })
    );
  }, [selected]);

  // ---------------------------------------------------------------------------
  // Step 0 helpers
  // ---------------------------------------------------------------------------
  const swapPrompt = useCallback((category: string, newPrompt: Prompt) => {
    setSelected((prev) => prev.map((p) => (p.category === category ? newPrompt : p)));
    setSwapping(null);
  }, []);

  const poolForCategory = (category: string) =>
    allPrompts.filter(
      (p) => p.category === category && !selected.some((s) => s.id === p.id && s.category !== category)
    );

  // ---------------------------------------------------------------------------
  // Step 1 helpers
  // ---------------------------------------------------------------------------
  function updateEntry(idx: number, field: "notes", value: string): void;
  function updateEntry(idx: number, field: "tags", value: string[]): void;
  function updateEntry(idx: number, field: "notes" | "tags", value: string | string[]) {
    setEntries((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e))
    );
  }

  function toggleTag(idx: number, tag: string) {
    const current = entries[idx].tags;
    updateEntry(
      idx,
      "tags",
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]
    );
  }

  // ---------------------------------------------------------------------------
  // Step navigation guards
  // ---------------------------------------------------------------------------
  const canAdvanceStep0 = selected.length === 4;
  const canAdvanceStep1 = entries.every((e) => e.notes.trim().length > 0);
  const canAdvanceStep2 = nextStep.trim().length > 0 && followupCommitment.trim().length > 0;
  const canAdvanceStep3 = notesSummary.trim().length > 0;
  const canSubmit       = SA_QUESTIONS.every((q) => sa[q.key] !== 0) && !busy;

  function advance() {
    setStep((s) => Math.min(s + 1, 4) as Step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function back() {
    setStep((s) => Math.max(s - 1, 0) as Step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------
  async function onSubmit() {
    setBusy(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          associateId,
          scheduledCheckinId,
          roleLevel,
          prompts: entries.map((e) => ({
            promptId: e.prompt.id,
            notes:    e.notes.trim(),
            tags:     e.tags,
          })),
          notesSummary:        notesSummary.trim(),
          followupCommitment:  followupCommitment.trim(),
          revisitDate:         revisitDate || null,
          shareWithAssociate,
          selfAssessment: {
            talkRatioScore:                sa.talkRatioScore,
            listeningScore:                sa.listeningScore,
            questionQualityScore:          sa.questionQualityScore,
            emotionalAcknowledgementScore: sa.emotionalAcknowledgementScore,
            paraphrasingScore:             sa.paraphrasingScore,
            coachingScore:                 sa.coachingScore,
            distractionScore:              sa.distractionScore,
            nextStepScore:                 sa.nextStepScore,
            valueScore:                    sa.valueScore,
            improvementNotes:              sa.improvementNotes.trim(),
          },
        }),
      });

      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to save check-in");

      router.push(`/dashboard/associates/${associateId}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render: loading / error
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <main style={{ padding: 24, maxWidth: 640, margin: "0 auto" }}>
        <p style={{ color: "#6b7280" }}>Loading…</p>
      </main>
    );
  }

  if (initError) {
    return (
      <main style={{ padding: 24, maxWidth: 640, margin: "0 auto" }}>
        <p style={{ color: "#991b1b" }}>{initError}</p>
        <button
          onClick={() => router.back()}
          style={{ marginTop: 12, color: "#6b7280", background: "none", border: "none", cursor: "pointer", fontSize: 14 }}
        >
          ← Back
        </button>
      </main>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: main
  // ---------------------------------------------------------------------------
  return (
    <main style={{ padding: 24, maxWidth: 640, margin: "0 auto" }}>
      {/* Header */}
      <button
        onClick={() => router.push(`/dashboard/associates/${associateId}`)}
        style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", padding: 0, marginBottom: 16, fontSize: 14 }}
      >
        ← {associate?.first_name} {associate?.last_name}
      </button>

      {scheduledType && scheduledType !== "adhoc" && (
        <div style={{
          marginBottom: 16,
          padding: "8px 14px",
          borderRadius: 6,
          backgroundColor: "#eff6ff",
          border: "1px solid #bfdbfe",
          fontSize: 13,
          color: "#1d4ed8",
          fontWeight: 500,
        }}>
          {{
            "30-day": "30-day new-hire review",
            "60-day": "60-day new-hire review",
            "90-day": "90-day new-hire review",
            "annual": "Annual anniversary review",
          }[scheduledType] ?? scheduledType} — this will fulfil the scheduled milestone.
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>10-Minute Check-In</h1>
        <p style={{ color: "#6b7280", fontSize: 14, marginTop: 4 }}>
          {associate?.first_name} {associate?.last_name}
          {associate?.departments?.name ? ` · ${associate.departments.name}` : ""}
          {associate?.positions?.title  ? ` · ${associate.positions.title}`  : ""}
          <span style={{
            marginLeft: 8, fontSize: 11, fontWeight: 600,
            padding: "2px 7px", borderRadius: 10,
            backgroundColor: roleLevel === "lead" ? "#e0e7ff" : "#f3f4f6",
            color: roleLevel === "lead" ? "#3730a3" : "#6b7280",
          }}>
            {roleLevel === "lead" ? "Lead+" : "Line Level"}
          </span>
        </p>
      </div>

      <StepIndicator current={step} />

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* STEP 0 — SMART SUGGEST                                             */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {step === 0 && (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Select your prompts</h2>
          <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 20 }}>
            One prompt per category is suggested. Tap any prompt to swap it out.
          </p>

          <div style={{ display: "grid", gap: 12 }}>
            {CATEGORIES.map((cat) => {
              const prompt = selected.find((p) => p.category === cat);
              const colors = CATEGORY_COLORS[cat];
              const isSwappingThis = swapping === cat;
              const pool = poolForCategory(cat);

              return (
                <div
                  key={cat}
                  style={{
                    border: `1px solid ${colors.border}`,
                    borderRadius: 8,
                    overflow: "hidden",
                  }}
                >
                  <div style={{ backgroundColor: colors.bg, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: colors.text }}>
                      {cat}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSwapping(isSwappingThis ? null : cat)}
                      style={{ fontSize: 12, color: colors.text, background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}
                    >
                      {isSwappingThis ? "Cancel" : "Swap"}
                    </button>
                  </div>

                  {!isSwappingThis && prompt && (
                    <div style={{ padding: "12px 14px", fontSize: 15, fontWeight: 500 }}>
                      {prompt.prompt_text}
                    </div>
                  )}

                  {isSwappingThis && (
                    <div style={{ padding: "8px 12px", display: "grid", gap: 6 }}>
                      {pool.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => swapPrompt(cat, p)}
                          style={{
                            textAlign: "left",
                            padding: "8px 10px",
                            borderRadius: 6,
                            border: "1px solid #e5e7eb",
                            background: p.id === prompt?.id ? "#f9fafb" : "white",
                            cursor: "pointer",
                            fontSize: 14,
                          }}
                        >
                          {p.id === prompt?.id && <span style={{ marginRight: 6 }}>✓</span>}
                          {p.prompt_text}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 24 }}>
            <button
              onClick={advance}
              disabled={!canAdvanceStep0}
              style={{
                width: "100%", padding: "12px 0", fontWeight: 600,
                backgroundColor: canAdvanceStep0 ? "#111" : "#9ca3af",
                color: "white", border: "none", borderRadius: 6,
                cursor: canAdvanceStep0 ? "pointer" : "not-allowed",
              }}
            >
              Start Check-In →
            </button>
          </div>
        </div>
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* STEP 1 — ASK + LISTEN                                              */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {step === 1 && (
        <div style={{ display: "grid", gap: 24 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Ask + Listen</h2>
            <p style={{ color: "#6b7280", fontSize: 13 }}>
              Work through each prompt. Enter your notes after listening.
            </p>
          </div>

          {entries.map((entry, idx) => {
            const colors = CATEGORY_COLORS[entry.prompt.category];
            return (
              <div
                key={entry.prompt.id}
                style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}
              >
                {/* Prompt header */}
                <div style={{ backgroundColor: colors.bg, padding: "10px 14px", borderBottom: `1px solid ${colors.border}` }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: colors.text }}>
                    {entry.prompt.category}
                  </span>
                  <p style={{ fontSize: 16, fontWeight: 600, marginTop: 4, color: "#111" }}>
                    {entry.prompt.prompt_text}
                  </p>
                </div>

                <div style={{ padding: "12px 14px", display: "grid", gap: 12 }}>
                  {/* Follow-up cues */}
                  <div>
                    <p style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, marginBottom: 6 }}>FOLLOW-UP CUES</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {FOLLOWUP_CUES.map((cue) => (
                        <span
                          key={cue}
                          style={{
                            fontSize: 12, padding: "3px 8px", borderRadius: 4,
                            backgroundColor: "#f3f4f6", color: "#6b7280",
                          }}
                        >
                          {cue}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Notes */}
                  <label>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Your notes</span>
                    <textarea
                      value={entry.notes}
                      onChange={(e) => updateEntry(idx, "notes", e.target.value)}
                      placeholder="What did you hear?"
                      style={textareaStyle}
                    />
                  </label>

                  {/* Tags */}
                  <div>
                    <p style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, marginBottom: 6 }}>TAGS (optional)</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {OPTIONAL_TAGS.map((tag) => {
                        const active = entry.tags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleTag(idx, tag)}
                            style={{
                              fontSize: 12, padding: "3px 9px", borderRadius: 10,
                              border: active ? "1px solid #111" : "1px solid #d1d5db",
                              backgroundColor: active ? "#111" : "white",
                              color: active ? "white" : "#6b7280",
                              cursor: "pointer",
                            }}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={back}
              style={{ padding: "12px 20px", fontWeight: 600, backgroundColor: "white", color: "#374151", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer" }}
            >
              ← Back
            </button>
            <button
              onClick={advance}
              disabled={!canAdvanceStep1}
              style={{
                flex: 1, padding: "12px 0", fontWeight: 600,
                backgroundColor: canAdvanceStep1 ? "#111" : "#9ca3af",
                color: "white", border: "none", borderRadius: 6,
                cursor: canAdvanceStep1 ? "pointer" : "not-allowed",
              }}
            >
              Close the Loop →
            </button>
          </div>
          {!canAdvanceStep1 && (
            <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: -8 }}>
              Add notes for each prompt to continue.
            </p>
          )}
        </div>
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* STEP 2 — CLOSE THE LOOP                                            */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {step === 2 && (
        <div style={{ display: "grid", gap: 20 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Close the Loop</h2>
            <p style={{ color: "#6b7280", fontSize: 13 }}>
              Capture one next step, your support commitment, and when to revisit.
            </p>
          </div>

          <label style={{ display: "block" }}>
            <span style={{ fontWeight: 600 }}>What&apos;s one next step?</span>
            <textarea
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
              placeholder="The one concrete action from this conversation…"
              style={textareaStyle}
            />
          </label>

          <label style={{ display: "block" }}>
            <span style={{ fontWeight: 600 }}>What support do you need from me?</span>
            <textarea
              value={followupCommitment}
              onChange={(e) => setFollowupCommitment(e.target.value)}
              placeholder="How you'll follow up or what you'll provide…"
              style={textareaStyle}
            />
          </label>

          <label style={{ display: "block" }}>
            <span style={{ fontWeight: 600 }}>When should we revisit? <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional)</span></span>
            <input
              type="date"
              value={revisitDate}
              onChange={(e) => setRevisitDate(e.target.value)}
              style={inputStyle}
            />
          </label>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={back}
              style={{ padding: "12px 20px", fontWeight: 600, backgroundColor: "white", color: "#374151", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer" }}
            >
              ← Back
            </button>
            <button
              onClick={advance}
              disabled={!canAdvanceStep2}
              style={{
                flex: 1, padding: "12px 0", fontWeight: 600,
                backgroundColor: canAdvanceStep2 ? "#111" : "#9ca3af",
                color: "white", border: "none", borderRadius: 6,
                cursor: canAdvanceStep2 ? "pointer" : "not-allowed",
              }}
            >
              Summarize →
            </button>
          </div>
        </div>
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* STEP 3 — SUMMARIZE                                                 */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {step === 3 && (
        <div style={{ display: "grid", gap: 20 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Summarize</h2>
            <p style={{ color: "#6b7280", fontSize: 13 }}>
              Summarize what you heard — in your own words.
            </p>
          </div>

          {/* Prompt recap */}
          <div style={{ backgroundColor: "#f9fafb", borderRadius: 8, padding: "12px 14px", display: "grid", gap: 8 }}>
            {entries.map((e) => (
              <div key={e.prompt.id} style={{ fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: CATEGORY_COLORS[e.prompt.category].text }}>
                  {e.prompt.prompt_text}
                </span>
                {e.notes && (
                  <p style={{ color: "#374151", marginTop: 2 }}>{e.notes}</p>
                )}
              </div>
            ))}
          </div>

          <label style={{ display: "block" }}>
            <span style={{ fontWeight: 600 }}>Your summary</span>
            <textarea
              value={notesSummary}
              onChange={(e) => setNotesSummary(e.target.value)}
              placeholder="Summarize the key themes and what matters most from this conversation…"
              style={{ ...textareaStyle, minHeight: 120 }}
            />
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={shareWithAssociate}
              onChange={(e) => setShareWithAssociate(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            <span style={{ fontSize: 14 }}>Share summary with {associate?.first_name}</span>
          </label>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={back}
              style={{ padding: "12px 20px", fontWeight: 600, backgroundColor: "white", color: "#374151", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer" }}
            >
              ← Back
            </button>
            <button
              onClick={advance}
              disabled={!canAdvanceStep3}
              style={{
                flex: 1, padding: "12px 0", fontWeight: 600,
                backgroundColor: canAdvanceStep3 ? "#111" : "#9ca3af",
                color: "white", border: "none", borderRadius: 6,
                cursor: canAdvanceStep3 ? "pointer" : "not-allowed",
              }}
            >
              Self-Assessment →
            </button>
          </div>
        </div>
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* STEP 4 — SELF-ASSESSMENT                                           */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {step === 4 && (
        <div style={{ display: "grid", gap: 20 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Self-Assessment</h2>
            <p style={{ color: "#6b7280", fontSize: 13 }}>
              Private to you. Rate yourself honestly — this builds your leadership over time.
            </p>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            {SA_QUESTIONS.map((q) => (
              <div key={q.key}>
                <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>{q.label}</p>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#9ca3af", minWidth: 60 }}>{q.lowLabel}</span>
                  {[1, 2, 3, 4, 5].map((v) => (
                    <ScoreButton
                      key={v}
                      value={v}
                      selected={sa[q.key] === v}
                      onClick={() => setSa((prev) => ({ ...prev, [q.key]: v }))}
                    />
                  ))}
                  <span style={{ fontSize: 12, color: "#9ca3af", minWidth: 60 }}>{q.highLabel}</span>
                </div>
              </div>
            ))}
          </div>

          <label style={{ display: "block" }}>
            <span style={{ fontWeight: 600 }}>What will I improve next time? <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional)</span></span>
            <textarea
              value={sa.improvementNotes}
              onChange={(e) => setSa((prev) => ({ ...prev, improvementNotes: e.target.value }))}
              placeholder="One thing I'll do differently…"
              style={textareaStyle}
            />
          </label>

          {submitError && (
            <p style={{ padding: "10px 12px", borderRadius: 6, background: "#fef2f2", color: "#991b1b", fontSize: 13 }}>
              {submitError}
            </p>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={back}
              disabled={busy}
              style={{ padding: "12px 20px", fontWeight: 600, backgroundColor: "white", color: "#374151", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer" }}
            >
              ← Back
            </button>
            <button
              onClick={onSubmit}
              disabled={!canSubmit}
              style={{
                flex: 1, padding: "12px 0", fontWeight: 600,
                backgroundColor: canSubmit ? "#111" : "#9ca3af",
                color: "white", border: "none", borderRadius: 6,
                cursor: canSubmit ? "pointer" : "not-allowed",
              }}
            >
              {busy ? "Saving…" : "Complete Check-In"}
            </button>
          </div>

          {!canSubmit && !busy && (
            <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: -8 }}>
              Rate all 9 questions to complete.
            </p>
          )}
        </div>
      )}
    </main>
  );
}
