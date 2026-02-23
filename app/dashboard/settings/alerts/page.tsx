"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../../lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type AlertSetting = {
  flag_reason: string;
  notify_role: string;
  urgency: string;
};

type Draft = {
  notify_role: string;
  urgency: string;
};

const FLAG_REASON_LABELS: Record<string, { label: string; description: string; defaultUrgency: string }> = {
  discriminatory_language: {
    label: "Discriminatory language or substance use",
    description:
      "Slurs, identity-based harassment, or notes indicating on-the-job drug or alcohol use. Requires immediate follow-up.",
    defaultUrgency: "immediate",
  },
  concern_keywords: {
    label: "Language of concern",
    description:
      "Keywords suggesting burnout, resignation intent, feeling unsafe, anxiety, or overwhelming stress.",
    defaultUrgency: "next_login",
  },
  concern_tags: {
    label: "Stress or friction tags",
    description:
      "A supervisor tagged the conversation topic as stress- or friction-related.",
    defaultUrgency: "next_login",
  },
  low_scores: {
    label: "Low meeting value",
    description:
      "The supervisor rated the meeting's value or next-step clarity as 2 or below.",
    defaultUrgency: "next_login",
  },
};

const NOTIFY_ROLE_LABELS: Record<string, string> = {
  owner:      "Owner only",
  supervisor: "Location supervisors only",
  both:       "Owner + location supervisors",
};

