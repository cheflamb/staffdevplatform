"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

const EyeIcon = ({ open }: { open: boolean }) =>
  open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );

export default function ResetPasswordPage() {
  const router = useRouter();

  const [ready, setReady]               = useState(false);
  const [password, setPassword]         = useState("");
  const [confirm, setConfirm]           = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [busy, setBusy]                 = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [invalid, setInvalid]           = useState(false);

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

  const passwordInputStyle = {
    width: "100%",
    padding: "10px 40px 10px 10px",
    border: "1px solid #ccc",
    borderRadius: 6,
    boxSizing: "border-box" as const,
  };

  const eyeBtnStyle: React.CSSProperties = {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#6b7280",
    padding: 0,
    display: "flex",
    alignItems: "center",
  };

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
          <div style={{ position: "relative", marginTop: 6 }}>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              style={passwordInputStyle}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              style={eyeBtnStyle}
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>
        </label>

        <label>
          Confirm new password
          <div style={{ position: "relative", marginTop: 6 }}>
            <input
              type={showConfirm ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              style={passwordInputStyle}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              aria-label={showConfirm ? "Hide password" : "Show password"}
              style={eyeBtnStyle}
            >
              <EyeIcon open={showConfirm} />
            </button>
          </div>
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
