"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "../lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Middleware handles already-logged-in redirect before this page renders.

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setBusy(false);
      return setMsg(error.message);
    }

    // Session is now in cookies. Provision API reads it directly.
    try {
      const res = await fetch("/api/provision", { method: "GET" });
      setBusy(false);

      if (res.ok) {
        const json = await res.json();
        router.push(json.hasCompany ? "/dashboard" : "/onboarding");
      } else {
        router.push("/onboarding");
      }
    } catch {
      setBusy(false);
      router.push("/onboarding");
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Log in</h1>

      <form
        onSubmit={onSubmit}
        style={{ display: "grid", gap: 12, marginTop: 16 }}
      >
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          {busy ? "Logging in..." : "Log in"}
        </button>

        {msg && <p style={{ color: "crimson" }}>{msg}</p>}
      </form>

      <p style={{ marginTop: 12 }}>
        <Link href="/forgot-password" style={{ fontSize: 14, color: "#555" }}>
          Forgot password?
        </Link>
      </p>

      <p style={{ marginTop: 8 }}>
        No account? <Link href="/signup">Create one</Link>
      </p>
    </main>
  );
}
