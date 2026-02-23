"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { SkillArea, ReviewResponse, ReviewNarrative } from "./page";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
type Props = {
  reviewId: string;
  associateName: string;
  reviewYear: number;
  skillAreas: SkillArea[];
  existingResponses: ReviewResponse[];
  existingNarratives: ReviewNarrative[];
};

// ---------------------------------------------------------------------------
// Prompts shown to the associate
// ---------------------------------------------------------------------------
const SELF_PROMPTS: { key: string; label: string; placeholder: string }[] = [
  {
    key: "proud_of",
    label: "What are you most proud of this year?",
    placeholder: "Think about a moment, skill, or situation where you felt you did your best work…",
  },
  {
    key: "want_to_improve",
    label: "What would you like to improve?",
    placeholder: "What's one area where you feel there's room to grow or do better?",
  },
  {
    key: "next_skills",
    label: "What skills do you want to develop next?",
    placeholder: "Are there new techniques, responsibilities, or roles you want to work toward?",
  },
  {
    key: "how_can_we_support",
    label: "How can we support you moving forward?",
    placeholder: "Is there anything the team or management can do to help you succeed?",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function SelfReviewForm({
  reviewId,
  associateName,
  reviewYear,
  skillAreas,
  existingResponses,
  existingNarratives,
}: Props) {
  const router = useRouter();

  // Initialise scores from any existing responses
  const [scores, setScores] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const r of existingResponses) {
      init[r.skill_area_id] = r.score;
    }
    return init;
  });

  // Initialise narratives from any existing narratives
  const [narratives, setNarratives] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const n of existingNarratives) {
      init[n.question_key] = n.response_text;
    }
    return init;
  });

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ---------------------------------------------------------------------------
  // Completeness check
  // ---------------------------------------------------------------------------
  const allScored    = skillAreas.every((a) => scores[a.id] !== undefined);
  const allNarratives = SELF_PROMPTS.every((p) => (narratives[p.key] ?? "").trim().length > 0);
  const canSubmit    = allScored && allNarratives && !submitting;

  // ---------------------------------------------------------------------------
  // Auto-save a score (fires immediately on button click)
  // ---------------------------------------------------------------------------
  const saveScore = useCallback(async (skillAreaId: string, score: number) => {
    setScores((prev) => ({ ...prev, [skillAreaId]: score }));
    await fetch(`/api/reviews/${reviewId}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill_area_id: skillAreaId, score, respondent_type: "self" }),
    });
  }, [reviewId]);

  // ---------------------------------------------------------------------------
  // Auto-save a narrative (fires on textarea blur)
  // ---------------------------------------------------------------------------
  const saveNarrative = useCallback(async (questionKey: string, text: string) => {
    if (!text.trim()) return;
    await fetch(`/api/reviews/${reviewId}/narratives`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question_key: questionKey, response_text: text, respondent_type: "self" }),
    });
  }, [reviewId]);

  // ---------------------------------------------------------------------------
  // Submit (advance status)
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
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
        href="/dashboard/associate"
        style={{
          display: "inline-block",
          marginBottom: 24,
          fontSize: 14,
          color: "#6b7280",
          textDecoration: "none",
        }}
      >
        ← My Portal
      </a>

      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
        Annual Review {reviewYear}
      </h1>
      <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 8 }}>
        {associateName} — Self Assessment
      </p>
      <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 32, lineHeight: 1.6 }}>
        Rate yourself honestly in each area, then answer the four questions below.
        Your answers are saved automatically as you go — you can leave and return at any time.
      </p>

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
          Rate yourself in each area
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {skillAreas.map((area) => {
            const selected = scores[area.id];
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

      {/* ── Narrative questions ── */}
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
          In your own words
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {SELF_PROMPTS.map((prompt) => (
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
          ? "Answer all four questions to continue"
          : "Submit my self-review"}
      </button>

      <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 12 }}>
        Once submitted, your supervisor will complete their assessment before you meet together.
      </p>
    </main>
  );
}
