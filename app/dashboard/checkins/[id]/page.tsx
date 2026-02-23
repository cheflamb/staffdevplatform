"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type CheckinDetail = {
  id: string;
  completed_at: string;
  role_level_snapshot: string | null;
  notes_summary: string | null;
  followup_commitment: string | null;
  revisit_date: string | null;
  share_with_associate: boolean;
  flagged: boolean;
  flag_reasons: string[];
  reviewed_at: string | null;
  review_note: string | null;
  associates: { id: string; first_name: string; last_name: string } | null;
};

type CheckinPrompt = {
  id: string;
  notes: string | null;
  tags: string[];
  prompts: { prompt_text: string; category: string } | null;
};

type SelfAssessment = {
  talk_ratio_score: number;
  listening_score: number;
  question_quality_score: number;
  emotional_acknowledgement_score: number;
  paraphrasing_score: number;
  coaching_score: number;
  distraction_score: number;
  next_step_score: number;
  value_score: number;
  improvement_notes: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const CATEGORY_LABELS: Record<string, string> = {
  clarity:    "Clarity",
  capacity:   "Capacity",
  competence: "Competence",
  connection:  "Connection",
};

const FLAG_REASON_LABELS: Record<string, string> = {
  discriminatory_language: "Discriminatory language",
  concern_keywords:        "Language of concern",
  concern_tags:            "Stress or friction tagged",
  low_scores:              "Low meeting value",
};

const SA_FIELDS: { key: keyof SelfAssessment; label: string }[] = [
  { key: "talk_ratio_score",                label: "Talk ratio" },
  { key: "listening_score",                 label: "Active listening" },
  { key: "question_quality_score",          label: "Question quality" },
  { key: "emotional_acknowledgement_score", label: "Emotional acknowledgement" },
  { key: "paraphrasing_score",              label: "Paraphrasing" },
  { key: "coaching_score",                  label: "Coaching" },
  { key: "distraction_score",               label: "Stayed focused" },
  { key: "next_step_score",                 label: "Next step clarity" },
  { key: "value_score",                     label: "Meeting value" },
];

function scoreColor(n: number): string {
  if (n <= 2) return "#dc2626";
  if (n === 3) return "#d97706";
  return "#16a34a";
}

function ScorePip({ value, active }: { value: number; active: boolean }) {
  return (
    <span style={{
      display: "inline-block",
      width: 28, height: 28, lineHeight: "28px", textAlign: "center",
      borderRadius: 6, fontSize: 13, fontWeight: 700,
      background: active ? scoreColor(value) : "#f3f4f6",
      color: active ? "#fff" : "#9ca3af",
      margin: "0 2px",
    }}>
      {value}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function CheckinDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const checkinId = params.id;

  const [checkin,    setCheckin]    = useState<CheckinDetail | null>(null);
  const [prompts,    setPrompts]    = useState<CheckinPrompt[]>([]);
  const [selfAssess, setSelfAssess] = useState<SelfAssessment | null>(null);
  const [callerRole, setCallerRole] = useState<string>("");
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  // Review state
  const [reviewNote,     setReviewNote]     = useState("");
  const [reviewBusy,     setReviewBusy]     = useState(false);
  const [reviewDone,     setReviewDone]     = useState(false);

  useEffect(() => {
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
      setCallerRole(m.role);

      const [{ data: ci, error: ciErr }, { data: cp }, { data: sa }] = await Promise.all([
        supabase
          .from("check_ins")
          .select("id, completed_at, role_level_snapshot, notes_summary, followup_commitment, revisit_date, share_with_associate, flagged, flag_reasons, reviewed_at, review_note, associates(id, first_name, last_name)")
          .eq("id", checkinId)
          .maybeSingle(),
        supabase
          .from("checkin_prompts")
          .select("id, notes, tags, prompts(prompt_text, category)")
          .eq("checkin_id", checkinId)
          .order("id"),
        supabase
          .from("self_assessments")
          .select("talk_ratio_score, listening_score, question_quality_score, emotional_acknowledgement_score, paraphrasing_score, coaching_score, distraction_score, next_step_score, value_score, improvement_notes")
          .eq("checkin_id", checkinId)
          .maybeSingle(),
      ]);

      if (ciErr || !ci) {
        setError("Check-in not found.");
        setLoading(false);
        return;
      }

      setCheckin(ci as unknown as CheckinDetail);
      setPrompts((cp ?? []) as unknown as CheckinPrompt[]);
      setSelfAssess(sa as unknown as SelfAssessment | null);
      if (ci.review_note) setReviewNote(ci.review_note);
      setLoading(false);
    })();
  }, [checkinId, router]);

  async function handleMarkReviewed() {
    setReviewBusy(true);
    const res = await fetch(`/api/checkins/${checkinId}/review`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ note: reviewNote }),
    });
    setReviewBusy(false);
    if (res.ok) {
      setReviewDone(true);
      setCheckin((prev) => prev ? { ...prev, reviewed_at: new Date().toISOString(), review_note: reviewNote || null } : prev);
    } else {
      const json = await res.json();
      setError(json.error ?? "Failed to mark as reviewed");
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (loading) return <main className="page-pad" style={{ maxWidth: 680, margin: "0 auto" }}><p style={{ color: "#6b7280" }}>Loading…</p></main>;
  if (error && !checkin) return <main className="page-pad" style={{ maxWidth: 680, margin: "0 auto" }}><p style={{ color: "#991b1b" }}>{error}</p></main>;
  if (!checkin) return null;

  const associate = checkin.associates;
  const associateName = associate ? `${associate.first_name} ${associate.last_name}` : "Unknown";
  const associateId   = associate?.id ?? "";

  const isUnreviewed = checkin.flagged && !checkin.reviewed_at;
  const isDiscriminatory = checkin.flag_reasons.includes("discriminatory_language");

  // Group prompts by category preserving order
  const byCategory: Record<string, CheckinPrompt[]> = {};
  for (const p of prompts) {
    const cat = p.prompts?.category ?? "other";
    (byCategory[cat] ??= []).push(p);
  }

  const sectionStyle: React.CSSProperties = {
    marginTop: 28,
    paddingTop: 20,
    borderTop: "1px solid #e5e7eb",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.08em", color: "#9ca3af", marginBottom: 12,
  };

  return (
    <main className="page-pad" style={{ maxWidth: 680, margin: "0 auto" }}>
      {/* Back */}
      <button
        onClick={() => associateId ? router.push(`/dashboard/associates/${associateId}`) : router.back()}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "#6b7280", padding: 0, marginBottom: 20, fontSize: 14,
        }}
      >
        ← {associateName}
      </button>

      {/* Header */}
      <div style={{ marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>{associateName}</h1>
        <p style={{ color: "#6b7280", fontSize: 14, marginTop: 4 }}>
          Check-in ·{" "}
          {new Date(checkin.completed_at).toLocaleDateString(undefined, {
            weekday: "long", year: "numeric", month: "long", day: "numeric",
          })}
          {checkin.role_level_snapshot && (
            <span style={{
              marginLeft: 10, fontSize: 11, fontWeight: 600, padding: "1px 7px",
              borderRadius: 4, background: "#f3f4f6", color: "#6b7280",
              textTransform: "capitalize", verticalAlign: "middle",
            }}>
              {checkin.role_level_snapshot}
            </span>
          )}
        </p>
      </div>

      {/* ── Flag alert ──────────────────────────────────────────────────── */}
      {checkin.flagged && (
        <div style={{
          marginTop: 20,
          padding: "14px 16px",
          borderRadius: 8,
          border:           isDiscriminatory ? "1px solid #fca5a5" : "1px solid #fde68a",
          backgroundColor:  isDiscriminatory ? "#fff5f5"           : "#fffbeb",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            {isDiscriminatory && !checkin.reviewed_at && (
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                padding: "1px 6px", borderRadius: 4,
                background: "#fee2e2", color: "#991b1b",
              }}>
                URGENT
              </span>
            )}
            <span style={{ fontWeight: 600, fontSize: 14, color: isDiscriminatory ? "#991b1b" : "#92400e" }}>
              {checkin.reviewed_at ? "Flag reviewed" : "Flagged for attention"}
            </span>
          </div>
          <p style={{ fontSize: 13, color: isDiscriminatory ? "#991b1b" : "#92400e", margin: 0 }}>
            {checkin.flag_reasons
              .map((r) => FLAG_REASON_LABELS[r] ?? r)
              .join(" · ")}
          </p>

          {checkin.reviewed_at && (
            <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>
              Reviewed {new Date(checkin.reviewed_at).toLocaleDateString(undefined, {
                month: "short", day: "numeric", year: "numeric",
              })}
              {checkin.review_note && ` — "${checkin.review_note}"`}
            </p>
          )}

          {/* Mark as reviewed — only if not yet reviewed */}
          {isUnreviewed && (
            <div style={{ marginTop: 14, borderTop: "1px solid #fde68a", paddingTop: 12 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Resolution note (optional)
              </label>
              <textarea
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Describe the action taken or outcome…"
                rows={2}
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "8px 10px", fontSize: 13,
                  border: "1px solid #d1d5db", borderRadius: 6, resize: "vertical",
                }}
              />
              <button
                onClick={handleMarkReviewed}
                disabled={reviewBusy || reviewDone}
                style={{
                  marginTop: 8, padding: "7px 16px",
                  fontWeight: 600, fontSize: 13, borderRadius: 6, border: "none",
                  cursor: (reviewBusy || reviewDone) ? "not-allowed" : "pointer",
                  background: reviewDone ? "#d1fae5" : "#111",
                  color:      reviewDone ? "#065f46" : "#fff",
                }}
              >
                {reviewBusy ? "Saving…" : reviewDone ? "Marked as reviewed" : "Mark as reviewed"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Conversation topics ─────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <p style={labelStyle}>Conversation topics</p>
        {Object.entries(CATEGORY_LABELS).map(([cat, catLabel]) => {
          const catPrompts = byCategory[cat];
          if (!catPrompts?.length) return null;
          return (
            <div key={cat} style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 8 }}>
                {catLabel}
              </p>
              {catPrompts.map((p) => (
                <div
                  key={p.id}
                  style={{
                    marginBottom: 10, padding: "10px 12px",
                    background: "#f9fafb", borderRadius: 6,
                  }}
                >
                  <p style={{ fontWeight: 500, fontSize: 14, margin: 0 }}>
                    {p.prompts?.prompt_text ?? "—"}
                  </p>
                  {p.notes && (
                    <p style={{ fontSize: 13, color: "#374151", marginTop: 6, marginBottom: 0 }}>
                      {p.notes}
                    </p>
                  )}
                  {p.tags.length > 0 && (
                    <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {p.tags.map((t) => (
                        <span key={t} style={{
                          fontSize: 10, padding: "1px 7px", borderRadius: 4,
                          background: t === "stress" || t === "friction" ? "#fff7ed" : "#f0fdf4",
                          color:      t === "stress" || t === "friction" ? "#c2410c"  : "#166534",
                          fontWeight: 600,
                        }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* ── Notes & commitments ─────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <p style={labelStyle}>Notes & commitments</p>
        {checkin.notes_summary && (
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>Meeting summary</p>
            <p style={{ fontSize: 14, color: "#111827", lineHeight: 1.6 }}>{checkin.notes_summary}</p>
          </div>
        )}
        {checkin.followup_commitment && (
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>Follow-up commitment</p>
            <p style={{ fontSize: 14, color: "#111827", lineHeight: 1.6 }}>{checkin.followup_commitment}</p>
          </div>
        )}
        <div>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>Revisit date</p>
          <p style={{ fontSize: 14, color: checkin.revisit_date ? "#111827" : "#9ca3af" }}>
            {checkin.revisit_date
              ? new Date(checkin.revisit_date + "T00:00:00").toLocaleDateString(undefined, {
                  weekday: "short", month: "long", day: "numeric",
                })
              : "None set"}
          </p>
        </div>
      </div>

      {/* ── Self-assessment ─────────────────────────────────────────────── */}
      {selfAssess && (
        <div style={sectionStyle}>
          <p style={labelStyle}>Supervisor self-assessment</p>
          <div style={{ display: "grid", gap: 8 }}>
            {SA_FIELDS.map(({ key, label }) => {
              const score = selfAssess[key] as number;
              return (
                <div
                  key={key}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <span style={{ fontSize: 13, color: "#374151" }}>{label}</span>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    {[1, 2, 3, 4, 5].map((v) => (
                      <ScorePip key={v} value={score} active={v === score} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {selfAssess.improvement_notes && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>Improvement notes</p>
              <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{selfAssess.improvement_notes}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 32, display: "flex", gap: 10 }}>
        <button
          onClick={() => router.push(`/dashboard/checkins/new?associateId=${associateId}`)}
          style={{
            padding: "10px 20px", fontWeight: 600, fontSize: 13,
            background: "#111", color: "#fff", border: "none",
            borderRadius: 6, cursor: "pointer",
          }}
        >
          New Check-In
        </button>
        <button
          onClick={() => router.push(`/dashboard/associates/${associateId}`)}
          style={{
            padding: "10px 20px", fontWeight: 600, fontSize: 13,
            background: "#fff", color: "#374151",
            border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer",
          }}
        >
          Back to profile
        </button>
      </div>
    </main>
  );
}
