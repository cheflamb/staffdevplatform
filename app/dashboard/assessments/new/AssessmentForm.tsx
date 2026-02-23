"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { AssessmentQuestion } from "./page";

type Props = {
  associateId: string;
  associateName: string;
  currentPosition: string;
  targetPosition: string;
  templateId: string;
  questions: AssessmentQuestion[];
};

type AnswerState = {
  answer_text: string;
  passed: boolean | null;
};

// ---------------------------------------------------------------------------
// Toggle button (Pass/Fail or Yes/No)
// ---------------------------------------------------------------------------
function ToggleButton({
  label,
  selected,
  color,
  onClick,
}: {
  label: string;
  selected: boolean;
  color: "green" | "red";
  onClick: () => void;
}) {
  const bg = selected
    ? color === "green" ? "#dcfce7" : "#fee2e2"
    : "#ffffff";
  const textColor = selected
    ? color === "green" ? "#166534" : "#991b1b"
    : "#374151";
  const border = selected
    ? color === "green" ? "1.5px solid #86efac" : "1.5px solid #fca5a5"
    : "1.5px solid #d1d5db";

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "8px 0",
        borderRadius: 6,
        border,
        backgroundColor: bg,
        color: textColor,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 0.1s",
      }}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Question card
// ---------------------------------------------------------------------------
function QuestionCard({
  q,
  answer,
  onChange,
}: {
  q: AssessmentQuestion;
  answer: AnswerState;
  onChange: (update: Partial<AnswerState>) => void;
}) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: "16px 20px",
        marginBottom: 8,
      }}
    >
      <p style={{ fontSize: 14, fontWeight: 500, color: "#111827", marginBottom: 12, lineHeight: 1.5 }}>
        {q.question_text}
      </p>

      {q.question_type === "yes_no" && (
        <div style={{ display: "flex", gap: 8 }}>
          <ToggleButton
            label="Yes"
            selected={answer.passed === true}
            color="green"
            onClick={() => onChange({ passed: true })}
          />
          <ToggleButton
            label="No"
            selected={answer.passed === false}
            color="red"
            onClick={() => onChange({ passed: false })}
          />
        </div>
      )}

      {q.question_type === "practical" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <ToggleButton
              label="Pass"
              selected={answer.passed === true}
              color="green"
              onClick={() => onChange({ passed: true })}
            />
            <ToggleButton
              label="Fail"
              selected={answer.passed === false}
              color="red"
              onClick={() => onChange({ passed: false })}
            />
          </div>
          <textarea
            placeholder="Notes (optional)"
            value={answer.answer_text}
            onChange={(e) => onChange({ answer_text: e.target.value })}
            rows={2}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              fontSize: 13,
              color: "#374151",
              resize: "vertical",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
        </>
      )}

      {q.question_type === "written" && (
        <textarea
          placeholder="Evaluator notes"
          value={answer.answer_text}
          onChange={(e) => onChange({ answer_text: e.target.value })}
          rows={3}
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid #e5e7eb",
            fontSize: 13,
            color: "#374151",
            resize: "vertical",
            fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function AssessmentForm({
  associateId,
  associateName,
  currentPosition,
  targetPosition,
  templateId,
  questions,
}: Props) {
  const router = useRouter();

  const initialAnswers: Record<string, AnswerState> = {};
  for (const q of questions) {
    initialAnswers[q.id] = { answer_text: "", passed: null };
  }

  const [answers, setAnswers] = useState<Record<string, AnswerState>>(initialAnswers);
  const [overallPassed, setOverallPassed] = useState<boolean | null>(null);
  const [notes, setNotes] = useState("");
  const [proposedClassification, setProposedClassification] = useState(targetPosition);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group questions by skill_category (preserve order of first appearance)
  const groups = useMemo(() => {
    const seen: string[] = [];
    for (const q of questions) {
      if (!seen.includes(q.skill_category)) seen.push(q.skill_category);
    }
    return seen.map((cat) => ({
      category: cat,
      questions: questions.filter((q) => q.skill_category === cat),
    }));
  }, [questions]);

  // Validate: all practical + yes_no questions need a passed value; overall result + notes
  const canSubmit = useMemo(() => {
    for (const q of questions) {
      if (q.question_type === "practical" || q.question_type === "yes_no") {
        if (answers[q.id]?.passed === null) return false;
      }
    }
    return overallPassed !== null && notes.trim().length > 0;
  }, [answers, overallPassed, notes, questions]);

  function updateAnswer(questionId: string, update: Partial<AnswerState>) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], ...update },
    }));
  }

  async function handleSubmit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);

    const answerPayload = questions.map((q) => ({
      question_id: q.id,
      answer_text: answers[q.id]?.answer_text || null,
      passed: answers[q.id]?.passed ?? null,
    }));

    const res = await fetch("/api/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        associate_id: associateId,
        template_id: templateId,
        answers: answerPayload,
        overall_passed: overallPassed,
        notes: notes.trim(),
        current_classification: currentPosition,
        proposed_classification: proposedClassification,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return;
    }

    if (data.passed) {
      router.push(`/dashboard/associates/${associateId}?assessment=passed`);
    } else {
      router.push(`/dashboard/assessments/${data.resultId}/new-plan`);
    }
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

      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
        {associateName} — Assessment for {targetPosition}
      </h1>
      <p style={{ fontSize: 14, color: "#9ca3af", marginBottom: 32 }}>
        Current position: {currentPosition}
      </p>

      {/* Instruction block */}
      <div
        style={{
          backgroundColor: "#f8fafc",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: "14px 18px",
          marginBottom: 32,
        }}
      >
        <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
          Work through each question with the associate. Record answers and mark pass/fail where required.
          All fields are saved on submit — this is a single-session evaluation.
        </p>
      </div>

      {questions.length === 0 && (
        <p style={{ color: "#6b7280", fontSize: 14 }}>
          No questions found for this assessment level. Contact your platform administrator.
        </p>
      )}

      {/* Questions grouped by skill category */}
      {groups.map((group) => (
        <section key={group.category} style={{ marginBottom: 32 }}>
          <h2 style={sectionLabel}>{group.category}</h2>
          {group.questions.map((q) => (
            <QuestionCard
              key={q.id}
              q={q}
              answer={answers[q.id] ?? { answer_text: "", passed: null }}
              onChange={(update) => updateAnswer(q.id, update)}
            />
          ))}
        </section>
      ))}

      {/* Overall result */}
      {questions.length > 0 && (
        <section
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: "20px",
            marginBottom: 32,
          }}
        >
          <h2 style={{ ...sectionLabel, marginBottom: 16 }}>Overall Result</h2>

          {/* Evaluator notes */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
              Evaluator notes (required)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Summarise the evaluation — strengths observed, areas for development, overall impression…"
              rows={4}
              style={{
                width: "100%",
                padding: "10px 12px",
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

          {/* Classification */}
          <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                Current classification
              </label>
              <p
                style={{
                  fontSize: 14,
                  color: "#6b7280",
                  padding: "8px 12px",
                  border: "1px solid #f3f4f6",
                  borderRadius: 6,
                  backgroundColor: "#f9fafb",
                }}
              >
                {currentPosition}
              </p>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                Proposed classification
              </label>
              <input
                type="text"
                value={proposedClassification}
                onChange={(e) => setProposedClassification(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid #e5e7eb",
                  fontSize: 14,
                  color: "#374151",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Pass / Not ready */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 8 }}>
              Assessment outcome
            </label>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                onClick={() => setOverallPassed(true)}
                style={{
                  flex: 1,
                  padding: "12px 0",
                  borderRadius: 8,
                  border: overallPassed === true ? "2px solid #86efac" : "2px solid #e5e7eb",
                  backgroundColor: overallPassed === true ? "#dcfce7" : "#ffffff",
                  color: overallPassed === true ? "#166534" : "#374151",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Pass — advance to {targetPosition}
              </button>
              <button
                type="button"
                onClick={() => setOverallPassed(false)}
                style={{
                  flex: 1,
                  padding: "12px 0",
                  borderRadius: 8,
                  border: overallPassed === false ? "2px solid #fca5a5" : "2px solid #e5e7eb",
                  backgroundColor: overallPassed === false ? "#fee2e2" : "#ffffff",
                  color: overallPassed === false ? "#991b1b" : "#374151",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Not yet ready
              </button>
            </div>
          </div>
        </section>
      )}

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
        {busy ? "Submitting…" : "Submit assessment"}
      </button>
    </main>
  );
}
