"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// ReplyForm
// Inline right-of-reply form for staff members on the associate portal.
// The DB enforces a one-time write — once submitted this component shows a
// permanent confirmation and cannot be submitted again.
// ---------------------------------------------------------------------------
export default function ReplyForm({ incidentId }: { incidentId: string }) {
  const [open,  setOpen]  = useState(false);
  const [text,  setText]  = useState("");
  const [busy,  setBusy]  = useState(false);
  const [done,  setDone]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/reply`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ response: trimmed }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to submit response");
      setDone(true);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  // After successful submission, show a permanent confirmation
  if (done) {
    return (
      <div
        style={{
          marginTop: 10,
          padding: "10px 14px",
          backgroundColor: "#f0f9ff",
          border: "1px solid #bae6fd",
          borderRadius: 6,
        }}
      >
        <p style={{ fontSize: 12, color: "#0369a1", fontWeight: 600 }}>
          Your response has been submitted and added to your record.
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10 }}>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#4b5563",
            backgroundColor: "#f3f4f6",
            border: "1px solid #d1d5db",
            borderRadius: 5,
            padding: "5px 12px",
            cursor: "pointer",
          }}
        >
          Submit my response
        </button>
      ) : (
        <div
          style={{
            border: "1px solid #bae6fd",
            borderRadius: 8,
            padding: "12px 14px",
            backgroundColor: "#f0f9ff",
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#0369a1",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 8,
            }}
          >
            Your written response
          </p>
          <p style={{ fontSize: 12, color: "#374151", marginBottom: 10, lineHeight: 1.5 }}>
            This is a one-time submission. Once saved it becomes a permanent,
            uneditable part of your record. Take your time.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="Write your response here…"
            style={{
              display: "block",
              width: "100%",
              padding: "9px 10px",
              border: "1px solid #bae6fd",
              borderRadius: 6,
              fontSize: 14,
              lineHeight: 1.5,
              resize: "vertical",
              boxSizing: "border-box",
              fontFamily: "inherit",
              backgroundColor: "#fff",
            }}
          />
          {error && (
            <p style={{ fontSize: 12, color: "#991b1b", marginTop: 6 }}>{error}</p>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={onSubmit}
              disabled={busy || !text.trim()}
              style={{
                padding: "7px 16px",
                fontSize: 13,
                fontWeight: 600,
                backgroundColor: busy || !text.trim() ? "#9ca3af" : "#0369a1",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: busy || !text.trim() ? "not-allowed" : "pointer",
              }}
            >
              {busy ? "Submitting…" : "Submit response"}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setText(""); setError(null); }}
              disabled={busy}
              style={{
                padding: "7px 12px",
                fontSize: 13,
                fontWeight: 500,
                backgroundColor: "transparent",
                color: "#6b7280",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
