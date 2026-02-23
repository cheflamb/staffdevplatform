import { createClient } from "../../lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import Link from "next/link";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type AssociateRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  hire_date: string;
  status: string;
  positions: { title: string } | null;
  departments: { name: string } | null;
  stations: { name: string } | null;
  locations: { id: string; name: string } | null;
};

type IncidentStanding = {
  verbal:       boolean;
  written:      boolean;
  separation:   boolean;
  commendations: number;
};

// ---------------------------------------------------------------------------
// Page (server component)
// ---------------------------------------------------------------------------
export default async function AssociateRosterPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("company_members")
    .select("role, company_id, location_id, locations(name, logo_url)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) redirect("/onboarding");

  const { role, company_id, location_id } = membership as {
    role: string;
    company_id: string;
    location_id: string | null;
  };

  const locationMeta = (membership.locations as { name: string; logo_url: string | null } | null);

  if (!["owner", "supervisor"].includes(role)) redirect("/dashboard");

  // ---------------------------------------------------------------------------
  // Fetch staff — owners see all locations, supervisors see their own
  // ---------------------------------------------------------------------------
  let rows: AssociateRow[] = [];

  if (role === "supervisor" && location_id) {
    const { data } = await supabase
      .from("associates")
      .select(
        "id, first_name, last_name, email, hire_date, status, positions(title), departments(name), stations(name), locations(id, name)"
      )
      .eq("location_id", location_id)
      .order("last_name");
    rows = (data ?? []) as AssociateRow[];
  } else if (role === "owner") {
    const { data: locs } = await supabase
      .from("locations")
      .select("id")
      .eq("company_id", company_id);

    const locationIds = (locs ?? []).map((l: { id: string }) => l.id);

    if (locationIds.length > 0) {
      const { data } = await supabase
        .from("associates")
        .select(
          "id, first_name, last_name, email, hire_date, status, positions(title), departments(name), stations(name), locations(id, name)"
        )
        .in("location_id", locationIds)
        .order("last_name");
      rows = (data ?? []) as AssociateRow[];
    }
  }

  // ---------------------------------------------------------------------------
  // Fetch incident standing for all staff (rolling 365-day window for discipline;
  // all-time for commendations)
  // ---------------------------------------------------------------------------
  const standingMap = new Map<string, IncidentStanding>();

  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const { data: incidents } = await supabaseAdmin
      .from("incidents")
      .select("associate_id, type, date")
      .in("associate_id", ids)
      .in("type", ["verbal", "written", "separation", "commendation"]);

    for (const inc of incidents ?? []) {
      const sid = inc.associate_id as string;
      if (!standingMap.has(sid)) {
        standingMap.set(sid, { verbal: false, written: false, separation: false, commendations: 0 });
      }
      const s = standingMap.get(sid)!;
      const withinWindow = (inc.date as string) >= cutoff;
      if (inc.type === "verbal"      && withinWindow) s.verbal      = true;
      if (inc.type === "written"     && withinWindow) s.written     = true;
      if (inc.type === "separation"  && withinWindow) s.separation  = true;
      if (inc.type === "commendation")                s.commendations++;
    }
  }

  // ---------------------------------------------------------------------------
  // Group by location for owner view
  // ---------------------------------------------------------------------------
  const byLocation = new Map<string, { name: string; rows: AssociateRow[] }>();
  if (role === "owner") {
    for (const a of rows) {
      const locId = a.locations?.id ?? "unknown";
      const locName = a.locations?.name ?? "Unknown location";
      if (!byLocation.has(locId)) byLocation.set(locId, { name: locName, rows: [] });
      byLocation.get(locId)!.rows.push(a);
    }
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------
  const th: React.CSSProperties = {
    padding: "8px 12px",
    fontWeight: 500,
    color: "#6b7280",
    fontSize: 13,
    textAlign: "left",
    borderBottom: "2px solid #e5e7eb",
  };

  const td: React.CSSProperties = {
    padding: "10px 12px",
    borderBottom: "1px solid #f3f4f6",
    fontSize: 14,
  };

  function statusBadge(status: string) {
    const colors: Record<string, { bg: string; text: string }> = {
      active:     { bg: "#d1fae5", text: "#065f46" },
      inactive:   { bg: "#f3f4f6", text: "#6b7280" },
      terminated: { bg: "#fee2e2", text: "#991b1b" },
    };
    const c = colors[status] ?? colors.inactive;
    return (
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          padding: "2px 8px",
          borderRadius: 12,
          background: c.bg,
          color: c.text,
          textTransform: "capitalize",
        }}
      >
        {status}
      </span>
    );
  }

  function StandingDots({ id }: { id: string }) {
    const s = standingMap.get(id) ?? { verbal: false, written: false, separation: false, commendations: 0 };
    // Dot: filled = stage reached within 365 days; empty = clean
    const dot = (active: boolean, activeColor: string) => (
      <span
        style={{
          display: "inline-block",
          width: 9,
          height: 9,
          borderRadius: "50%",
          backgroundColor: active ? activeColor : "#e5e7eb",
          border: active ? "none" : "1px solid #d1d5db",
          flexShrink: 0,
        }}
        title={active ? "Active within 365 days" : "Clear"}
      />
    );

    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {dot(s.verbal,     "#f59e0b")}
        {dot(s.written,    "#f97316")}
        {dot(s.separation, "#ef4444")}
        {s.commendations > 0 && (
          <span
            style={{
              marginLeft: 5,
              fontSize: 10,
              fontWeight: 700,
              color: "#16a34a",
              backgroundColor: "#dcfce7",
              padding: "1px 5px",
              borderRadius: 4,
            }}
            title={`${s.commendations} commendation${s.commendations !== 1 ? "s" : ""}`}
          >
            ★{s.commendations}
          </span>
        )}
      </span>
    );
  }

  function formatDate(iso: string) {
    return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function RosterTable({ rows }: { rows: AssociateRow[] }) {
    if (rows.length === 0) {
      return (
        <p style={{ color: "#9ca3af", padding: "12px 0" }}>
          No staff yet.
        </p>
      );
    }
    return (
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>Name</th>
            {role === "owner" && <th style={th}>Location</th>}
            <th style={th}>Dept</th>
            <th style={th}>Position</th>
            <th style={th}>Station</th>
            <th style={th}>Hire date</th>
            <th style={th}>Status</th>
            <th style={{ ...th, textAlign: "center" }} title="Verbal · Written · Separation (rolling 365 days) · ★ Commendations">Standing</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const s = standingMap.get(a.id);
            const rowTint = s?.separation ? { backgroundColor: "#fff7f7" } : {};
            return (
              <tr key={a.id} style={{ cursor: "pointer", ...rowTint }}>
                <td style={{ ...td, fontWeight: 500 }}>
                  <Link
                    href={`/dashboard/associates/${a.id}`}
                    style={{ color: "inherit", textDecoration: "none" }}
                  >
                    {a.last_name}, {a.first_name}
                  </Link>
                </td>
                {role === "owner" && (
                  <td style={{ ...td, color: "#6b7280" }}>
                    {a.locations?.name ?? "—"}
                  </td>
                )}
                <td style={{ ...td, color: "#6b7280" }}>
                  {a.departments?.name ?? "—"}
                </td>
                <td style={{ ...td, color: "#6b7280" }}>
                  {a.positions?.title ?? "—"}
                </td>
                <td style={{ ...td, color: "#6b7280" }}>
                  {a.stations?.name ?? "—"}
                </td>
                <td style={{ ...td, color: "#6b7280" }}>
                  {formatDate(a.hire_date)}
                </td>
                <td style={td}>{statusBadge(a.status)}</td>
                <td style={{ ...td, textAlign: "center" }}>
                  <StandingDots id={a.id} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <main className="page-pad" style={{ maxWidth: 1024, margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 28,
          paddingBottom: 20,
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {locationMeta?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={locationMeta.logo_url}
              alt="Location logo"
              style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 6, border: "1px solid #e5e7eb", flexShrink: 0 }}
            />
          )}
          <div>
            <Link
              href="/dashboard"
              style={{ color: "#6b7280", fontSize: 14, textDecoration: "none" }}
            >
              ← Dashboard
            </Link>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>
              Staff{rows.length > 0 ? ` (${rows.length})` : ""}
            </h1>
            {locationMeta?.name && role === "supervisor" && (
              <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 2 }}>{locationMeta.name}</p>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Standing legend */}
          <span
            style={{ fontSize: 11, color: "#9ca3af", display: "flex", alignItems: "center", gap: 5, marginRight: 8 }}
            title="Standing column: Verbal · Written · Separation (rolling 365 days)"
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#f59e0b", display: "inline-block" }} />
            <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#f97316", display: "inline-block" }} />
            <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#ef4444", display: "inline-block" }} />
            <span style={{ marginLeft: 2 }}>Standing</span>
          </span>

          <Link
            href="/dashboard/associates/new"
            style={{
              padding: "9px 16px",
              backgroundColor: "#111",
              color: "white",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            + Add Staff
          </Link>
        </div>
      </div>

      {/* Owner: grouped by location */}
      {role === "owner" && (
        <>
          {byLocation.size === 0 ? (
            <p style={{ color: "#9ca3af" }}>No staff yet.</p>
          ) : (
            Array.from(byLocation.entries()).map(([locId, { name, rows: locRows }]) => (
              <section key={locId} style={{ marginBottom: 40 }}>
                <h2
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#374151",
                    marginBottom: 12,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {name}
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 12,
                      fontWeight: 500,
                      color: "#9ca3af",
                      textTransform: "none",
                      letterSpacing: 0,
                    }}
                  >
                    {locRows.length} {locRows.length === 1 ? "staff member" : "staff members"}
                  </span>
                </h2>
                <div className="scroll-x"><RosterTable rows={locRows} /></div>
              </section>
            ))
          )}
        </>
      )}

      {/* Supervisor: flat list */}
      {role === "supervisor" && <div className="scroll-x"><RosterTable rows={rows} /></div>}
    </main>
  );
}
