import Link from "next/link";
import { PLATFORM_NAME, COPYRIGHT_YEAR } from "../lib/config";

// ---------------------------------------------------------------------------
// Footer — rendered in the root layout, appears on every page.
// Update PLATFORM_NAME and COPYRIGHT_YEAR in app/lib/config.ts.
// ---------------------------------------------------------------------------
export default function Footer() {
  return (
    <footer
      style={{
        marginTop: 64,
        borderTop: "1px solid #e5e7eb",
        padding: "20px 24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 12,
        fontSize: 12,
        color: "#9ca3af",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <span>
        © {COPYRIGHT_YEAR} {PLATFORM_NAME}™. All rights reserved.
      </span>
      <nav style={{ display: "flex", gap: 20 }}>
        <Link
          href="/privacy"
          style={{ color: "#9ca3af", textDecoration: "none" }}
        >
          Privacy Policy
        </Link>
        <Link
          href="/terms"
          style={{ color: "#9ca3af", textDecoration: "none" }}
        >
          Terms of Service
        </Link>
      </nav>
    </footer>
  );
}
