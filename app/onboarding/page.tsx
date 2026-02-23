"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ProvisionCheck =
  | { hasCompany: boolean; companyId: string | null }
  | { error: string };

export default function OnboardingPage() {
  const router = useRouter();

  const [companyName, setCompanyName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  // Redirect to dashboard if user already has a company.
  // Middleware guarantees the user is authenticated before reaching here.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setChecking(true);
      setMsg(null);

      try {
        const res = await fetch("/api/provision", { method: "GET" });
        const json = (await res.json()) as ProvisionCheck;

        if (!res.ok) {
          const errMsg = "error" in json ? json.error : "Provision check failed";
          throw new Error(errMsg);
        }

        if ("hasCompany" in json && json.hasCompany) {
          if (!cancelled) router.replace("/dashboard");
          return;
        }

        if (!cancelled) setChecking(false);
      } catch (err: unknown) {
        if (!cancelled) {
          setMsg(err instanceof Error ? err.message : "Provision check failed");
          setChecking(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    try {
      const res = await fetch("/api/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, locationName }),
      });

      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json?.error || "Provisioning failed");

      router.replace("/onboarding/profile");
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <main style={{ padding: 24, maxWidth: 520, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Setting things up...</h1>
        <p style={{ marginTop: 8, color: "#555" }}>
          Checking your workspace status.
        </p>
        {msg && <p style={{ color: "crimson", marginTop: 12 }}>{msg}</p>}
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 520, margin: "0 auto" }}>
      {/* Progress indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
        {["Company", "Profile"].map((label, i) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700,
              backgroundColor: i === 0 ? "#374151" : "#e5e7eb",
              color: i === 0 ? "white" : "#9ca3af",
            }}>
              {i + 1}
            </div>
            <span style={{ fontSize: 12, fontWeight: i === 0 ? 600 : 400, color: i === 0 ? "#111" : "#9ca3af" }}>
              {label}
            </span>
            {i < 1 && <div style={{ width: 20, height: 1, backgroundColor: "#e5e7eb" }} />}
          </div>
        ))}
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Set up your company</h1>
      <p style={{ marginTop: 8 }}>
        This creates your private workspace for staff, tiers, reviews, and check-ins.
      </p>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label>
          Company name
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
            style={{
              width: "100%",
              padding: 10,
              marginTop: 6,
              border: "1px solid #ccc",
              borderRadius: 6,
            }}
          />
        </label>

        <label>
          First location name
          <input
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
            required
            placeholder="e.g. Downtown, Main Kitchen, North Location"
            style={{
              width: "100%",
              padding: 10,
              marginTop: 6,
              border: "1px solid #ccc",
              borderRadius: 6,
            }}
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          style={{
            padding: 12,
            fontWeight: 600,
            backgroundColor: "#111",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          {busy ? "Creating..." : "Create workspace"}
        </button>

        {msg && <p style={{ color: "crimson" }}>{msg}</p>}
      </form>
    </main>
  );
}
