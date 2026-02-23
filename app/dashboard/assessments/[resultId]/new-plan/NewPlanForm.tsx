"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  resultId: string;
  associateId: string;
  associateName: string;
  targetPosition: string;
};

export default function NewPlanForm({
  resultId,
  associateId,
  associateName,
  targetPosition,
}: Props) {
  const router = useRouter();
  const [milestone30, setMilestone30] = useState("");
  const [milestone60, setMilestone60] = useState("");
  const [milestone90, setMilestone90] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    milestone30.trim().length > 0 &&
    milestone60.trim().length > 0 &&
    milestone90.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);

    const res = await fetch(`/api/assessments/${resultId}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        milestone_30: milestone30.trim(),
        milestone_60: milestone60.trim(),
        milestone_90: milestone90.trim(),
      }),
    });

    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return;
    }

    router.push(`/dashboard/associates/${associateId}`);
  }

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
          {associateName} — Assessment
        </h1>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: 4,
            backgroundColor: "#fee2e2",
            color: "#991b1b",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            flexShrink: 0,
          }}
        >
          Not yet ready
        </span>
      </div>
      <p style={{ fontSize: 14, color: "#9ca3af", marginBottom: 32 }}>
        Not yet ready for {targetPosition}
      </p>

      {/* Context block */}
      <div
        style={{
          backgroundColor: "#fffbeb",
          border: "1px solid #fde68a",
          borderRadius: 8,
          padding: "14px 18px",
          marginBottom: 32,
        }}
      >
        <p style={{ fontSize: 14, color: "#92400e", lineHeight: 1.6 }}>
          Create a new 30/60/90-day development plan to prepare {associateName} for their next assessment
          toward <strong>{targetPosition}</strong>.
        </p>
      </div>

      {/* Milestones */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={sectionLabel}>Development milestones</h2>
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {[
            { day: 30, value: milestone30, setter: setMilestone30, placeholder: "e.g., Consistently executing all menu items on the cold station without assistance" },
            { day: 60, value: milestone60, setter: setMilestone60, placeholder: "e.g., Running the cold station independently through a service peak with no errors" },
            { day: 90, value: milestone90, setter: setMilestone90, placeholder: "e.g., Ready for reassessment — able to demonstrate all assessment criteria to standard" },
          ].map(({ day, value, setter, placeholder }, idx) => (
            <div
              key={day}
              style={{
                display: "flex",
                gap: 16,
                padding: "16px 20px",
                borderBottom: idx < 2 ? "1px solid #f3f4f6" : "none",
                alignItems: "flex-start",
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 56,
                  padding: "4px 0",
                  textAlign: "center",
                  backgroundColor: "#f3f4f6",
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#374151",
                  marginTop: 4,
                }}
              >
                Day {day}
              </span>
              <textarea
                value={value}
                onChange={(e) => setter(e.target.value)}
                placeholder={placeholder}
                rows={2}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid #e5e7eb",
                  fontSize: 14,
                  color: "#374151",
                  resize: "vertical",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>
          ))}
        </div>
      </section>

      {error && (
        <p style={{ color: "#ef4444", fontSize: 14, marginBottom: 16 }}>{error}</p>
      )}

      <button
        type="button"
        disabled={!canSubmit || busy}
        onClick={handleSubmit}
        style={{
          padding: "12px 32px",
          borderRadius: 8,
          border: "none",
          backgroundColor: canSubmit && !busy ? "#111827" : "#e5e7eb",
          color: canSubmit && !busy ? "#ffffff" : "#9ca3af",
          fontSize: 15,
          fontWeight: 600,
          cursor: canSubmit && !busy ? "pointer" : "not-allowed",
        }}
      >
        {busy ? "Creating plan…" : "Create development plan"}
      </button>
    </main>
  );
}
