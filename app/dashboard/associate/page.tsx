import { createClient as createServerSupabase } from "../../lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import LogoutButton from "../LogoutButton";
import ReplyForm from "../../components/ReplyForm";

// ---------------------------------------------------------------------------
// Admin client — service-role, bypasses RLS, only used after auth is verified
// ---------------------------------------------------------------------------
const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type AssociateProfile = {
  id: string;
  first_name: string;
  last_name: string;
  hire_date: string | null;
  email: string | null;
  positions:   { title: string; level: number } | null;
  departments: { name: string } | null;
  stations:    { name: string } | null;
  locations:   { name: string } | null;
};

type IncidentRecord = {
  id: string;
  date: string;
  type: string;
  description: string;
  associate_response: string | null;
};

type Notification = {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
};

type SharedCheckin = {
  id: string;
  completed_at: string;
  type: string;
  notes_summary:       string | null;
  followup_commitment: string | null;
  revisit_date:        string | null;
};

const TYPE_LABELS: Record<string, string> = {
  "30-day": "30-Day Review",
  "60-day": "60-Day Review",
  "90-day": "90-Day Review",
  "annual": "Annual Review",
  "adhoc":  "Check-In",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function AssociatePortalPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Confirm membership and role
  const { data: member } = await supabaseAdmin
    .from("company_members")
    .select("role, company_id, location_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) redirect("/onboarding");
  if (member.role !== "associate") redirect("/dashboard");

  // Associate profile with all classification fields
  const { data: profile } = await supabaseAdmin
    .from("associates")
    .select(
      "id, first_name, last_name, hire_date, email, " +
      "positions(title, level), departments(name), stations(name), locations(name)"
    )
    .eq("user_id", user.id)
    .maybeSingle() as { data: AssociateProfile | null; error: unknown };

  // Shared check-ins — only completed rows the supervisor chose to share
  const sharedCheckins: SharedCheckin[] = [];
  if (profile?.id) {
    const { data: checkins } = await supabaseAdmin
      .from("check_ins")
      .select("id, completed_at, type, notes_summary, followup_commitment, revisit_date")
      .eq("associate_id", profile.id)
      .eq("share_with_associate", true)
      .eq("status", "completed")
      .order("completed_at", { ascending: false }) as { data: SharedCheckin[] | null; error: unknown };

    if (checkins) sharedCheckins.push(...checkins);
  }

  // My incident / commendation record
  const myIncidents: IncidentRecord[] = [];
  if (profile?.id) {
    const { data: incData } = await supabaseAdmin
      .from("incidents")
      .select("id, date, type, description, associate_response")
      .eq("associate_id", profile.id)
      .order("date", { ascending: false }) as { data: IncidentRecord[] | null; error: unknown };
    if (incData) myIncidents.push(...incData);
  }

  // Active annual review for this associate
  type ActiveReview = { id: string; status: string; review_year: number | null };
  let activeReview: ActiveReview | null = null;
  if (profile?.id) {
    const { data: reviewData } = await supabaseAdmin
      .from("reviews")
      .select("id, status, review_year")
      .eq("associate_id", profile.id)
      .neq("status", "completed")
      .maybeSingle() as { data: ActiveReview | null; error: unknown };
    if (reviewData) activeReview = reviewData;
  }

  // Most recent progression plan with milestones and target position
  type ProgressionMilestoneRow = {
    id: string;
    day_target: number;
    goal_text: string;
    status: "pending" | "achieved" | "missed";
    completed_at: string | null;
    notes: string | null;
  };
  type ProgressionPlanRow = {
    id: string;
    outcome: "strengthen_current" | "advance_to_next";
    target_position_id: string | null;
    positions: { title: string } | null;
    progression_milestones: ProgressionMilestoneRow[];
  };
  let progressionPlan: ProgressionPlanRow | null = null;
  if (profile?.id) {
    const { data: planData } = await supabaseAdmin
      .from("progression_plans")
      .select(`
        id, outcome, target_position_id,
        positions:target_position_id ( title ),
        progression_milestones (
          id, day_target, goal_text, status, completed_at, notes
        )
      `)
      .eq("associate_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle() as { data: ProgressionPlanRow | null; error: unknown };
    if (planData) progressionPlan = planData;
  }

  // Unread notifications for this user
  const unreadNotifications: Notification[] = [];
  if (user?.id) {
    const { data: notifs } = await supabaseAdmin
      .from("notifications")
      .select("id, title, body, created_at, read_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10) as { data: Notification[] | null; error: unknown };
    if (notifs) unreadNotifications.push(...notifs);
  }

  const hasUnread = unreadNotifications.some((n) => !n.read_at);

  // ---------------------------------------------------------------------------
  // Derived display values
  // ---------------------------------------------------------------------------
  const firstName  = profile?.first_name ?? "there";
  const locationName = profile?.locations?.name ?? "";

  const hireDate = profile?.hire_date
    ? new Date(profile.hire_date + "T00:00:00").toLocaleDateString(undefined, {
        year: "numeric", month: "long", day: "numeric",
      })
    : null;

  // Days employed (for a simple tenure display)
  const daysEmployed = profile?.hire_date
    ? Math.floor((Date.now() - new Date(profile.hire_date + "T00:00:00").getTime()) / 86_400_000)
    : null;

  const tenureLabel =
    daysEmployed === null  ? null :
    daysEmployed < 30      ? `${daysEmployed} day${daysEmployed !== 1 ? "s" : ""} in` :
    daysEmployed < 365     ? `${Math.floor(daysEmployed / 30)} month${Math.floor(daysEmployed / 30) !== 1 ? "s" : ""} in` :
                             `${Math.floor(daysEmployed / 365)} year${Math.floor(daysEmployed / 365) !== 1 ? "s" : ""} in`;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <main
      className="page-pad"
      style={{
        maxWidth: 680,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* ── Header ── */}
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
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 26, fontWeight: 700 }}>
              Welcome back, {firstName}
            </h1>
            <span
              style={{
                display: "inline-block",
                padding: "2px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                backgroundColor: "#6b7280",
                color: "#fff",
                flexShrink: 0,
              }}
            >
              Staff
            </span>
          </div>
          {locationName && (
            <p style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>
              {locationName}
            </p>
          )}
        </div>
        <LogoutButton />
      </div>

      {/* ── Profile not yet linked ── */}
      {!profile && (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: 24,
            color: "#6b7280",
            fontSize: 14,
            textAlign: "center",
          }}
        >
          Your profile is still being set up. Check back soon, or ask your manager if something looks off.
        </div>
      )}

      {profile && (
        <>
          {/* ── My Profile ── */}
          <section style={{ marginBottom: 32 }}>
            <h2
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#9ca3af",
                marginBottom: 12,
              }}
            >
              My Profile
            </h2>
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 16,
                }}
              >
                <div>
                  <p style={{ fontWeight: 700, fontSize: 20 }}>
                    {profile.first_name} {profile.last_name}
                  </p>
                  {profile.positions?.title && (
                    <p style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>
                      {profile.positions.title}
                      {profile.departments?.name ? ` · ${profile.departments.name}` : ""}
                    </p>
                  )}
                </div>
                {tenureLabel && (
                  <span
                    style={{
                      fontSize: 12,
                      color: "#6b7280",
                      backgroundColor: "#f3f4f6",
                      padding: "4px 10px",
                      borderRadius: 6,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tenureLabel}
                  </span>
                )}
              </div>

              <div
                className="profile-grid-2"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "14px 24px",
                  paddingTop: 16,
                  borderTop: "1px solid #f3f4f6",
                }}
              >
                <div>
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "#9ca3af",
                    }}
                  >
                    Department
                  </p>
                  <p style={{ fontSize: 14, marginTop: 3, fontWeight: 500 }}>
                    {profile.departments?.name ?? "—"}
                  </p>
                </div>
                <div>
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "#9ca3af",
                    }}
                  >
                    Classification
                  </p>
                  <p style={{ fontSize: 14, marginTop: 3, fontWeight: 500 }}>
                    {profile.positions?.title ?? "—"}
                  </p>
                </div>
                <div>
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "#9ca3af",
                    }}
                  >
                    Station
                  </p>
                  <p style={{ fontSize: 14, marginTop: 3, fontWeight: 500 }}>
                    {profile.stations?.name ?? "—"}
                  </p>
                </div>
                <div>
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "#9ca3af",
                    }}
                  >
                    Start Date
                  </p>
                  <p style={{ fontSize: 14, marginTop: 3, fontWeight: 500 }}>
                    {hireDate ?? "—"}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ── Annual Review ── */}
          {activeReview && (
            <section style={{ marginBottom: 32 }}>
              <h2
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#9ca3af",
                  marginBottom: 12,
                }}
              >
                My Annual Review
              </h2>
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: "18px 20px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <div>
                  <p style={{ fontWeight: 600, fontSize: 15 }}>
                    {activeReview.review_year ?? new Date().getFullYear()} Annual Review
                  </p>
                  <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                    {activeReview.status === "pending_self"
                      ? "Your self-review is ready to complete"
                      : activeReview.status === "pending_supervisor"
                      ? "Submitted — awaiting supervisor review"
                      : "In conversation with your supervisor"}
                  </p>
                </div>
                <a
                  href={`/dashboard/reviews/${activeReview.id}`}
                  style={{
                    padding: "9px 16px",
                    backgroundColor: "#111",
                    color: "white",
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: "none",
                    flexShrink: 0,
                  }}
                >
                  {activeReview.status === "pending_self" ? "Start →" : "View →"}
                </a>
              </div>
            </section>
          )}

          {/* ── My Growth Plan ── */}
          {progressionPlan && (
            <section style={{ marginBottom: 32 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <h2
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#9ca3af",
                  }}
                >
                  My Growth Plan
                </h2>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: 4,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    backgroundColor:
                      progressionPlan.outcome === "advance_to_next" ? "#eff6ff" : "#f3f4f6",
                    color:
                      progressionPlan.outcome === "advance_to_next" ? "#1d4ed8" : "#374151",
                  }}
                >
                  {progressionPlan.outcome === "advance_to_next"
                    ? `Advancing toward ${(progressionPlan.positions as unknown as { title: string } | null)?.title ?? "next tier"}`
                    : "Building in current role"}
                </span>
              </div>

              <div style={{ border: "1px solid #e5e7eb", borderRadius: 10 }}>
                {[...progressionPlan.progression_milestones]
                  .sort((a, b) => a.day_target - b.day_target)
                  .map((m, idx, arr) => {
                    const statusMeta: Record<string, { label: string; bg: string; color: string }> = {
                      achieved: { label: "Achieved", bg: "#dcfce7", color: "#166534" },
                      missed:   { label: "Missed",   bg: "#fee2e2", color: "#991b1b" },
                      pending:  { label: "Pending",  bg: "#f3f4f6", color: "#6b7280" },
                    };
                    const meta = statusMeta[m.status] ?? { label: m.status, bg: "#f3f4f6", color: "#6b7280" };
                    return (
                      <div
                        key={m.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "56px 1fr auto",
                          gap: 16,
                          padding: "14px 20px",
                          borderBottom: idx < arr.length - 1 ? "1px solid #f3f4f6" : "none",
                          alignItems: "flex-start",
                        }}
                      >
                        <span
                          style={{
                            textAlign: "center",
                            padding: "3px 0",
                            backgroundColor: "#f3f4f6",
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#374151",
                          }}
                        >
                          Day {m.day_target}
                        </span>
                        <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.5, paddingTop: 2 }}>
                          {m.goal_text}
                        </p>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: 4,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            backgroundColor: meta.bg,
                            color: meta.color,
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                        >
                          {meta.label}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </section>
          )}

          {/* ── Shared Check-Ins ── */}
          <section>
            <h2
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#9ca3af",
                marginBottom: 12,
              }}
            >
              My Check-Ins
            </h2>

            {sharedCheckins.length === 0 ? (
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: "20px 24px",
                  color: "#9ca3af",
                  fontSize: 14,
                  lineHeight: 1.6,
                }}
              >
                No check-in notes shared yet. Your supervisor will share a summary with you after your next check-in.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {sharedCheckins.map((ci) => {
                  const ciDate = new Date(ci.completed_at).toLocaleDateString(undefined, {
                    year: "numeric", month: "short", day: "numeric",
                  });
                  return (
                    <div
                      key={ci.id}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        padding: 20,
                      }}
                    >
                      {/* Row header */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: ci.notes_summary || ci.followup_commitment ? 14 : 0,
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: 15 }}>
                          {TYPE_LABELS[ci.type] ?? ci.type}
                        </span>
                        <span style={{ fontSize: 13, color: "#9ca3af" }}>{ciDate}</span>
                      </div>

                      {/* Supervisor notes */}
                      {ci.notes_summary && (
                        <div style={{ marginBottom: ci.followup_commitment ? 10 : 0 }}>
                          <p
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              color: "#9ca3af",
                              marginBottom: 4,
                            }}
                          >
                            Notes
                          </p>
                          <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
                            {ci.notes_summary}
                          </p>
                        </div>
                      )}

                      {/* Follow-up commitment */}
                      {ci.followup_commitment && (
                        <div
                          style={{
                            backgroundColor: "#f0fdf4",
                            border: "1px solid #bbf7d0",
                            borderRadius: 8,
                            padding: "10px 14px",
                            marginTop: ci.notes_summary ? 10 : 0,
                          }}
                        >
                          <p
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              color: "#16a34a",
                              marginBottom: 4,
                            }}
                          >
                            What we&apos;re working on
                          </p>
                          <p style={{ fontSize: 14, color: "#15803d", lineHeight: 1.6 }}>
                            {ci.followup_commitment}
                          </p>
                        </div>
                      )}

                      {/* Next check-in target */}
                      {ci.revisit_date && (
                        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 10 }}>
                          Next check-in target:{" "}
                          <strong>
                            {new Date(ci.revisit_date + "T00:00:00").toLocaleDateString(undefined, {
                              year: "numeric", month: "short", day: "numeric",
                            })}
                          </strong>
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        {/* ── Notifications ── */}
        {unreadNotifications.length > 0 && (
          <section style={{ marginTop: 32 }}>
            <h2
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: hasUnread ? "#b45309" : "#9ca3af",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              Notifications
              {hasUnread && (
                <span style={{ fontSize: 10, fontWeight: 700, backgroundColor: "#fef3c7", color: "#92400e", padding: "2px 7px", borderRadius: 8 }}>
                  {unreadNotifications.filter((n) => !n.read_at).length} new
                </span>
              )}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {unreadNotifications.map((n) => (
                <div
                  key={n.id}
                  style={{
                    border: `1px solid ${n.read_at ? "#e5e7eb" : "#fde68a"}`,
                    backgroundColor: n.read_at ? "#fafafa" : "#fffbeb",
                    borderRadius: 8,
                    padding: "12px 16px",
                    opacity: n.read_at ? 0.75 : 1,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <p style={{ fontWeight: 600, fontSize: 14 }}>{n.title}</p>
                    <span style={{ fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap", flexShrink: 0 }}>
                      {new Date(n.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  {n.body && (
                    <p style={{ fontSize: 13, color: "#6b7280", marginTop: 3, lineHeight: 1.5 }}>{n.body}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── My Record ── */}
        {myIncidents.length > 0 && (
          <section style={{ marginTop: 32 }}>
            <h2
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#9ca3af",
                marginBottom: 12,
              }}
            >
              My Record
            </h2>

            {(() => {
              const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
              const TYPE_META: Record<string, { label: string; bg: string; color: string }> = {
                commendation: { label: "Commendation",    bg: "#dcfce7", color: "#166534" },
                verbal:       { label: "Verbal",          bg: "#fef9c3", color: "#854d0e" },
                written:      { label: "Written",         bg: "#ffedd5", color: "#9a3412" },
                separation:   { label: "Separation",      bg: "#fee2e2", color: "#991b1b" },
                termination:  { label: "Separation",      bg: "#fee2e2", color: "#7f1d1d" },
              };

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {myIncidents.map((inc) => {
                    const meta = TYPE_META[inc.type] ?? { label: inc.type, bg: "#f3f4f6", color: "#374151" };
                    const isActive = inc.type !== "commendation" && inc.date >= cutoff;
                    const canReply = inc.type !== "commendation" && !inc.associate_response;

                    return (
                      <div
                        key={inc.id}
                        style={{
                          border: `1px solid ${isActive ? "#fca5a5" : "#e5e7eb"}`,
                          borderRadius: 10,
                          padding: 16,
                          backgroundColor: isActive ? "#fff7f7" : "#fafafa",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, backgroundColor: meta.bg, color: meta.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            {meta.label}
                          </span>
                          <span style={{ fontSize: 12, color: "#9ca3af" }}>
                            {new Date(inc.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        </div>

                        <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>{inc.description}</p>

                        {/* Existing response */}
                        {inc.associate_response && (
                          <div style={{ marginTop: 10, padding: "10px 14px", backgroundColor: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 6 }}>
                            <p style={{ fontSize: 11, fontWeight: 600, color: "#0369a1", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.04em" }}>Your response</p>
                            <p style={{ fontSize: 13, color: "#0c4a6e", lineHeight: 1.5 }}>{inc.associate_response}</p>
                          </div>
                        )}

                        {canReply && <ReplyForm incidentId={inc.id} />}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </section>
        )}
      </>
    )}
    </main>
  );
}
