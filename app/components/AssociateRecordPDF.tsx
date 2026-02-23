import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";

// ---------------------------------------------------------------------------
// Prop types
// ---------------------------------------------------------------------------
export type PDFAssociate = {
  first_name: string;
  last_name: string;
  hire_date: string | null;
  status: string;
  positions:   { title: string } | null;
  departments: { name: string }  | null;
  stations:    { name: string }  | null;
  locations:   { name: string }  | null;
};

export type PDFIncident = {
  id: string;
  date: string;
  type: string;
  description: string;
  associate_response: string | null;
};

export type PDFCheckin = {
  id: string;
  completed_at: string;
  type: string;
  notes_summary:       string | null;
  followup_commitment: string | null;
};

export type PDFReview = {
  id: string;
  review_year: number | null;
  status: string;
};

export type PDFAssessment = {
  id: string;
  date: string;
  passed: boolean | null;
  notes: string | null;
  current_classification:  string | null;
  proposed_classification: string | null;
  assessment_templates: { title: string } | null;
};

export type PDFProgressionPlan = {
  id: string;
  outcome: string;
  created_at: string;
  positions: { title: string } | null;
  progression_milestones: {
    day_target: number;
    goal_text:  string;
    status:     string;
  }[];
};

type Props = {
  associate:    PDFAssociate;
  incidents:    PDFIncident[];
  checkins:     PDFCheckin[];
  reviews:      PDFReview[];
  assessments:  PDFAssessment[];
  plans:        PDFProgressionPlan[];
  generatedAt:  string;
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#111827",
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 40,
  },
  // Header
  headerBlock: {
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 18,
    color: "#111827",
    letterSpacing: 1,
  },
  headerSub: {
    fontSize: 9,
    color: "#6b7280",
    marginTop: 3,
  },
  // Section
  section: {
    marginBottom: 16,
  },
  sectionHeading: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: "#9ca3af",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  // Profile grid
  profileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 0,
  },
  profileCell: {
    width: "33%",
    marginBottom: 8,
  },
  profileLabel: {
    fontSize: 7,
    color: "#9ca3af",
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  profileValue: {
    fontSize: 10,
    color: "#111827",
    fontFamily: "Helvetica-Bold",
  },
  // Status badge
  statusBadge: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 3,
    alignSelf: "flex-start",
    marginTop: 1,
  },
  // Table
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    borderLeftWidth: 1,
    borderLeftColor: "#e5e7eb",
    borderRightWidth: 1,
    borderRightColor: "#e5e7eb",
  },
  tableRowAlt: {
    backgroundColor: "#fafafa",
  },
  tableHeaderCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableCell: {
    fontSize: 9,
    color: "#374151",
  },
  tableCellMuted: {
    fontSize: 8,
    color: "#6b7280",
    marginTop: 2,
    fontStyle: "italic",
  },
  // Milestone row
  milestoneRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 5,
  },
  milestoneDay: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#374151",
    backgroundColor: "#f3f4f6",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 3,
    marginRight: 8,
    width: 38,
    textAlign: "center",
  },
  milestoneText: {
    flex: 1,
    fontSize: 9,
    color: "#374151",
    lineHeight: 1.4,
  },
  milestoneStatus: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 3,
    marginLeft: 8,
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 7,
    color: "#9ca3af",
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const INCIDENT_LABELS: Record<string, string> = {
  commendation: "Commendation",
  verbal:       "Verbal Warning",
  written:      "Written Warning",
  separation:   "Separation Warning",
  termination:  "Termination",
};

const CHECKIN_LABELS: Record<string, string> = {
  "30-day": "30-Day",
  "60-day": "60-Day",
  "90-day": "90-Day",
  annual:   "Annual",
  adhoc:    "Check-In",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso.includes("T") ? iso : iso + "T00:00:00")
    .toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function statusBadgeStyle(status: string): { backgroundColor: string; color: string } {
  if (status === "active")     return { backgroundColor: "#dcfce7", color: "#166534" };
  if (status === "terminated") return { backgroundColor: "#fee2e2", color: "#991b1b" };
  return { backgroundColor: "#f3f4f6", color: "#374151" };
}

