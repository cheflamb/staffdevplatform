import { createClient } from "../lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import LogoutButton from "./LogoutButton";

// ---------------------------------------------------------------------------
// Types for joined Supabase query results
// ---------------------------------------------------------------------------
type CompanyRow = { name: string } | null;
type LocationRow = { id: string; name: string; logo_url: string | null } | null;

type LocationWithCount = { id: string; name: string; logo_url: string | null; associateCount: number };

type AssociateRow = {
  id: string;
  first_name: string;
  last_name: string;
  status: string;
  positions: { title: string } | null;
};

type CheckinRow = {
  id: string;
  associate_id: string;
  scheduled_date: string;
  associates: { first_name: string; last_name: string } | null;
};

type FlaggedCheckinRow = {
  id: string;
  associate_id: string;
  completed_at: string;
  flag_reasons: string[];
  associates: { first_name: string; last_name: string } | null;
  locations: { name: string } | null;
};

type AlertSettingRow = {
  flag_reason: string;
  notify_role: string;
  urgency: string;
};

type LastCheckinRow = {
  associate_id: string;
  completed_at: string;
};

type NewHireRow = {
  id: string;
  first_name: string;
  last_name: string;
  hire_date: string;
};

type OverdueCheckinRow = {
  id: string;
  associate_id: string;
  scheduled_date: string;
  type: string;
  associates: { first_name: string; last_name: string } | null;
};

// ---------------------------------------------------------------------------
// Cadence helpers (module-level — evaluated server-side on each render)
// ---------------------------------------------------------------------------
function daysSince(iso: string | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function lastCheckinLabel(days: number | null): string {
  if (days === null) return "Never";
  if (days === 0)    return "Today";
  if (days === 1)    return "Yesterday";
  return `${days}d ago`;
}

function lastCheckinColor(days: number | null): string {
  if (days === null || days >= 30) return "#ef4444"; // red  — overdue / never
  if (days >= 21)                  return "#f59e0b"; // amber — due soon
  return "#10b981";                                  // green — recent
}

function checkinTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    "30-day": "30-day review",
    "60-day": "60-day review",
    "90-day": "90-day review",
    "annual": "Annual review",
    "adhoc":  "Check-in",
  };
  return labels[type] ?? "Check-in";
}

