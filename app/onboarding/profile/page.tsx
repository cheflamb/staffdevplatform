"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

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

const JOB_TITLES = [
  "Owner",
  "General Manager",
  "Area Manager",
  "Operations Manager",
  "Other",
];

export default function ProfileSetupPage() {
  const router = useRouter();

  const [fullName,  setFullName]  = useState("");
  const [phone,     setPhone]     = useState("");
  const [jobTitle,  setJobTitle]  = useState("");
  const [busy,      setBusy]      = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [msg,       setMsg]       = useState<string | null>(null);

  // Pre-fill whatever we already have
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone, job_title")
        .eq("id", user.id)
        .maybeSingle();

      if (profile) {
        setFullName(profile.full_name ?? "");
        setPhone(profile.phone ?? "");
        setJobTitle(profile.job_title ?? "");
      }
      setLoading(false);
    })();
  }, [router]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, phone, jobTitle }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to save");
      router.replace("/dashboard");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  function onSkip() {
    router.replace("/dashboard");
  }

  if (loading) {
    return (
      <main style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
        <p style={{ color: "#6b7280" }}>Loading…</p>
      </main>
    );
  }

  const canSave = !busy && fullName.trim().length > 0 && jobTitle.length > 0;

  return (
    <main style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      {/* Progress indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
        {["Company", "Profile"].map((label, i) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700,
              backgroundColor: i === 0 ? "#111" : "#374151",
              color: "white",
            }}>
              {i === 0 ? "✓" : "2"}
            </div>
            <span style={{ fontSize: 12, fontWeight: i === 1 ? 600 : 400, color: i === 1 ? "#111" : "#9ca3af" }}>
              {label}
            </span>
            {i < 1 && <div style={{ width: 20, height: 1, backgroundColor: "#e5e7eb" }} />}
          </div>
        ))}
      </div>

      <h1 style={{ fontSize: 26, fontWeight: 700 }}>Complete your profile</h1>
      <p style={{ color: "#6b7280", marginTop: 6, marginBottom: 24, fontSize: 14 }}>
        Helps your team know who to reach and how.
      </p>

      <form onSubmit={onSave} style={{ display: "grid", gap: 16 }}>
        <label style={{ display: "block" }}>
          <span style={{ fontWeight: 500 }}>Full name</span>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            placeholder="First and last name"
            style={inputStyle}
          />
        </label>

        <label style={{ display: "block" }}>
          <span style={{ fontWeight: 500 }}>Phone number</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. (555) 000-1234"
            style={inputStyle}
          />
        </label>

        <label style={{ display: "block" }}>
          <span style={{ fontWeight: 500 }}>Your role</span>
          <select
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            required
            style={inputStyle}
          >
            <option value="">Select your role</option>
            {JOB_TITLES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>

        {msg && (
          <p style={{ padding: "10px 12px", borderRadius: 6, background: "#fef2f2", color: "#991b1b", fontSize: 14 }}>
            {msg}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSave}
          style={{
            padding: "12px 0",
            fontWeight: 600,
            backgroundColor: canSave ? "#111" : "#9ca3af",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: canSave ? "pointer" : "not-allowed",
            fontSize: 15,
          }}
        >
          {busy ? "Saving…" : "Save & go to dashboard"}
        </button>

        <button
          type="button"
          onClick={onSkip}
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
