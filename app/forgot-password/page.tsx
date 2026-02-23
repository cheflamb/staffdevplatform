"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "../lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail]   = useState("");
  const [busy, setBusy]     = useState(false);
  const [sent, setSent]     = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const redirectTo =
      (process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin) +
      "/auth/reset-password";

    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo }
    );

    setBusy(false);

    if (resetErr) {
      setError(resetErr.message);
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <main style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Check your email</h1>
        <p style={{ marginTop: 12, color: "#444", lineHeight: 1.6 }}>
          If <strong>{email}</strong> is registered, you&apos;ll receive a
          password-reset link shortly. The link expires in 1 hour.
        </p>
        <p style={{ marginTop: 16 }}>
          <Link href="/login">Back to log in</Link>
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Reset your password</h1>
      <p style={{ marginTop: 8, color: "#555" }}>
        Enter the email address on your account and we&apos;ll send you a reset
        link.
      </p>

      <form
        onSubmit={onSubmit}
        style={{ display: "grid", gap: 12, marginTop: 20 }}
      >
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
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
          {busy ? "Sending…" : "Send reset link"}
        </button>

        {error && <p style={{ color: "crimson" }}>{error}</p>}
      </form>

      <p style={{ marginTop: 16 }}>
        <Link href="/login">Back to log in</Link>
      </p>
    </main>
  );
}