// ---------------------------------------------------------------------------
// Page (server component — data fetched before render, no loading states)
// ---------------------------------------------------------------------------
export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Membership row — role, company, location
  const { data: membership } = await supabase
    .from("company_members")
    .select("role, company_id, location_id, companies(name), locations(id, name, logo_url)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/onboarding");

  const role = membership.role as "owner" | "supervisor" | "associate";
  const companyId: string = membership.company_id;
  const locationId: string | null = membership.location_id ?? null;
  const companyName = (membership.companies as unknown as CompanyRow)?.name ?? "";
  const locationName   = (membership.locations as unknown as LocationRow)?.name    ?? null;
  const locationLogo   = (membership.locations as unknown as LocationRow)?.logo_url ?? null;

  // Profile display name
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const rawName = profile?.full_name?.trim() || user.email?.split("@")[0] || "";
  const displayName = rawName
    ? rawName.split(/\s+/)[0].charAt(0).toUpperCase() + rawName.split(/\s+/)[0].slice(1)
    : "there";

  // ---------------------------------------------------------------------------
  // Role-specific data fetching
  // ---------------------------------------------------------------------------
  let locations: LocationWithCount[] = [];
  let associates: AssociateRow[] = [];
  let upcomingCheckins: CheckinRow[] = [];
  let flaggedCheckins: FlaggedCheckinRow[] = [];
  let alertSettings: AlertSettingRow[] = [];
  let lastCheckinMap = new Map<string, string>(); // associateId → completed_at ISO
  let overdueCheckins: OverdueCheckinRow[] = [];
  let newHires: NewHireRow[] = [];
  let completedMilestoneKeys = new Set<string>(); // "assocId-dayTarget"

  if (role === "owner") {
    const { data: locs } = await supabase
      .from("locations")
      .select("id, name, logo_url")
      .eq("company_id", companyId)
      .order("name");

    if (locs) {
      const locationIds = locs.map((l) => l.id);

      [locations] = await Promise.all([
        Promise.all(
          locs.map(async (loc) => {
            const { count } = await supabase
              .from("associates")
              .select("id", { count: "exact", head: true })
              .eq("location_id", loc.id)
              .eq("status", "active");
            return { ...loc, logo_url: loc.logo_url ?? null, associateCount: count ?? 0 };
          })
        ),
      ]);

      // Alert settings (needed to filter which flags owners should see)
      const { data: alertData } = await supabase
        .from("alert_settings")
        .select("flag_reason, notify_role, urgency")
        .eq("company_id", companyId);
      alertSettings = (alertData ?? []) as unknown as AlertSettingRow[];

      if (locationIds.length > 0) {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
        const { data: flagged } = await supabase
          .from("check_ins")
          .select("id, associate_id, completed_at, flag_reasons, associates(first_name, last_name), locations(name)")
          .in("location_id", locationIds)
          .eq("flagged", true)
          .is("reviewed_at", null)
          .gte("completed_at", thirtyDaysAgo)
          .order("completed_at", { ascending: false })
          .limit(20);

        // Only show check-ins whose flag_reasons include a reason the owner is configured to receive
        const ownerReasons = new Set(
          alertSettings
            .filter((s) => ["owner", "both"].includes(s.notify_role))
            .map((s) => s.flag_reason)
        );
        flaggedCheckins = ((flagged ?? []) as unknown as FlaggedCheckinRow[]).filter((c) =>
          c.flag_reasons.some((r) => ownerReasons.size === 0 || ownerReasons.has(r))
        );
      }
    }
  } else if (role === "supervisor" && locationId) {
    const { data: assocs } = await supabase
      .from("associates")
      .select("id, first_name, last_name, status, positions(title)")
      .eq("location_id", locationId)
      .eq("status", "active")
      .order("last_name");

    associates = (assocs as unknown as AssociateRow[]) ?? [];

    const today = new Date().toISOString().split("T")[0];
    const nextWeek = new Date(Date.now() + 7 * 86_400_000)
      .toISOString()
      .split("T")[0];

    const { data: checkins } = await supabase
      .from("check_ins")
      .select("id, associate_id, scheduled_date, associates(first_name, last_name)")
      .eq("location_id", locationId)
      .eq("status", "scheduled")
      .gte("scheduled_date", today)
      .lte("scheduled_date", nextWeek)
      .order("scheduled_date");

    upcomingCheckins = (checkins as unknown as CheckinRow[]) ?? [];

    // Alert settings — which flags should supervisors see?
    const { data: alertData } = await supabase
      .from("alert_settings")
      .select("flag_reason, notify_role, urgency")
      .eq("company_id", companyId);
    alertSettings = (alertData ?? []) as unknown as AlertSettingRow[];

    const supervisorReasons = new Set(
      alertSettings
        .filter((s) => ["supervisor", "both"].includes(s.notify_role))
        .map((s) => s.flag_reason)
    );

    if (supervisorReasons.size > 0) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data: flagged } = await supabase
        .from("check_ins")
        .select("id, associate_id, completed_at, flag_reasons, associates(first_name, last_name), locations(name)")
        .eq("location_id", locationId)
        .eq("flagged", true)
        .is("reviewed_at", null)
        .gte("completed_at", thirtyDaysAgo)
        .order("completed_at", { ascending: false })
        .limit(20);
      flaggedCheckins = ((flagged ?? []) as unknown as FlaggedCheckinRow[]).filter((c) =>
        c.flag_reasons.some((r) => supervisorReasons.has(r))
      );
    }

    // Last completed check-in per associate (for cadence column)
    const { data: checkinHist } = await supabase
      .from("check_ins")
      .select("associate_id, completed_at")
      .eq("location_id", locationId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false });

    for (const row of (checkinHist ?? []) as unknown as LastCheckinRow[]) {
      if (!lastCheckinMap.has(row.associate_id)) {
        lastCheckinMap.set(row.associate_id, row.completed_at);
      }
    }

    // Past-due scheduled check-ins (status=scheduled, scheduled_date < today)
    const { data: overdueData } = await supabase
      .from("check_ins")
      .select("id, associate_id, scheduled_date, type, associates(first_name, last_name)")
      .eq("location_id", locationId)
      .eq("status", "scheduled")
      .lt("scheduled_date", today)
      .order("scheduled_date");

    overdueCheckins = (overdueData ?? []) as unknown as OverdueCheckinRow[];

    // New hires in first 95 days — 90-day milestone tracking
    const ninetyFiveDaysAgo = new Date(Date.now() - 95 * 86_400_000)
      .toISOString()
      .split("T")[0];

    const { data: nhData } = await supabase
      .from("associates")
      .select("id, first_name, last_name, hire_date")
      .eq("location_id", locationId)
      .eq("status", "active")
      .gte("hire_date", ninetyFiveDaysAgo)
      .order("hire_date");

    newHires = (nhData ?? []) as unknown as NewHireRow[];

    if (newHires.length > 0) {
      const nhIds = newHires.map((a) => a.id);
      const { data: planData } = await supabase
        .from("ninety_day_plans")
        .select("associate_id, ninety_day_completions(status, ninety_day_milestones(day_target))")
        .in("associate_id", nhIds);

      for (const p of planData ?? []) {
        const comps = (p.ninety_day_completions ?? []) as unknown as Array<{
          status: string;
          ninety_day_milestones: { day_target: number } | null;
        }>;
        for (const c of comps) {
          if (c.status === "completed" && c.ninety_day_milestones) {
            completedMilestoneKeys.add(`${p.associate_id}-${c.ninety_day_milestones.day_target}`);
          }
        }
      }
    }

  } else if (role === "associate") {
    // Associates have their own dedicated portal — redirect immediately
    redirect("/dashboard/associate");
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <main className="page-pad" style={{ maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 32,
          paddingBottom: 20,
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {locationLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={locationLogo}
              alt="Location logo"
              style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 6, border: "1px solid #e5e7eb", flexShrink: 0 }}
            />
          )}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1 style={{ fontSize: 26, fontWeight: 700 }}>
                Welcome back, {displayName}
              </h1>
              {(() => {
                const labelMap: Record<string, { label: string; bg: string; color: string }> = {
                  owner:      { label: "Owner",  bg: "#111827", color: "#fff" },
                  supervisor: { label: "GM",     bg: "#1d4ed8", color: "#fff" },
                  associate:  { label: "Staff",  bg: "#6b7280", color: "#fff" },
                };
                const badge = labelMap[role] ?? { label: role, bg: "#6b7280", color: "#fff" };
                return (
                  <span style={{
                    display: "inline-block",
                    padding: "2px 10px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    backgroundColor: badge.bg,
                    color: badge.color,
                    flexShrink: 0,
                  }}>
                    {badge.label}
                  </span>
                );
              })()}
            </div>
            <p style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>
              {companyName}
              {locationName ? ` · ${locationName}` : ""}
            </p>
          </div>
        </div>
        <LogoutButton />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Owner view                                                          */}
      {/* ------------------------------------------------------------------ */}
      {role === "owner" && (
        <>
        <section>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 600 }}>
              Locations ({locations.length})
            </h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {locations.length > 0 && (
                <Link
                  href="/dashboard/analytics"
                  style={{
                    padding: "8px 14px",
                    backgroundColor: "white",
                    color: "#111",
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  Team Health
                </Link>
              )}
              {locations.length > 0 && (
                <Link
                  href="/dashboard/associates"
                  style={{
                    padding: "8px 14px",
                    backgroundColor: "white",
                    color: "#111",
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  View roster
                </Link>
              )}
              {locations.length > 0 && (
                <Link
                  href="/dashboard/associates/new"
                  style={{
                    padding: "8px 14px",
                    backgroundColor: "white",
                    color: "#111",
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  + Add Staff
                </Link>
              )}
              <Link
                href="/dashboard/locations/new"
                style={{
                  padding: "8px 14px",
                  backgroundColor: "#111",
                  color: "white",
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                + Add Location
              </Link>
            </div>
          </div>

          {locations.length === 0 ? (
            <p style={{ color: "#9ca3af" }}>
              No locations yet — add your first one to start managing your team.
            </p>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              }}
            >
              {locations.map((loc) => (
                <Link
                  key={loc.id}
                  href={`/dashboard/locations/${loc.id}/edit`}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 16,
                    background: "#fff",
                    textDecoration: "none",
                    color: "inherit",
                    display: "block",
                  }}
                >
                  {loc.logo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={loc.logo_url}
                      alt={`${loc.name} logo`}
                      style={{ width: 48, height: 48, objectFit: "contain", marginBottom: 10, borderRadius: 4 }}
                    />
                  )}
                  <p style={{ fontWeight: 600 }}>{loc.name}</p>
                  <p style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>
                    {loc.associateCount} active{" "}
                    {loc.associateCount === 1 ? "associate" : "associates"}
                  </p>
                  <p style={{ color: "#9ca3af", marginTop: 6, fontSize: 12 }}>
                    Click to edit
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Needs attention — flagged check-ins (last 30 days) */}
        {flaggedCheckins.length > 0 && (
          <section style={{ marginTop: 36 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10, marginBottom: 14,
              justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                  backgroundColor: "#f59e0b", flexShrink: 0,
                }} />
                <h2 style={{ fontSize: 18, fontWeight: 600 }}>
                  Needs attention
                </h2>
                <span style={{ fontSize: 13, color: "#9ca3af" }}>last 30 days</span>
              </div>
              <Link
                href="/dashboard/settings/alerts"
                style={{ fontSize: 12, color: "#6b7280", textDecoration: "none" }}
              >
                Alert settings →
              </Link>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {flaggedCheckins.map((c) => {
                const REASON_LABELS: Record<string, string> = {
                  discriminatory_language: "discriminatory language",
                  concern_keywords:        "language of concern",
                  concern_tags:            "stress or friction tagged",
                  low_scores:              "low meeting value",
                };
                const urgent = c.flag_reasons.some((r) =>
                  alertSettings.some((s) => s.flag_reason === r && s.urgency === "immediate")
                );
                const labels = c.flag_reasons
                  .map((r) => REASON_LABELS[r] ?? r)
                  .join(" · ");
                return (
                  <Link
                    key={c.id}
                    href={`/dashboard/checkins/${c.id}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px 16px",
                      borderRadius: 8,
                      border:           urgent ? "1px solid #fca5a5" : "1px solid #fde68a",
                      backgroundColor:  urgent ? "#fff5f5"           : "#fffbeb",
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {urgent && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                            padding: "1px 6px", borderRadius: 4,
                            background: "#fee2e2", color: "#991b1b",
                          }}>
                            URGENT
                          </span>
                        )}
                        <span style={{ fontWeight: 600, fontSize: 14 }}>
                          {c.associates
                            ? `${c.associates.first_name} ${c.associates.last_name}`
                            : "—"}
                        </span>
                        {c.locations?.name && (
                          <span style={{ color: "#6b7280", fontSize: 13 }}>
                            {c.locations.name}
                          </span>
                        )}
                      </div>
                      {labels && (
                        <p style={{ fontSize: 12, color: urgent ? "#991b1b" : "#92400e", marginTop: 2 }}>
                          {labels}
                        </p>
                      )}
                    </div>
                    <span style={{ fontSize: 12, color: "#9ca3af", flexShrink: 0, marginLeft: 12 }}>
                      {new Date(c.completed_at).toLocaleDateString(undefined, {
                        month: "short", day: "numeric",
                      })}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Supervisor view                                                     */}
      {/* ------------------------------------------------------------------ */}
      {role === "supervisor" && (
        <>
          <section style={{ marginBottom: 36 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600 }}>
                Your team ({associates.length})
              </h2>
              <div style={{ display: "flex", gap: 8 }}>
                <Link
                  href="/dashboard/associates"
                  style={{
                    padding: "8px 14px",
                    backgroundColor: "white",
                    color: "#111",
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  View roster
                </Link>
                <Link
                  href="/dashboard/associates/new"
                  style={{
                    padding: "8px 14px",
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

            {associates.length === 0 ? (
              <p style={{ color: "#9ca3af" }}>
                No active associates at this location yet.
              </p>
            ) : (
              <div className="scroll-x">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr
                    style={{
                      textAlign: "left",
                      borderBottom: "2px solid #e5e7eb",
                      color: "#6b7280",
                      fontSize: 13,
                    }}
                  >
                    <th style={{ padding: "8px 12px", fontWeight: 500 }}>
                      Name
                    </th>
                    <th style={{ padding: "8px 12px", fontWeight: 500 }}>
                      Position
                    </th>
                    <th style={{ padding: "8px 12px", fontWeight: 500 }}>
                      Last check-in
                    </th>
                    <th style={{ padding: "8px 12px", fontWeight: 500 }} />
                  </tr>
                </thead>
                <tbody>
                  {associates.map((a) => (
                    <tr
                      key={a.id}
                      style={{ borderBottom: "1px solid #f3f4f6" }}
                    >
                      <td style={{ padding: "10px 12px", fontWeight: 500 }}>
                        <Link
                          href={`/dashboard/associates/${a.id}`}
                          style={{ color: "inherit", textDecoration: "none" }}
                        >
                          {a.first_name} {a.last_name}
                        </Link>
                      </td>
                      <td style={{ padding: "10px 12px", color: "#6b7280" }}>
                        {a.positions?.title ?? "—"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {(() => {
                          const days = daysSince(lastCheckinMap.get(a.id));
                          return (
                            <span style={{ fontSize: 13, fontWeight: 500, color: lastCheckinColor(days) }}>
                              {lastCheckinLabel(days)}
                            </span>
                          );
                        })()}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>
                        <Link
                          href={`/dashboard/checkins/new?associateId=${a.id}`}
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            padding: "4px 10px",
                            borderRadius: 5,
                            backgroundColor: "#111",
                            color: "white",
                            textDecoration: "none",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Check-In
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </section>

          {/* 90-Day new-hire milestones */}
          {newHires.length > 0 && (() => {
            const today = Date.now();
            const items = newHires
              .map((a) => {
                const hireMs  = new Date(a.hire_date + "T00:00:00").getTime();
                const daysIn  = Math.floor((today - hireMs) / 86_400_000);
                // Find the most urgent incomplete key milestone (30, 60, 90)
                const next = [30, 60, 90]
                  .map((d) => ({
                    day: d,
                    daysFromNow: d - daysIn,
                    done: completedMilestoneKeys.has(`${a.id}-${d}`),
                  }))
                  .filter((m) => !m.done && m.daysFromNow > -60)
                  .sort((x, y) => x.daysFromNow - y.daysFromNow)[0];
                return next ? { ...a, daysIn, next } : null;
              })
              .filter(Boolean) as (NewHireRow & { daysIn: number; next: { day: number; daysFromNow: number } })[];

            if (!items.length) return null;

            return (
              <section style={{ marginBottom: 36 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <span style={{
                    display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                    backgroundColor: "#8b5cf6", flexShrink: 0,
                  }} />
                  <h2 style={{ fontSize: 18, fontWeight: 600 }}>90-Day Milestones</h2>
                  <span style={{ fontSize: 13, color: "#9ca3af" }}>new hires</span>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {items.map((a) => {
                    const overdue    = a.next.daysFromNow < 0;
                    const dueSoon    = !overdue && a.next.daysFromNow <= 7;
                    const borderColor = overdue ? "#fca5a5" : dueSoon ? "#fde68a" : "#e5e7eb";
                    const bgColor     = overdue ? "#fff5f5" : dueSoon ? "#fffbeb" : "white";
                    return (
                      <Link
                        key={a.id}
                        href={`/dashboard/milestones/${a.id}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "12px 16px",
                          borderRadius: 8,
                          border: `1px solid ${borderColor}`,
                          backgroundColor: bgColor,
                          textDecoration: "none",
                          color: "inherit",
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 600, fontSize: 14 }}>
                            {a.first_name} {a.last_name}
                          </span>
                          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                            Day {a.daysIn} of 90
                            {" · "}
                            <span style={{ fontWeight: 600, color: overdue ? "#991b1b" : dueSoon ? "#92400e" : "#6b7280" }}>
                              {a.next.day}-day review{" "}
                              {overdue
                                ? `overdue by ${Math.abs(a.next.daysFromNow)} day${Math.abs(a.next.daysFromNow) === 1 ? "" : "s"}`
                                : a.next.daysFromNow === 0
                                ? "due today"
                                : `in ${a.next.daysFromNow} day${a.next.daysFromNow === 1 ? "" : "s"}`}
                            </span>
                          </p>
                        </div>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, flexShrink: 0, marginLeft: 10,
                          background: overdue ? "#fee2e2" : dueSoon ? "#fef3c7" : "#f3f4f6",
                          color:      overdue ? "#991b1b" : dueSoon ? "#92400e" : "#6b7280",
                        }}>
                          {overdue ? "Overdue" : dueSoon ? "Due soon" : "Upcoming"}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })()}

          {/* Due for check-in — past-due scheduled milestones */}
          {overdueCheckins.length > 0 && (
            <section style={{ marginBottom: 36 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={{
                  display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                  backgroundColor: "#ef4444", flexShrink: 0,
                }} />
                <h2 style={{ fontSize: 18, fontWeight: 600 }}>Due for check-in</h2>
                <span style={{ fontSize: 13, color: "#9ca3af" }}>scheduled date passed</span>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {overdueCheckins.map((c) => {
                  const scheduledDate = new Date(c.scheduled_date + "T00:00:00");
                  const daysLate = Math.floor(
                    (Date.now() - scheduledDate.getTime()) / 86_400_000
                  );
                  return (
                    <div
                      key={c.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "12px 16px",
                        borderRadius: 8,
                        border: "1px solid #fca5a5",
                        backgroundColor: "#fff5f5",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontWeight: 600, fontSize: 14 }}>
                            {c.associates
                              ? `${c.associates.first_name} ${c.associates.last_name}`
                              : "—"}
                          </span>
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: "1px 7px",
                            borderRadius: 10, background: "#fee2e2", color: "#991b1b",
                          }}>
                            {checkinTypeLabel(c.type)}
                          </span>
                        </div>
                        <p style={{ fontSize: 12, color: "#991b1b", marginTop: 3 }}>
                          {daysLate === 0
                            ? "Due today"
                            : `${daysLate} day${daysLate === 1 ? "" : "s"} overdue · scheduled ${scheduledDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                        </p>
                      </div>
                      <Link
                        href={`/dashboard/checkins/new?associateId=${c.associate_id}`}
                        style={{
                          fontSize: 12, fontWeight: 600, padding: "5px 12px",
                          borderRadius: 5, backgroundColor: "#111", color: "white",
                          textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
                        }}
                      >
                        Start now
                      </Link>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {upcomingCheckins.length > 0 && (
            <section>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
                Check-ins this week
              </h2>
              <div style={{ display: "grid", gap: 8 }}>
                {upcomingCheckins.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      padding: "10px 14px",
                      background: "#f9fafb",
                      borderRadius: 6,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 500 }}>
                        {c.associates
                          ? `${c.associates.first_name} ${c.associates.last_name}`
                          : "—"}
                      </span>
                      <span style={{ color: "#6b7280", fontSize: 13, marginLeft: 10 }}>
                        {new Date(c.scheduled_date + "T00:00:00").toLocaleDateString(
                          undefined,
                          { weekday: "short", month: "short", day: "numeric" }
                        )}
                      </span>
                    </div>
                    <Link
                      href={`/dashboard/checkins/new?associateId=${c.associate_id}`}
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "4px 10px",
                        borderRadius: 5,
                        backgroundColor: "#111",
                        color: "white",
                        textDecoration: "none",
                      }}
                    >
                      Start
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}

          {upcomingCheckins.length === 0 && associates.length > 0 && (
            <section>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                Check-ins this week
              </h2>
              <p style={{ color: "#9ca3af" }}>None scheduled.</p>
            </section>
          )}

          {/* Flagged check-ins the supervisor needs to act on */}
          {flaggedCheckins.length > 0 && (
            <section style={{ marginTop: 36 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={{
                  display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                  backgroundColor: "#ef4444", flexShrink: 0,
                }} />
                <h2 style={{ fontSize: 18, fontWeight: 600 }}>Needs follow-up</h2>
                <span style={{ fontSize: 13, color: "#9ca3af" }}>last 30 days</span>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {flaggedCheckins.map((c) => {
                  const REASON_LABELS: Record<string, string> = {
                    discriminatory_language: "discriminatory language",
                    concern_keywords:        "language of concern",
                    concern_tags:            "stress or friction tagged",
                    low_scores:              "low meeting value",
                  };
                  const urgent = c.flag_reasons.some((r) =>
                    alertSettings.some((s) => s.flag_reason === r && s.urgency === "immediate")
                  );
                  const labels = c.flag_reasons
                    .map((r) => REASON_LABELS[r] ?? r)
                    .join(" · ");
                  return (
                    <Link
                      key={c.id}
                      href={`/dashboard/checkins/${c.id}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "12px 16px",
                        borderRadius: 8,
                        border:          urgent ? "1px solid #fca5a5" : "1px solid #fde68a",
                        backgroundColor: urgent ? "#fff5f5"           : "#fffbeb",
                        textDecoration: "none",
                        color: "inherit",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {urgent && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                              padding: "1px 6px", borderRadius: 4,
                              background: "#fee2e2", color: "#991b1b",
                            }}>
                              URGENT
                            </span>
                          )}
                          <span style={{ fontWeight: 600, fontSize: 14 }}>
                            {c.associates
                              ? `${c.associates.first_name} ${c.associates.last_name}`
                              : "—"}
                          </span>
                        </div>
                        {labels && (
                          <p style={{ fontSize: 12, color: urgent ? "#991b1b" : "#92400e", marginTop: 2 }}>
                            {labels}
                          </p>
                        )}
                      </div>
                      <span style={{ fontSize: 12, color: "#9ca3af", flexShrink: 0, marginLeft: 12 }}>
                        {new Date(c.completed_at).toLocaleDateString(undefined, {
                          month: "short", day: "numeric",
                        })}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      {/* Associates are redirected to /dashboard/associate at data-load time */}
    </main>
  );
}
