"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { SkillArea, ReviewResponse, ReviewNarrative } from "./page";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
type Props = {
  reviewId: string;
  associateId: string;
  associateName: string;
  reviewYear: number;
  skillAreas: SkillArea[];
  selfResponses: ReviewResponse[];
  selfNarratives: ReviewNarrative[];
  existingSupResponses: ReviewResponse[];
  existingSupNarratives: ReviewNarrative[];
};

// ---------------------------------------------------------------------------
// Supervisor prompts
// ---------------------------------------------------------------------------
const SUP_PROMPTS: { key: string; label: string; placeholder: string }[] = [
  {
    key: "strongest",
    label: "What are this associate's greatest strengths?",
    placeholder: "What do they do consistently well? Where do they shine?",
  },
  {
    key: "needs_support",
    label: "What area needs the most support?",
    placeholder: "Where have you noticed gaps, inconsistency, or room for growth?",
  },
  {
    key: "growth_path",
    label: "What is the recommended growth path for the next year?",
    placeholder: "What specific actions, skills, or milestones should they focus on?",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function SupervisorReviewForm({
  reviewId,
  associateId,
  associateName,
  reviewYear,
  skillAreas,
  selfResponses,
  selfNarratives,
  existingSupResponses,
  existingSupNarratives,
}: Props) {
  const router = useRouter();

  // Index self-scores for quick lookup
  const selfScoreMap: Record<string, number> = {};
  for (const r of selfResponses) {
    selfScoreMap[r.skill_area_id] = r.score;
  }

  const [scores, setScores] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const r of existingSupResponses) {
      init[r.skill_area_id] = r.score;
    }
    return init;
  });

  const [narratives, setNarratives] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const n of existingSupNarratives) {
      init[n.question_key] = n.response_text;
    }
    return init;
  });

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const allScored     = skillAreas.every((a) => scores[a.id] !== undefined);
  const allNarratives = SUP_PROMPTS.every((p) => (narratives[p.key] ?? "").trim().length > 0);
  const canSubmit     = allScored && allNarratives && !submitting;

  const saveScore = useCallback(async (skillAreaId: string, score: number) => {
    setScores((prev) => ({ ...prev, [skillAreaId]: score }));
    await fetch(`/api/reviews/${reviewId}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill_area_id: skillAreaId, score, respondent_type: "supervisor" }),
    });
  }, [reviewId]);

  const saveNarrative = useCallback(async (questionKey: string, text: string) => {
    if (!text.trim()) return;
    await fetch(`/api/reviews/${reviewId}/narratives`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question_key: questionKey, response_text: text, respondent_type: "supervisor" }),
    });
  }, [reviewId]);

  async function onSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/advance`, { method: "PATCH" });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to submit");
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  // Self narratives keyed for display
  const selfNarrativeMap: Record<string, string> = {};
  for (const n of selfNarratives) {
    selfNarrativeMap[n.question_key] = n.response_text;
  }

  const selfPromptLabels: Record<string, string> = {
    proud_of:          "What they're most proud of",
    want_to_improve:   "What they'd like to improve",
    next_skills:       "Skills they want to develop",
    how_can_we_support: "How we can support them",
  };

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
        href={`/dashboard/associates/${associateId}`}
        style={{
          display: "inline-block",
          marginBottom: 24,
          fontSize: 14,
          color: "#6b7280",
          textDecoration: "none",
        }}
      >
        ← {associateName}
      </a>

      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
        {associateName} — Annual Review {reviewYear}
      </h1>
      <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 8 }}>
        Supervisor Assessment
      </p>
      <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 32, lineHeight: 1.6 }}>
        The associate has submitted their self-review. Score each area independently —
        you can see their self-score for reference but try to form your own view first.
        Your answers are saved automatically.
      </p>

      {/* ── Associate's self-review narratives (read-only context) ── */}
      {selfNarratives.length > 0 && (
        <section
          style={{
            marginBottom: 40,
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: "16px 20px",
            backgroundColor: "#fafafa",
          }}
        >
          <h2
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#9ca3af",
              marginBottom: 14,
            }}
          >
            {associateName}&apos;s self-review — written responses
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {Object.entries(selfPromptLabels).map(([key, label]) => {
              const text = selfNarrativeMap[key];
              if (!text) return null;
              return (
                <div key={key}>
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#6b7280",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: 4,
                    }}
                  >
                    {label}
                  </p>
                  <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>{text}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Skill area scores ── */}
      <section style={{ marginBottom: 40 }}>
        <h2
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#9ca3af",
            marginBottom: 16,
          }}
        >
          Your assessment — score each area
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {skillAreas.map((area) => {
            const selected  = scores[area.id];
            const selfScore = selfScoreMap[area.id];
            return (
              <div
                key={area.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: "16px 20px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <p style={{ fontWeight: 600, fontSize: 15 }}>{area.label}</p>
                    {area.description && (
                      <p style={{ fontSize: 13, color: "#6b7280", marginTop: 3, lineHeight: 1.5, fontStyle: "italic" }}>
                        {area.description}
                      </p>
                    )}
                    {selfScore !== undefined && (
                      <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 6 }}>
                        Self-score: <strong>{selfScore}</strong>
                      </p>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {[1, 2, 3, 4, 5].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => saveScore(area.id, v)}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          border: selected === v ? "none" : "1px solid #d1d5db",
                          backgroundColor: selected === v ? "#111" : "white",
                          color: selected === v ? "white" : "#374151",
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Supervisor narrative questions ── */}
      <section style={{ marginBottom: 40 }}>
        <h2
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#9ca3af",
            marginBottom: 16,
          }}
        >
          Your written assessment
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {SUP_PROMPTS.map((prompt) => (
            <div
              key={prompt.key}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: "16px 20px",
              }}
            >
              <label style={{ display: "block" }}>
                <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>
                  {prompt.label}
                </p>
                <textarea
                  rows={4}
                  value={narratives[prompt.key] ?? ""}
                  onChange={(e) =>
                    setNarratives((prev) => ({ ...prev, [prompt.key]: e.target.value }))
                  }
                  onBlur={(e) => saveNarrative(prompt.key, e.target.value)}
                  placeholder={prompt.placeholder}
                  maxLength={3000}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    fontSize: 14,
                    lineHeight: 1.6,
                    resize: "vertical",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                  }}
                />
              </label>
            </div>
          ))}
        </div>
      </section>

      {/* ── Submit ── */}
      {submitError && (
        <p
          style={{
            padding: "10px 14px",
            borderRadius: 6,
            backgroundColor: "#fef2f2",
            color: "#991b1b",
            fontSize: 14,
            marginBottom: 16,
          }}
        >
          {submitError}
        </p>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit}
        style={{
          width: "100%",
          padding: "14px 0",
          fontWeight: 700,
          fontSize: 15,
          backgroundColor: canSubmit ? "#111" : "#d1d5db",
          color: canSubmit ? "white" : "#9ca3af",
          border: "none",
          borderRadius: 8,
          cursor: canSubmit ? "pointer" : "not-allowed",
        }}
      >
        {submitting
          ? "Submitting…"
          : !allScored
          ? `Score all ${skillAreas.length} areas to continue`
          : !allNarratives
          ? "Answer all three questions to continue"
          : "Submit — ready to discuss"}
      </button>

      <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 12 }}>
        After submitting, you&apos;ll see both sides together and record the growth plan outcome.
      </p>
    </main>
  );
}
