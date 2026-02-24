"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "9px 10px",
  marginTop: 6,
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 15,
  boxSizing: "border-box",
};

type InviteSlot = { firstName: string; lastName: string; email: string };
type SentResult = { role: string; email: string };

async function sendInvite(slot: InviteSlot): Promise<void> {
  const res = await fetch("/api/onboarding/invite-supervisor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(slot),
  });
  const json = await res.json() as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Something went wrong");
}

const ROLES = ["General Manager", "Chef / Kitchen Manager"] as const;

const PLACEHOLDERS: Record<string, string> = {
  "General Manager":       "gm@yourrestaurant.com",
  "Chef / Kitchen Manager": "chef@yourrestaurant.com",
};

const progressSteps = ["Company", "Profile", "Invite Team"];

function ProgressBar() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
      {progressSteps.map((label, i) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 24, height: 24, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700,
            backgroundColor: i < 2 ? "#111" : "#374151",
            color: "white",
          }}>
            {i < 2 ? "✓" : "3"}
          </div>
          <span style={{
            fontSize: 12,
            fontWeight: i === 2 ? 600 : 400,
            color: i === 2 ? "#111" : "#9ca3af",
          }}>
            {label}
          </span>
          {i < 2 && <div style={{ width: 20, height: 1, backgroundColor: "#e5e7eb" }} />}
        </div>
      ))}
    </div>
  );
}

export default function InviteTeamPage() {
  const router = useRouter();

  const [slots, setSlots] = useState<InviteSlot[]>(
    ROLES.map(() => ({ firstName: "", lastName: "", email: "" }))
  );
  const [busy,    setBusy]    = useState(false);
  const [sent,    setSent]    = useState<SentResult[]>([]);
  const [msg,     setMsg]     = useState<string | null>(null);

  function updateSlot(index: number, field: keyof InviteSlot, value: string) {
    setSlots((prev) => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  }

  function isSlotFilled(slot: InviteSlot) {
    return slot.firstName.trim() && slot.lastName.trim() && slot.email.trim();
  }

  const filledSlots = slots.filter(isSlotFilled);
  const canSubmit = !busy && filledSlots.length > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    const results: SentResult[] = [];
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (!isSlotFilled(slot)) continue;
      try {
        await sendInvite(slot);
        results.push({ role: ROLES[i], email: slot.email.trim() });
      } catch (err) {
        setMsg(`${ROLES[i]}: ${err instanceof Error ? err.message : "Failed to send"}`);
        setBusy(false);
        return;
      }
    }

    setSent(results);
    setBusy(false);
  }

  if (sent.length > 0) {
    return (
      <main style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
        <ProgressBar />
        <h1 style={{ fontSize: 26, fontWeight: 700 }}>
          {sent.length === 1 ? "Invite sent!" : "Invites sent!"}
        </h1>
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {sent.map(({ role, email }) => (
            <p key={email} style={{ color: "#374151", lineHeight: 1.6, fontSize: 15 }}>
              <strong>{role}</strong> — invite sent to <strong>{email}</strong>
            </p>
          ))}
        </div>
        <p style={{ color: "#6b7280", marginTop: 12, fontSize: 14, lineHeight: 1.6 }}>
          They'll set their password and land straight in the dashboard as supervisors.
        </p>
        <button
          onClick={() => router.replace("/dashboard")}
          style={{
            marginTop: 24,
            padding: "12px 0",
            width: "100%",
            fontWeight: 600,
            backgroundColor: "#111",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 15,
          }}
        >
          Go to dashboard
        </button>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 520, margin: "0 auto" }}>
      <ProgressBar />

      <h1 style={{ fontSize: 26, fontWeight: 700 }}>Invite your team</h1>
      <p style={{ color: "#6b7280", marginTop: 6, marginBottom: 24, fontSize: 14 }}>
        Invite your GM and Chef so they can access the platform. Both are optional —
        you can also invite them later from the dashboard.
      </p>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 24 }}>
        {ROLES.map((role, i) => (
          <div key={role}>
            <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, color: "#374151" }}>
              {role}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <label style={{ display: "block" }}>
                <span style={{ fontWeight: 500, fontSize: 14 }}>First name</span>
                <input
                  type="text"
                  value={slots[i].firstName}
                  onChange={(e) => updateSlot(i, "firstName", e.target.value)}
                  placeholder="First"
                  style={inputStyle}
                />
              </label>
              <label style={{ display: "block" }}>
                <span style={{ fontWeight: 500, fontSize: 14 }}>Last name</span>
                <input
                  type="text"
                  value={slots[i].lastName}
                  onChange={(e) => updateSlot(i, "lastName", e.target.value)}
                  placeholder="Last"
                  style={inputStyle}
                />
              </label>
            </div>
            <label style={{ display: "block" }}>
              <span style={{ fontWeight: 500, fontSize: 14 }}>Email address</span>
              <input
                type="email"
                value={slots[i].email}
                onChange={(e) => updateSlot(i, "email", e.target.value)}
                placeholder={PLACEHOLDERS[role]}
                style={inputStyle}
              />
            </label>
          </div>
        ))}

        {msg && (
          <p style={{ padding: "10px 12px", borderRadius: 6, background: "#fef2f2", color: "#991b1b", fontSize: 14 }}>
            {msg}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            padding: "12px 0",
            fontWeight: 600,
            backgroundColor: canSubmit ? "#111" : "#9ca3af",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: canSubmit ? "pointer" : "not-allowed",
            fontSize: 15,
          }}
        >
          {busy ? "Sending…" : `Send invite${filledSlots.length > 1 ? "s" : ""}`}
        </button>

        <button
          type="button"
          onClick={() => router.replace("/dashboard")}
          style={{
            padding: "10px 0",
            fontWeight: 500,
            backgroundColor: "transparent",
            color: "#9ca3af",
            border: "none",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          Skip for now
        </button>
      </form>
    </main>
  );
}