function milestoneBadgeStyle(status: string): { backgroundColor: string; color: string } {
  if (status === "achieved") return { backgroundColor: "#dcfce7", color: "#166534" };
  if (status === "missed")   return { backgroundColor: "#fee2e2", color: "#991b1b" };
  return { backgroundColor: "#f3f4f6", color: "#6b7280" };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function SectionHeading({ children }: { children: string }) {
  return <Text style={s.sectionHeading}>{children}</Text>;
}

function NoData({ label }: { label: string }) {
  return (
    <Text style={{ fontSize: 8, color: "#9ca3af", fontStyle: "italic" }}>
      No {label} on record.
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------
export default function AssociateRecordPDF({
  associate,
  incidents,
  checkins,
  reviews,
  assessments,
  plans,
  generatedAt,
}: Props) {
  const fullName = `${associate.first_name} ${associate.last_name}`;
  const locationName = associate.locations?.name ?? "";

  return (
    <Document title={`${fullName} — Associate Record`} author="StaffDev Platform">
      <Page size="A4" style={s.page}>

        {/* ── Header ── */}
        <View style={s.headerBlock}>
          <Text style={s.headerTitle}>ASSOCIATE RECORD</Text>
          {locationName ? (
            <Text style={s.headerSub}>{locationName}</Text>
          ) : null}
          <Text style={s.headerSub}>Generated {generatedAt}</Text>
        </View>

        {/* ── Profile ── */}
        <View style={s.section}>
          <SectionHeading>Profile</SectionHeading>
          <View style={s.profileGrid}>
            <View style={s.profileCell}>
              <Text style={s.profileLabel}>Name</Text>
              <Text style={s.profileValue}>{fullName}</Text>
            </View>
            <View style={s.profileCell}>
              <Text style={s.profileLabel}>Status</Text>
              <Text style={[s.statusBadge, statusBadgeStyle(associate.status)]}>
                {associate.status.toUpperCase()}
              </Text>
            </View>
            <View style={s.profileCell}>
              <Text style={s.profileLabel}>Hire Date</Text>
              <Text style={s.profileValue}>{fmtDate(associate.hire_date)}</Text>
            </View>
            <View style={s.profileCell}>
              <Text style={s.profileLabel}>Classification</Text>
              <Text style={s.profileValue}>{associate.positions?.title ?? "—"}</Text>
            </View>
            <View style={s.profileCell}>
              <Text style={s.profileLabel}>Department</Text>
              <Text style={s.profileValue}>{associate.departments?.name ?? "—"}</Text>
            </View>
            <View style={s.profileCell}>
              <Text style={s.profileLabel}>Station</Text>
              <Text style={s.profileValue}>{associate.stations?.name ?? "—"}</Text>
            </View>
          </View>
        </View>

        {/* ── Incidents & Commendations ── */}
        <View style={s.section}>
          <SectionHeading>Incidents &amp; Commendations</SectionHeading>
          {incidents.length === 0 ? (
            <NoData label="incidents or commendations" />
          ) : (
            <View>
              {/* Table header */}
              <View style={s.tableHeader}>
                <Text style={[s.tableHeaderCell, { width: 60 }]}>Date</Text>
                <Text style={[s.tableHeaderCell, { width: 70 }]}>Type</Text>
                <Text style={[s.tableHeaderCell, { flex: 1 }]}>Description</Text>
              </View>
              {incidents.map((inc, idx) => (
                <View key={inc.id} style={[s.tableRow, idx % 2 === 1 ? s.tableRowAlt : {}]}>
                  <Text style={[s.tableCell, { width: 60 }]}>{fmtDate(inc.date)}</Text>
                  <Text style={[s.tableCell, { width: 70 }]}>{INCIDENT_LABELS[inc.type] ?? inc.type}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.tableCell}>{inc.description}</Text>
                    {inc.associate_response && (
                      <Text style={s.tableCellMuted}>Response: {inc.associate_response}</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Check-In History ── */}
        <View style={s.section}>
          <SectionHeading>Check-In History</SectionHeading>
          {checkins.length === 0 ? (
            <NoData label="check-ins" />
          ) : (
            <View>
              <View style={s.tableHeader}>
                <Text style={[s.tableHeaderCell, { width: 60 }]}>Date</Text>
                <Text style={[s.tableHeaderCell, { width: 50 }]}>Type</Text>
                <Text style={[s.tableHeaderCell, { flex: 1 }]}>Notes / Follow-up</Text>
              </View>
              {checkins.map((ci, idx) => (
                <View key={ci.id} style={[s.tableRow, idx % 2 === 1 ? s.tableRowAlt : {}]}>
                  <Text style={[s.tableCell, { width: 60 }]}>{fmtDate(ci.completed_at)}</Text>
                  <Text style={[s.tableCell, { width: 50 }]}>{CHECKIN_LABELS[ci.type] ?? ci.type}</Text>
                  <View style={{ flex: 1 }}>
                    {ci.notes_summary && (
                      <Text style={s.tableCell}>{ci.notes_summary}</Text>
                    )}
                    {ci.followup_commitment && (
                      <Text style={s.tableCellMuted}>Follow-up: {ci.followup_commitment}</Text>
                    )}
                    {!ci.notes_summary && !ci.followup_commitment && (
                      <Text style={s.tableCellMuted}>No notes</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Annual Reviews ── */}
        {reviews.length > 0 && (
          <View style={s.section}>
            <SectionHeading>Annual Reviews</SectionHeading>
            <View>
              <View style={s.tableHeader}>
                <Text style={[s.tableHeaderCell, { width: 50 }]}>Year</Text>
                <Text style={[s.tableHeaderCell, { flex: 1 }]}>Status</Text>
              </View>
              {reviews.map((r, idx) => (
                <View key={r.id} style={[s.tableRow, idx % 2 === 1 ? s.tableRowAlt : {}]}>
                  <Text style={[s.tableCell, { width: 50 }]}>{r.review_year ?? "—"}</Text>
                  <Text style={[s.tableCell, { flex: 1 }]}>
                    {r.status === "completed" ? "Completed" : r.status}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Assessment Results ── */}
        {assessments.length > 0 && (
          <View style={s.section}>
            <SectionHeading>Assessment Results</SectionHeading>
            <View>
              <View style={s.tableHeader}>
                <Text style={[s.tableHeaderCell, { width: 60 }]}>Date</Text>
                <Text style={[s.tableHeaderCell, { width: 100 }]}>Assessment</Text>
                <Text style={[s.tableHeaderCell, { width: 40 }]}>Result</Text>
                <Text style={[s.tableHeaderCell, { flex: 1 }]}>Notes</Text>
              </View>
              {assessments.map((a, idx) => (
                <View key={a.id} style={[s.tableRow, idx % 2 === 1 ? s.tableRowAlt : {}]}>
                  <Text style={[s.tableCell, { width: 60 }]}>{fmtDate(a.date)}</Text>
                  <Text style={[s.tableCell, { width: 100 }]}>
                    {a.assessment_templates?.title ?? "—"}
                  </Text>
                  <Text style={[
                    s.tableCell,
                    { width: 40, fontFamily: "Helvetica-Bold" },
                    a.passed === true  ? { color: "#166534" } :
                    a.passed === false ? { color: "#991b1b" } :
                                         { color: "#6b7280" },
                  ]}>
                    {a.passed === true ? "PASS" : a.passed === false ? "FAIL" : "—"}
                  </Text>
                  <Text style={[s.tableCell, { flex: 1 }]}>{a.notes ?? "—"}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Progression Plans ── */}
        {plans.length > 0 && (
          <View style={s.section}>
            <SectionHeading>Progression Plans</SectionHeading>
            {plans.map((plan) => {
              const sorted = [...plan.progression_milestones].sort(
                (a, b) => a.day_target - b.day_target
              );
              return (
                <View
                  key={plan.id}
                  style={{
                    marginBottom: 10,
                    padding: 8,
                    borderWidth: 1,
                    borderColor: "#e5e7eb",
                    borderRadius: 4,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: "#374151" }}>
                      {plan.outcome === "advance_to_next"
                        ? `Advancing toward ${plan.positions?.title ?? "next tier"}`
                        : "Building in current role"}
                    </Text>
                    <Text style={{ fontSize: 8, color: "#9ca3af" }}>
                      {fmtDate(plan.created_at)}
                    </Text>
                  </View>
                  {sorted.map((m) => {
                    const mStyle = milestoneBadgeStyle(m.status);
                    return (
                      <View key={m.day_target} style={s.milestoneRow}>
                        <Text style={s.milestoneDay}>Day {m.day_target}</Text>
                        <Text style={s.milestoneText}>{m.goal_text}</Text>
                        <Text style={[s.milestoneStatus, mStyle]}>
                          {m.status.toUpperCase()}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>
        )}

        {/* ── Footer ── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            {fullName} — Confidential Employment Record
          </Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>

      </Page>
    </Document>
  );
}