const URGENCY_LABELS: Record<string, string> = {
  immediate:  "Immediate (red — same-day follow-up expected)",
  next_login: "Standard (amber — review at next login)",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AlertSettingsPage() {
  const supabase = createClient();

  const [role, setRole]       = useState<string | null>(null);
  const [settings, setSettings] = useState<AlertSetting[]>([]);
  const [drafts, setDrafts]   = useState<Record<string, Draft>>({});
  const [saving, setSaving]   = useState<Record<string, boolean>>({});
  const [saved, setSaved]     = useState<Record<string, boolean>>({});
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch settings on mount
  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      const res  = await fetch("/api/settings/alerts");
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Failed to load settings");
        setLoading(false);
        return;
      }

      setRole(json.role);
      setSettings(json.settings ?? []);

      // Initialise drafts from fetched values
      const initial: Record<string, Draft> = {};
      for (const s of (json.settings ?? []) as AlertSetting[]) {
        initial[s.flag_reason] = { notify_role: s.notify_role, urgency: s.urgency };
      }
      // Ensure all 4 reasons have a draft (in case some are missing from DB)
      for (const reason of Object.keys(FLAG_REASON_LABELS)) {
        if (!initial[reason]) {
          initial[reason] = {
            notify_role: "owner",
            urgency: FLAG_REASON_LABELS[reason].defaultUrgency,
          };
        }
      }
      setDrafts(initial);
      setLoading(false);
    };
    load();
  }, []);

  const handleChange = (reason: string, field: keyof Draft, value: string) => {
    setDrafts((prev) => ({ ...prev, [reason]: { ...prev[reason], [field]: value } }));
  };

  const handleSave = async (reason: string) => {
    setSaving((prev) => ({ ...prev, [reason]: true }));
    setSaved((prev)  => ({ ...prev, [reason]: false }));

    const draft = drafts[reason];
    const res = await fetch("/api/settings/alerts", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        flagReason: reason,
        notifyRole: draft.notify_role,
        urgency:    draft.urgency,
      }),
    });

    setSaving((prev) => ({ ...prev, [reason]: false }));

    if (res.ok) {
      setSaved((prev) => ({ ...prev, [reason]: true }));
      setTimeout(() => setSaved((prev) => ({ ...prev, [reason]: false })), 2000);
    } else {
      const json = await res.json();
      setError(json.error ?? "Save failed");
    }
  };

  if (loading) return <p style={{ padding: "2rem" }}>Loading…</p>;
  if (error)   return <p style={{ padding: "2rem", color: "#dc2626" }}>{error}</p>;

  const isOwner = role === "owner";

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
        Alert escalation settings
      </h1>
      <p style={{ color: "#6b7280", marginBottom: "2rem", fontSize: "0.9rem" }}>
        Configure who sees each type of flagged check-in and how urgently it
        should be addressed. These settings apply to all locations in your company.
        {!isOwner && (
          <span style={{ display: "block", marginTop: "0.5rem", color: "#9ca3af" }}>
            Only owners can change these settings.
          </span>
        )}
      </p>

      {(Object.entries(FLAG_REASON_LABELS)).map(([reason, meta]) => {
        const draft = drafts[reason] ?? { notify_role: "owner", urgency: meta.defaultUrgency };
        const isSaving  = saving[reason];
        const wasSaved  = saved[reason];
        const isDiscriminatory = reason === "discriminatory_language";

        return (
          <div
            key={reason}
            style={{
              border:       `1px solid ${isDiscriminatory ? "#fca5a5" : "#e5e7eb"}`,
              borderRadius: "0.75rem",
              padding:      "1.25rem",
              marginBottom: "1rem",
              background:   isDiscriminatory ? "#fff5f5" : "#fff",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", marginBottom: "1rem" }}>
              <span
                style={{
                  display:      "inline-block",
                  width:        10,
                  height:       10,
                  borderRadius: "50%",
                  marginTop:    "0.35rem",
                  flexShrink:   0,
                  background:   isDiscriminatory ? "#ef4444" : "#f59e0b",
                }}
              />
              <div>
                <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>{meta.label}</h2>
                <p style={{ fontSize: "0.8rem", color: "#6b7280", margin: "0.25rem 0 0" }}>
                  {meta.description}
                </p>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              {/* Notify role */}
              <div>
                <label
                  htmlFor={`${reason}-role`}
                  style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.3rem" }}
                >
                  Who gets notified
                </label>
                <select
                  id={`${reason}-role`}
                  value={draft.notify_role}
                  disabled={!isOwner}
                  onChange={(e) => handleChange(reason, "notify_role", e.target.value)}
                  style={{
                    width: "100%", padding: "0.5rem 0.75rem", fontSize: "0.875rem",
                    border: "1px solid #d1d5db", borderRadius: "0.5rem",
                    background: isOwner ? "#fff" : "#f9fafb",
                    color: isOwner ? "#111827" : "#9ca3af",
                    cursor: isOwner ? "default" : "not-allowed",
                  }}
                >
                  {Object.entries(NOTIFY_ROLE_LABELS).map(([val, lbl]) => (
                    <option key={val} value={val}>{lbl}</option>
                  ))}
                </select>
              </div>

              {/* Urgency */}
              <div>
                <label
                  htmlFor={`${reason}-urgency`}
                  style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.3rem" }}
                >
                  Urgency
                </label>
                <select
                  id={`${reason}-urgency`}
                  value={draft.urgency}
                  disabled={!isOwner}
                  onChange={(e) => handleChange(reason, "urgency", e.target.value)}
                  style={{
                    width: "100%", padding: "0.5rem 0.75rem", fontSize: "0.875rem",
                    border: "1px solid #d1d5db", borderRadius: "0.5rem",
                    background: isOwner ? "#fff" : "#f9fafb",
                    color: isOwner ? "#111827" : "#9ca3af",
                    cursor: isOwner ? "default" : "not-allowed",
                  }}
                >
                  {Object.entries(URGENCY_LABELS).map(([val, lbl]) => (
                    <option key={val} value={val}>{lbl}</option>
                  ))}
                </select>
              </div>
            </div>

            {isOwner && (
              <div style={{ marginTop: "0.75rem", textAlign: "right" }}>
                <button
                  onClick={() => handleSave(reason)}
                  disabled={isSaving}
                  style={{
                    padding:      "0.4rem 1rem",
                    fontSize:     "0.8rem",
                    fontWeight:   600,
                    borderRadius: "0.5rem",
                    border:       "none",
                    cursor:       isSaving ? "not-allowed" : "pointer",
                    background:   wasSaved ? "#d1fae5" : "#111827",
                    color:        wasSaved ? "#065f46" : "#fff",
                    transition:   "background 0.2s",
                  }}
                >
                  {isSaving ? "Saving…" : wasSaved ? "Saved" : "Save"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
