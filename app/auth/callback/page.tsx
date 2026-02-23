"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../lib/supabase/client";

export default function AuthCallback() {
  const router = useRouter();
  const [authError, setAuthError] = useState<{ code: string; description: string } | null>(null);

  useEffect(() => {
    // Parse the URL hash for Supabase error params before touching the session.
    // Supabase appends errors to the fragment, e.g.:
    //   #error=access_denied&error_code=otp_expired&error_description=...
    const hash = window.location.hash.slice(1); // strip leading #
    if (hash) {
      const params = new URLSearchParams(hash);
      const errorCode = params.get("error_code");
      const errorDesc = params.get("error_description");
      if (errorCode) {
        setAuthError({
          code:        errorCode,
          description: errorDesc ? decodeURIComponent(errorDesc.replace(/\+/g, " ")) : errorCode,
        });
        return; // do not attempt to hydrate a broken session
      }
    }

    (async () => {
      const supabase = createClient();
      // Hydrates the session from the URL hash (invite token, email confirmation).
      await supabase.auth.getSession();

      // Check whether this user already belongs to a company.
      // Invited associates: trigger has already created their company_members row
      //   → hasCompany = true → go straight to dashboard.
      // New owner signups: no company yet → go to onboarding.
      const res = await fetch("/api/provision", { method: "GET" });
      const json = await res.json() as { hasCompany?: boolean };
      router.replace(json.hasCompany ? "/dashboard" : "/onboarding");
    })();
  }, [router]);

  // ---------------------------------------------------------------------------
  // Error state — expired link, revoked token, etc.
  // ---------------------------------------------------------------------------
  if (authError) {
    const isExpired = authError.code === "otp_expired";
    return (
      <main style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>
          {isExpired ? "Link expired" : "Sign-in failed"}
        </h1>
        <p style={{ marginTop: 12, color: "#444", lineHeight: 1.6 }}>
          {isExpired
            ? "This invite or sign-in link has expired. Invite links are valid for 24 hours."
            : authError.description}
        </p>
        {isExpired && (
          <p style={{ marginTop: 8, color: "#555", lineHeight: 1.6 }}>
            Ask your manager to resend your invite from your associate profile page.
          </p>
        )}
        <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
          <Link
            href="/login"
            style={{
              padding: "10px 20px", backgroundColor: "#111", color: "white",
              borderRadius: 6, fontSize: 14, fontWeight: 600, textDecoration: "none",
            }}
          >
            Go to login
          </Link>
          <Link
            href="/forgot-password"
            style={{
              padding: "10px 20px", backgroundColor: "white", color: "#111",
              border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14,
              fontWeight: 600, textDecoration: "none",
            }}
          >
            Reset password
          </Link>
        </div>
      </main>
    );
  }

  // Loading state — session is being hydrated
  return (
    <main style={{ padding: 24 }}>
      <h1>Finishing sign-in…</h1>
      <p>Just a moment.</p>
    </main>
  );
}
