"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [ready, setReady]         = useState(false);
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [invalid, setInvalid]     = useState(false);

  // Supabase puts the recovery token in the URL hash.
  // getSession() exchanges it for a live session automatically.
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        // Token missing or already used — show an error state.
        setInvalid(true);
      }
      setReady(true);
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { error: updateErr } = await supabase.auth.updateUser({ password });

    if (updateErr) {
      setBusy(false);
      setError(updateErr.message);
      return;
    }

    // Password updated — send them home.
    router.replace("/dashboard");
  }

  if (!ready) {
    return (
      <main style={{ padding: 24 }}>
        <p>Verifying reset link…</p>
      </main>
    );
  }

  if (invalid) {
    return (
      <main style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Link expired</h1>
        <p style={{ marginTop: 12, color: "#444" }}>
          This password-reset link is invalid or has already been used. Please
          request a new one.
        </p>
        <p style={{ marginTop: 16 }}>
          <a href="/forgot-password">Request a new link</a>
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Set a new password</h1>
      <p style={{ marginTop: 8, color: "#555" }}>
        Choose a strong password — at least 8 characters.
      </p>

      <form
        onSubmit={onSubmit}
        style={{ display: "grid", gap: 12, marginTop: 20 }}
      >
        <label>
          New password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
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
          Confirm new password
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
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
          {busy ? "Saving…" : "Save new password"}
        </button>

        {error && <p style={{ color: "crimson" }}>{error}</p>}
      </form>
    </main>
  );
}
