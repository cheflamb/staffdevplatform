"use client";

import type { SkillArea, ReviewResponse, ReviewNarrative, ProgressionPlan, ProgressionMilestone } from "./page";

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
  supResponses: ReviewResponse[];
  selfNarratives: ReviewNarrative[];
  supNarratives: ReviewNarrative[];
  plan: ProgressionPlan | null;
  milestones: ProgressionMilestone[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function gapColor(diff: number): string {
  const abs = Math.abs(diff);
  if (abs >= 2) return "#ef4444";
  if (abs === 1) return "#f59e0b";
  return "#22c55e";
}

function gapLabel(diff: number): string {
  if (diff === 0) return "—";
  return diff > 0 ? `+${diff}` : `${diff}`;
}

const SELF_PROMPT_LABELS: Record<string, string> = {
  proud_of:           "What they're most proud of",
  want_to_improve:    "What they'd like to improve",
  next_skills:        "Skills to develop next",
  how_can_we_support: "How we can support them",
};

const SUP_PROMPT_LABELS: Record<string, string> = {
  strongest:     "Greatest strengths",
  needs_support: "Area needing support",
  growth_path:   "Recommended growth path",
};

const OUTCOME_LABELS: Record<string, string> = {
  strengthen_current: "Continue building in current role",
  advance_to_next:    "Advance to next tier",
};

const SELF_KEY_ORDER = ["proud_of", "want_to_improve", "next_skills", "how_can_we_support"];
const SUP_KEY_ORDER  = ["strongest", "needs_support", "growth_path"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function CompletedSummary({
  associateId,
  associateName,
  reviewYear,
  skillAreas,
  selfResponses,
  supResponses,
  selfNarratives,
  supNarratives,
  plan,
  milestones,
}: Props) {
  // Build maps
  const selfScoreMap: Record<string, number> = {};
  for (const r of selfResponses) selfScoreMap[r.skill_area_id] = r.score;

  const supScoreMap: Record<string, number> = {};
  for (const r of supResponses) supScoreMap[r.skill_area_id] = r.score;

  const selfNarrativeMap: Record<string, string> = {};
  for (const n of selfNarratives) selfNarrativeMap[n.question_key] = n.response_text;

  const supNarrativeMap: Record<string, string> = {};
  for (const n of supNarratives) supNarrativeMap[n.question_key] = n.response_text;

  const milestoneMap: Record<number, string> = {};
  for (const m of milestones) milestoneMap[m.day_target] = m.goal_text;

  const sectionLabel: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#9ca3af",
    marginBottom: 12,
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

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>
          {associateName} — Annual Review {reviewYear}
        </h1>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: 4,
            backgroundColor: "#dcfce7",
            color: "#166534",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            flexShrink: 0,
          }}
        >
          Completed
        </span>
      </div>
      <p style={{ fontSize: 14, color: "#9ca3af", marginBottom: 40 }}>
        Read-only summary
      </p>

      {/* ── Score comparison ── */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={sectionLabel}>Score comparison</h2>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 80px 80px 60px",
              padding: "10px 20px",
              backgroundColor: "#f9fafb",
              borderBottom: "1px solid #e5e7eb",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>Area</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textAlign: "center" }}>Self</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textAlign: "center" }}>Supervisor</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textAlign: "center" }}>Gap</span>
          </div>
          {skillAreas.map((area, idx) => {
            const selfScore = selfScoreMap[area.id] ?? null;
            const supScore  = supScoreMap[area.id]  ?? null;
            const diff      = selfScore !== null && supScore !== null ? selfScore - supScore : null;
            return (
              <div
                key={area.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 80px 80px 60px",
                  padding: "12px 20px",
                  borderBottom: idx < skillAreas.length - 1 ? "1px solid #f3f4f6" : "none",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 500 }}>{area.label}</span>
                <span style={{ fontSize: 14, textAlign: "center" }}>{selfScore ?? "—"}</span>
                <span style={{ fontSize: 14, textAlign: "center" }}>{supScore ?? "—"}</span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    textAlign: "center",
                    color: diff !== null ? gapColor(diff) : "#9ca3af",
                  }}
                >
                  {diff !== null ? gapLabel(diff) : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Associate narratives ── */}
      {SELF_KEY_ORDER.some((k) => selfNarrativeMap[k]) && (
        <section style={{ marginBottom: 40 }}>
          <h2 style={sectionLabel}>Associate — written responses</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {SELF_KEY_ORDER.map((key) => {
              const text = selfNarrativeMap[key];
              if (!text) return null;
              return (
                <div
                  key={key}
                  style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "14px 18px" }}
                >
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af", marginBottom: 6 }}>
                    {SELF_PROMPT_LABELS[key]}
                  </p>
                  <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>{text}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Supervisor narratives ── */}
      {SUP_KEY_ORDER.some((k) => supNarrativeMap[k]) && (
        <section style={{ marginBottom: 40 }}>
          <h2 style={sectionLabel}>Supervisor — written responses</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {SUP_KEY_ORDER.map((key) => {
              const text = supNarrativeMap[key];
              if (!text) return null;
              return (
                <div
                  key={key}
                  style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "14px 18px", backgroundColor: "#fafafa" }}
                >
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af", marginBottom: 6 }}>
                    {SUP_PROMPT_LABELS[key]}
                  </p>
                  <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>{text}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Progression plan ── */}
      {plan && (
        <section style={{ marginBottom: 40 }}>
          <h2 style={sectionLabel}>Growth plan</h2>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "20px" }}>
            <div
              style={{
                display: "inline-block",
                marginBottom: 16,
                padding: "4px 10px",
                borderRadius: 4,
                backgroundColor: "#f0fdf4",
                border: "1px solid #bbf7d0",
                color: "#166534",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {OUTCOME_LABELS[plan.outcome] ?? plan.outcome}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[30, 60, 90].map((day) => (
                <div key={day} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span
                    style={{
                      flexShrink: 0,
                      width: 52,
                      padding: "3px 0",
                      textAlign: "center",
                      backgroundColor: "#f3f4f6",
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#374151",
                    }}
                  >
                    Day {day}
                  </span>
                  <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.5, paddingTop: 3 }}>
                    {milestoneMap[day] ?? "—"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
