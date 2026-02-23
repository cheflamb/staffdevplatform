import { createClient as createServerSupabase } from "../../lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Admin client — service-role, bypasses RLS; only used after auth is confirmed
// ---------------------------------------------------------------------------
const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type LocationRow = { id: string; name: string };

type CheckinAnalyticsRow = {
  location_id: string;
  status: string;
  scheduled_date: string;
  completed_at: string | null;
  flagged: boolean;
  flag_reasons: string[];
};

type SelfAssessmentRow = {
  talk_ratio_score:               number | null;
  listening_score:                number | null;
  question_quality_score:         number | null;
  emotional_acknowledgement_score: number | null;
  paraphrasing_score:             number | null;
  coaching_score:                 number | null;
  distraction_score:              number | null;
  next_step_score:                number | null;
  value_score:                    number | null;
  check_ins: { location_id: string; completed_at: string } | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const FLAG_LABELS: Record<string, string> = {
  low_scores:              "Low meeting value",
  concern_keywords:        "Keyword concern",
  concern_tags:            "Tagged concern",
  discriminatory_language: "Discriminatory language",
};
const FLAG_REASONS = Object.keys(FLAG_LABELS);

const SCORE_FIELDS: { key: keyof SelfAssessmentRow; label: string }[] = [
  { key: "talk_ratio_score",                label: "Talk ratio" },
  { key: "listening_score",                 label: "Listening" },
  { key: "question_quality_score",          label: "Question quality" },
  { key: "emotional_acknowledgement_score", label: "Emotional acknowledgement" },
  { key: "paraphrasing_score",              label: "Paraphrasing" },
  { key: "coaching_score",                  label: "Coaching focus" },
  { key: "distraction_score",               label: "Focus / minimised distractions" },
  { key: "next_step_score",                 label: "Next steps defined" },
  { key: "value_score",                     label: "Meeting value" },
];

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function scoreColor(v: number | null): string {
  if (v === null) return "#9ca3af";
  if (v >= 4.0) return "#16a34a";
  if (v >= 2.5) return "#d97706";
  return "#dc2626";
}

function completionColor(rate: number): string {
  if (rate >= 80) return "#16a34a";
  if (rate >= 60) return "#d97706";
  return "#dc2626";
}

function trendArrow(prev: number, curr: number): { symbol: string; color: string } {
  if (curr > prev + 0.5) return { symbol: "↑", color: "#dc2626" }; // more flags = worse
  if (curr < prev - 0.5) return { symbol: "↓", color: "#16a34a" }; // fewer flags = better
  return { symbol: "→", color: "#9ca3af" };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function AnalyticsPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: member } = await supabaseAdmin
    .from("company_members")
    .select("role, company_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || member.role !== "owner") redirect("/dashboard");

  const companyId: string = member.company_id;

  // ── Step 1: locations ──────────────────────────────────────────────────────
  const { data: locationData } = await supabaseAdmin
    .from("locations")
    .select("id, name")
    .eq("company_id", companyId)
    .order("name");

  const locations: LocationRow[] = (locationData ?? []) as LocationRow[];
  const locationIds = locations.map((l) => l.id);
  const locationNameMap = new Map(locations.map((l) => [l.id, l.name]));

  // ── Step 2: check-in rows, last 90 days ───────────────────────────────────
  const today          = new Date().toISOString().split("T")[0];
  const ninetyDaysAgo  = new Date(Date.now() - 90  * 86_400_000).toISOString().split("T")[0];
  const thirtyDaysAgo  = new Date(Date.now() - 30  * 86_400_000).toISOString().split("T")[0];
  const sixtyDaysAgo   = new Date(Date.now() - 60  * 86_400_000).toISOString().split("T")[0];

  let checkinRows: CheckinAnalyticsRow[] = [];
  if (locationIds.length > 0) {
    const { data: ciData } = await supabaseAdmin
      .from("check_ins")
      .select("location_id, status, scheduled_date, completed_at, flagged, flag_reasons")
      .in("location_id", locationIds)
      .gte("scheduled_date", ninetyDaysAgo)
      .lte("scheduled_date", today);
    checkinRows = (ciData ?? []) as CheckinAnalyticsRow[];
  }

  // ── Step 3: self-assessments, last 90 days ────────────────────────────────
  let assessmentRows: SelfAssessmentRow[] = [];
  if (locationIds.length > 0) {
    const { data: saData } = await supabaseAdmin
      .from("self_assessments")
      .select(
        "talk_ratio_score, listening_score, question_quality_score, " +
        "emotional_acknowledgement_score, paraphrasing_score, coaching_score, " +
        "distraction_score, next_step_score, value_score, " +
        "check_ins!inner(location_id, completed_at)"
      )
      .gte("check_ins.completed_at", new Date(Date.now() - 90 * 86_400_000).toISOString());
    assessmentRows = (saData ?? []) as SelfAssessmentRow[];
    // Filter to this company's locations (the join doesn't filter by location_id directly)
    assessmentRows = assessmentRows.filter((r) =>
      r.check_ins && locationIds.includes(r.check_ins.location_id)
    );
  }

  // ── Compute: completion by location (last 30 days) ─────────────────────────
  type CompletionStat = { total: number; completed: number; overdue: number; rate: number };
  const completionByLocation = new Map<string, CompletionStat>();
  for (const loc of locations) {
    completionByLocation.set(loc.id, { total: 0, completed: 0, overdue: 0, rate: 0 });
  }
  for (const row of checkinRows) {
    if (row.scheduled_date < thirtyDaysAgo) continue; // only last 30 days
    const stat = completionByLocation.get(row.location_id);
    if (!stat) continue;
    stat.total++;
    if (row.status === "completed") stat.completed++;
    if (row.status === "scheduled") stat.overdue++; // past-due unfinished
  }
  for (const stat of completionByLocation.values()) {
    stat.rate = stat.total > 0 ? Math.round((stat.completed / stat.total) * 100) : 0;
  }

  // ── Compute: flag trend (3 × 30-day buckets) ──────────────────────────────
  // bucket index: 0 = 61-90d ago, 1 = 31-60d ago, 2 = last 30d
  type FlagBuckets = [number, number, number];
  const flagTotals: FlagBuckets = [0, 0, 0];
  const flagByReason = new Map<string, FlagBuckets>(
    FLAG_REASONS.map((r) => [r, [0, 0, 0]])
  );

  const flaggedRows = checkinRows.filter((r) => r.flagged && r.flag_reasons?.length > 0);
  for (const row of flaggedRows) {
    const d = row.scheduled_date;
    const bucket: number = d < sixtyDaysAgo ? 0 : d < thirtyDaysAgo ? 1 : 2;
    flagTotals[bucket]++;
    for (const reason of row.flag_reasons) {
      const buckets = flagByReason.get(reason);
      if (buckets) buckets[bucket]++;
    }
  }
  const hasAnyFlags = flagTotals.some((n) => n > 0);

  // ── Compute: score averages per location ──────────────────────────────────
  type LocationScores = {
    name: string;
    count: number;
    scores: Record<string, number | null>;
  };
  const scoresByLocation = new Map<string, { name: string; vals: Record<string, number[]> }>();
  for (const loc of locations) {
    scoresByLocation.set(loc.id, {
      name: loc.name,
      vals: Object.fromEntries(SCORE_FIELDS.map((f) => [f.key, []])),
    });
  }
  for (const row of assessmentRows) {
    if (!row.check_ins) continue;
    const entry = scoresByLocation.get(row.check_ins.location_id);
    if (!entry) continue;
    for (const { key } of SCORE_FIELDS) {
      const v = row[key] as number | null;
      if (v !== null) entry.vals[key as string].push(v);
    }
  }
  const locationScores: LocationScores[] = locations.map((loc) => {
    const entry = scoresByLocation.get(loc.id)!;
    const count = Math.max(...SCORE_FIELDS.map((f) => entry.vals[f.key as string].length), 0);
    return {
      name: loc.name,
      count,
      scores: Object.fromEntries(
        SCORE_FIELDS.map((f) => [f.key, avg(entry.vals[f.key as string])])
      ),
    };
  }).filter((ls) => ls.count > 0);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main
      style={{
        padding: "40px 24px",
        maxWidth: 860,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#111827",
      }}
    >
      {/* ── Back link ── */}
      <Link
        href="/dashboard"
        style={{ fontSize: 14, color: "#6b7280", textDecoration: "none" }}
      >
        ← Dashboard
      </Link>

      {/* ── Page header ── */}
      <div style={{ marginTop: 20, marginBottom: 36, paddingBottom: 20, borderBottom: "1px solid #e5e7eb" }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Team Health</h1>
        <p style={{ fontSize: 14, color: "#6b7280", marginTop: 4, marginBottom: 0 }}>
          Last 90 days · {locations.length} location{locations.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1 — Check-in Completion by Location (last 30 days)
      ════════════════════════════════════════════════════════════════════════ */}
      <SectionCard
        title="Check-in Completion"
        subtitle="Last 30 days — of scheduled check-ins, how many were completed"
      >
        {locations.length === 0 ? (
          <EmptyState text="No locations found." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {locations.map((loc) => {
              const stat = completionByLocation.get(loc.id)!;
              const color = stat.total === 0 ? "#9ca3af" : completionColor(stat.rate);
              return (
                <div key={loc.id}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{loc.name}</span>
                    {stat.total === 0 ? (
                      <span style={{ fontSize: 13, color: "#9ca3af" }}>No check-ins scheduled</span>
                    ) : (
                      <span style={{ fontSize: 13, color: "#6b7280" }}>
                        <span style={{ fontWeight: 600, color }}>{stat.completed}</span>
                        {" / "}{stat.total} completed
                        {stat.overdue > 0 && (
                          <span style={{ color: "#dc2626", marginLeft: 6 }}>
                            · {stat.overdue} overdue
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  {/* Progress bar */}
                  <div
                    style={{
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: "#f3f4f6",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: stat.total === 0 ? "0%" : `${stat.rate}%`,
                        backgroundColor: color,
                        borderRadius: 4,
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 3 }}>
                    <span style={{ fontSize: 11, color: "#9ca3af" }}>
                      {stat.total === 0 ? "—" : `${stat.rate}%`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 2 — Flag Trend
      ════════════════════════════════════════════════════════════════════════ */}
      {hasAnyFlags && (
        <SectionCard
          title="Flags Raised"
          subtitle="Trend across three 30-day periods — fewer flags over time is the goal"
        >
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14,
                tableLayout: "fixed",
              }}
            >
              <colgroup>
                <col style={{ width: "38%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "14%" }} />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ textAlign: "left", padding: "6px 0 10px", color: "#9ca3af", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Reason
                  </th>
                  <th style={{ textAlign: "center", padding: "6px 0 10px", color: "#9ca3af", fontSize: 11, fontWeight: 600 }}>
                    61–90d
                  </th>
                  <th style={{ textAlign: "center", padding: "6px 0 10px", color: "#9ca3af", fontSize: 11, fontWeight: 600 }}>
                    31–60d
                  </th>
                  <th style={{ textAlign: "center", padding: "6px 0 10px", color: "#9ca3af", fontSize: 11, fontWeight: 600 }}>
                    Last 30d
                  </th>
                  <th style={{ textAlign: "center", padding: "6px 0 10px", color: "#9ca3af", fontSize: 11, fontWeight: 600 }}>
                    Trend
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Total row */}
                {(() => {
                  const trend = trendArrow(flagTotals[1], flagTotals[2]);
                  return (
                    <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px 0", fontWeight: 700 }}>Total</td>
                      <TrendCell value={flagTotals[0]} />
                      <TrendCell value={flagTotals[1]} />
                      <TrendCell value={flagTotals[2]} highlight />
                      <td style={{ textAlign: "center", fontSize: 16, fontWeight: 700, color: trend.color }}>
                        {trend.symbol}
                      </td>
                    </tr>
                  );
                })()}

                {/* Per-reason rows */}
                {FLAG_REASONS.map((reason) => {
                  const buckets = flagByReason.get(reason)!;
                  const allZero = buckets.every((n) => n === 0);
                  const trend = trendArrow(buckets[1], buckets[2]);
                  return (
                    <tr
                      key={reason}
                      style={{
                        borderBottom: "1px solid #f3f4f6",
                        opacity: allZero ? 0.4 : 1,
                      }}
                    >
                      <td style={{ padding: "10px 0", color: "#374151" }}>
                        {FLAG_LABELS[reason]}
                      </td>
                      <TrendCell value={buckets[0]} />
                      <TrendCell value={buckets[1]} />
                      <TrendCell value={buckets[2]} highlight={!allZero} />
                      <td style={{ textAlign: "center", fontSize: 15, fontWeight: 700, color: allZero ? "#d1d5db" : trend.color }}>
                        {allZero ? "—" : trend.symbol}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 12 }}>
            ↑ increasing flags (needs attention) · ↓ decreasing flags (improving) · → stable (±0)
          </p>
        </SectionCard>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 3 — Supervisor Quality Scores, per location
      ════════════════════════════════════════════════════════════════════════ */}
      {locationScores.length > 0 && (
        <SectionCard
          title="Supervisor Check-in Quality"
          subtitle="Average self-assessment scores per location — last 90 days · 1 = needs work, 5 = excellent"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {locationScores.map((ls) => (
              <div key={ls.name}>
                {/* Location header */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 14,
                    paddingBottom: 8,
                    borderBottom: "1px solid #f3f4f6",
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{ls.name}</span>
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>
                    {ls.count} check-in{ls.count !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Score bars */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {SCORE_FIELDS.map(({ key, label }) => {
                    const v = ls.scores[key as string] as number | null;
                    const pct = v !== null ? Math.round((v / 5) * 100) : 0;
                    const color = scoreColor(v);
                    return (
                      <div key={key as string}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            marginBottom: 4,
                          }}
                        >
                          <span style={{ fontSize: 13, color: "#374151" }}>{label}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color }}>
                            {v !== null ? `${v.toFixed(1)} / 5` : "—"}
                          </span>
                        </div>
                        <div
                          style={{
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: "#f3f4f6",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: `${pct}%`,
                              backgroundColor: color,
                              borderRadius: 3,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* No data at all */}
      {checkinRows.length === 0 && locationScores.length === 0 && (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: "40px 24px",
            textAlign: "center",
            color: "#9ca3af",
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          No check-in data yet in the last 90 days.
          <br />
          Analytics will populate as your teams complete check-ins.
        </div>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</h2>
        {subtitle && (
          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 3, marginBottom: 0 }}>
            {subtitle}
          </p>
        )}
      </div>
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: "20px 24px",
          backgroundColor: "#fff",
        }}
      >
        {children}
      </div>
    </section>
  );
}

function TrendCell({ value, highlight }: { value: number; highlight?: boolean }) {
  return (
    <td
      style={{
        textAlign: "center",
        padding: "10px 0",
        fontWeight: highlight ? 700 : 400,
        color: value === 0 ? "#d1d5db" : highlight ? "#111827" : "#6b7280",
      }}
    >
      {value}
    </td>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p style={{ fontSize: 14, color: "#9ca3af", margin: 0 }}>{text}</p>
  );
}
