"use client";

export default function OfflinePage() {
  return (
    <main
      style={{
        padding: "80px 24px",
        maxWidth: 480,
        margin: "0 auto",
        textAlign: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <p style={{ fontSize: 48, marginBottom: 16 }}>📡</p>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
        You&apos;re offline
      </h1>
      <p style={{ color: "#6b7280", fontSize: 15, lineHeight: 1.6, marginBottom: 28 }}>
        No internet connection detected. Check your connection and try again.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: "10px 28px",
          backgroundColor: "#111827",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </main>
  );
}
