"use client";

import { useState } from "react";
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
  supResponses: ReviewResponse[];
  selfNarratives: ReviewNarrative[];
  supNarratives: ReviewNarrative[];
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

// Narrative label pairs
const NARRATIVE_PAIRS: { selfKey: string; supKey: string; selfLabel: string; supLabel: string }[] = [
  { selfKey: "proud_of",          supKey: "strongest",     selfLabel: "What they're most proud of",  supLabel: "Greatest strengths" },
  { selfKey: "want_to_improve",   supKey: "needs_support", selfLabel: "What they'd like to improve", supLabel: "Area needing support" },
  { selfKey: "next_skills",       supKey: "growth_path",   selfLabel: "Skills to develop next",      supLabel: "Recommended growth path" },
  { selfKey: "how_can_we_support",supKey: "",              selfLabel: "How we can support them",     supLabel: "" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ConversationView({
  reviewId,
  associateId,
  associateName,
  reviewYear,
  skillAreas,
  selfResponses,
  supResponses,
  selfNarratives,
  supNarratives,
}: Props) {
  const router = useRouter();

  // Build score maps
  const selfScoreMap: Record<string, number> = {};
  for (const r of selfResponses) selfScoreMap[r.skill_area_id] = r.score;

  const supScoreMap: Record<string, number> = {};
  for (const r of supResponses) supScoreMap[r.skill_area_id] = r.score;

  // Build narrative maps
  const selfNarrativeMap: Record<string, string> = {};
  for (const n of selfNarratives) selfNarrativeMap[n.question_key] = n.response_text;

  const supNarrativeMap: Record<string, string> = {};
  for (const n of supNarratives) supNarrativeMap[n.question_key] = n.response_text;

  // Outcome state
  const [outcome, setOutcome] = useState<"strengthen_current" | "advance_to_next" | "">("");
  const [milestone30, setMilestone30] = useState(
    // Pre-fill from supervisor's growth_path narrative (first sentence)
    (() => {
      const gp = supNarrativeMap["growth_path"] ?? "";
      const firstSentence = gp.split(/[.!?]/)[0].trim();
      return firstSentence.length > 0 && firstSentence.length <= 200 ? firstSentence : "";
    })()
  );
  const [milestone60, setMilestone60] = useState("");
  const [milestone90, setMilestone90] = useState("");

  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const canComplete =
    outcome !== "" &&
    milestone30.trim().length > 0 &&
    milestone60.trim().length > 0 &&
    milestone90.trim().length > 0 &&
    !completing;

  async function onComplete() {
    setCompleting(true);
    setCompleteError(null);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome,
          milestone_30: milestone30.trim(),
          milestone_60: milestone60.trim(),
          milestone_90: milestone90.trim(),
        }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to complete review");
      router.refresh();
    } catch (err) {
      setCompleteError(err instanceof Error ? err.message : "Something went wrong");
      setCompleting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    padding: "9px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    fontSize: 14,
    lineHeight: 1.5,
    boxSizing: "border-box",
    fontFamily: "inherit",
    marginTop: 6,
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
      <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 32 }}>
        Review Conversation &amp; Outcome
      </p>

      {/* ── Score comparison ── */}
      <section style={{ marginBottom: 40 }}>
        <h2
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#9ca3af",
            marginBottom: 12,
          }}
        >
          Score comparison
        </h2>

        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {/* Table header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 80px 80px 60px",
              gap: 0,
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
                  gap: 0,
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
        <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 6 }}>
          Gap = Self − Supervisor. Green = aligned, amber = 1 point apart, red = 2+ points.
        </p>
      </section>

      {/* ── Narrative side-by-side ── */}
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
          Written responses
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {NARRATIVE_PAIRS.map((pair) => {
            const selfText = selfNarrativeMap[pair.selfKey];
            const supText  = pair.supKey ? supNarrativeMap[pair.supKey] : null;
            if (!selfText && !supText) return null;
            return (
              <div
                key={pair.selfKey}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                {selfText && (
                  <div style={{ padding: "14px 20px", borderBottom: supText ? "1px solid #f3f4f6" : "none" }}>
                    <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af", marginBottom: 6 }}>
                      Associate — {pair.selfLabel}
                    </p>
                    <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>{selfText}</p>
                  </div>
                )}
                {supText && (
                  <div style={{ padding: "14px 20px", backgroundColor: "#fafafa" }}>
                    <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af", marginBottom: 6 }}>
                      Supervisor — {pair.supLabel}
                    </p>
                    <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>{supText}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Growth path decision ── */}
      <section style={{ marginBottom: 32 }}>
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
          Growth path decision
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            {
              value: "strengthen_current" as const,
              label: "Continue building in current role",
              description: "Focus on deepening existing skills and consistency at this level.",
            },
            {
              value: "advance_to_next" as const,
              label: "Advance to next tier",
              description: "Associate is ready to begin working toward the next classification.",
            },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setOutcome(opt.value)}
              style={{
                textAlign: "left",
                padding: "14px 18px",
                border: `2px solid ${outcome === opt.value ? "#111" : "#e5e7eb"}`,
                borderRadius: 8,
                backgroundColor: outcome === opt.value ? "#111" : "white",
                color: outcome === opt.value ? "white" : "#374151",
                cursor: "pointer",
              }}
            >
              <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{opt.label}</p>
              <p style={{ fontSize: 13, opacity: 0.75 }}>{opt.description}</p>
            </button>
          ))}
        </div>
      </section>

      {/* ── 90-day milestones ── */}
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
          90-day milestones
        </h2>

        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Day 30 target</span>
            <input
              type="text"
              value={milestone30}
              onChange={(e) => setMilestone30(e.target.value)}
              placeholder="e.g., Consistently executing pantry station without prompting"
              maxLength={300}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Day 60 target</span>
            <input
              type="text"
              value={milestone60}
              onChange={(e) => setMilestone60(e.target.value)}
              placeholder="e.g., Running fry station during peak service independently"
              maxLength={300}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Day 90 target</span>
            <input
              type="text"
              value={milestone90}
              onChange={(e) => setMilestone90(e.target.value)}
              placeholder="e.g., Demonstrating Cook 1 readiness across all stations"
              maxLength={300}
              style={inputStyle}
            />
          </label>
        </div>
      </section>

      {/* ── Complete ── */}
      {completeError && (
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
          {completeError}
        </p>
      )}

      <button
        type="button"
        onClick={onComplete}
        disabled={!canComplete}
        style={{
          width: "100%",
          padding: "14px 0",
          fontWeight: 700,
          fontSize: 15,
          backgroundColor: canComplete ? "#111" : "#d1d5db",
          color: canComplete ? "white" : "#9ca3af",
          border: "none",
          borderRadius: 8,
          cursor: canComplete ? "pointer" : "not-allowed",
        }}
      >
        {completing ? "Completing…" : "Complete review & save growth plan"}
      </button>

      <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 12 }}>
        This will lock the review and create the 90-day plan for {associateName}.
      </p>
    </main>
  );
}
