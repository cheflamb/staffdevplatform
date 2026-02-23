"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "redirecting" | "error">("checking");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Session is in cookies — no token needed; middleware already verified auth.
        const res = await fetch("/api/provision", { method: "GET" });

        if (res.status === 401) {
          if (!cancelled) router.replace("/login");
          return;
        }

        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`Provision check failed (${res.status}). ${txt}`);
        }

        const json = await res.json();
        const hasCompany = Boolean(json?.hasCompany);

        if (!cancelled) {
          setStatus("redirecting");
          router.replace(hasCompany ? "/dashboard" : "/onboarding");
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setStatus("error");
          setErr(e instanceof Error ? e.message : "Unknown error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Staff Dev App</h1>

      {status !== "error" ? (
        <p style={{ marginTop: 12, opacity: 0.8 }}>
          Checking your session, hang tight…
        </p>
      ) : (
        <>
          <p style={{ marginTop: 12, color: "crimson" }}>Something went sideways.</p>
          <pre
            style={{
              marginTop: 12,
              padding: 12,
              background: "#f6f6f6",
              borderRadius: 8,
              overflowX: "auto",
            }}
          >
            {err}
          </pre>
          <p style={{ marginTop: 12, opacity: 0.8 }}>
            Try refreshing. If it repeats, your <code>/api/provision</code> check endpoint is
            probably returning a shape we didn't expect.
          </p>
        </>
      )}
    </main>
  );
}
