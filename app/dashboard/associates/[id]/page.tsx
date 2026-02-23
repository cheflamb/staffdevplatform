"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Department = { id: string; name: string };
type Position   = { id: string; title: string; department_id: string | null; level: number | null; is_managerial: boolean; description: string | null };
type Station      = { id: string; name: string; department_id: string; min_position_id: string | null; criticality: number; sort_order: number };
type ReviewSummary = { id: string; status: string; review_year: number | null };
type AdvancePlan   = { id: string };

type IncidentRow = {
  id: string;
  date: string;
  type: string;
  description: string;
  associate_response: string | null;
  created_at: string;
  company_members: { profiles: { full_name: string | null } | null } | null;
};

type CheckinHistoryRow = {
  id: string;
  completed_at: string | null;
  scheduled_date: string;
  status: string;
  flagged: boolean;
  reviewed_at: string | null;
  flag_reasons: string[];
  role_level_snapshot: string | null;
  notes_summary: string | null;
  followup_commitment: string | null;
};

type AssociateDetail = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  user_id: string | null;
  hire_date: string;
  status: string;
  position_id: string | null;
  department_id: string | null;
  station_id: string | null;
  location_id: string;
  locations: { id: string; name: string; company_id: string; logo_url: string | null } | null;
  positions: { title: string } | null;
  departments: { name: string } | null;
  stations: { name: string } | null;
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "9px 10px",
  marginTop: 6,
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 15,
  boxSizing: "border-box",
};

const sectionLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#6b7280",
  borderBottom: "1px solid #e5e7eb",
  paddingBottom: 8,
  marginBottom: 4,
};

const STATUSES = ["active", "inactive", "terminated"];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AssociateDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const associateId = params.id;

  // Caller
  const [callerRole, setCallerRole] = useState<string>("");

  // Location transfer (owner only)
  type LocationOption = { id: string; name: string };
  const [companyLocations,  setCompanyLocations]  = useState<LocationOption[]>([]);
  const [transferLocationId, setTransferLocationId] = useState("");
  const [transferBusy,      setTransferBusy]      = useState(false);
  const [transferError,     setTransferError]     = useState<string | null>(null);
  const [transferDone,      setTransferDone]      = useState(false);

  // Associate data
  const [associate, setAssociate]     = useState<AssociateDetail | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions,   setPositions]   = useState<Position[]>([]);

  // Editable fields
  const [firstName,    setFirstName]    = useState("");
  const [lastName,     setLastName]     = useState("");
  const [hireDate,     setHireDate]     = useState("");
  const [status,       setStatus]       = useState("active");
  const [departmentId, setDepartmentId] = useState("");
  const [positionId,   setPositionId]   = useState("");
  const [stationId,    setStationId]    = useState("");

  // Stations list
  const [stations, setStations] = useState<Station[]>([]);

  // Check-in history
  const [checkinHistory, setCheckinHistory] = useState<CheckinHistoryRow[]>([]);

  // Incident / discipline record
  const [incidents,         setIncidents]         = useState<IncidentRow[]>([]);
  const [incidentFormOpen,  setIncidentFormOpen]  = useState(false);
  const [incidentFormType,  setIncidentFormType]  = useState("verbal");
  const [incidentFormDesc,  setIncidentFormDesc]  = useState("");
  const [incidentBusy,      setIncidentBusy]      = useState(false);
  const [incidentError,     setIncidentError]     = useState<string | null>(null);
  const [incidentDone,      setIncidentDone]      = useState(false);

  // Invite resend
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteSent,    setInviteSent]    = useState(false);
  const [inviteError,   setInviteError]   = useState<string | null>(null);

  // Annual review
  const [activeReview,   setActiveReview]   = useState<ReviewSummary | null>(null);
  const [reviewFormOpen, setReviewFormOpen] = useState(false);
  const [reviewYear,     setReviewYear]     = useState(new Date().getFullYear());
  const [reviewBusy,     setReviewBusy]     = useState(false);
  const [reviewError,    setReviewError]    = useState<string | null>(null);

  // Advancement assessment
  const [advancePlan, setAdvancePlan] = useState<AdvancePlan | null>(null);

  // Offboard
  const [offboardOpen,   setOffboardOpen]   = useState(false);
  const [offboardReason, setOffboardReason] = useState("");
  const [offboardBusy,   setOffboardBusy]   = useState(false);
  const [offboardError,  setOffboardError]  = useState<string | null>(null);

  // UI
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Load associate + caller role
  // ---------------------------------------------------------------------------
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const { data: m } = await supabase
        .from("company_members")
        .select("role, company_id, location_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!m || !["owner", "supervisor"].includes(m.role)) {
        router.replace("/dashboard");
        return;
      }
      setCallerRole(m.role);

      // Owners need the full list of company locations for the transfer UI
      if (m.role === "owner" && m.company_id) {
        const { data: locs } = await supabase
          .from("locations")
          .select("id, name")
          .eq("company_id", m.company_id)
          .order("name");
        setCompanyLocations((locs ?? []) as unknown as LocationOption[]);
      }

      // Fetch associate
      const { data: assoc, error: assocErr } = await supabase
        .from("associates")
        .select(
          "id, first_name, last_name, email, user_id, hire_date, status, position_id, department_id, station_id, location_id, locations(id, name, company_id, logo_url), positions(title), departments(name), stations(name)"
        )
        .eq("id", associateId)
        .maybeSingle();

      if (assocErr || !assoc) {
        setError("Associate not found.");
        setLoading(false);
        return;
      }

      const a = assoc as unknown as AssociateDetail;
      setAssociate(a);
      setFirstName(a.first_name);
      setLastName(a.last_name);
      setHireDate(a.hire_date);
      setStatus(a.status);
      setDepartmentId(a.department_id ?? "");
      setPositionId(a.position_id ?? "");
      setStationId(a.station_id ?? "");

      // Load departments + positions + stations for this location
      const [{ data: depts }, { data: pos }, { data: sta }] = await Promise.all([
        supabase
          .from("departments")
          .select("id, name")
          .eq("location_id", a.location_id)
          .order("name"),
        supabase
          .from("positions")
          .select("id, title, department_id, level, is_managerial, description")
          .eq("location_id", a.location_id)
          .order("level"),
        supabase
          .from("stations")
          .select("id, name, department_id, min_position_id, criticality, sort_order")
          .eq("location_id", a.location_id)
          .order("sort_order"),
      ]);
      setDepartments(depts ?? []);
      setPositions((pos ?? []) as unknown as Position[]);
      setStations((sta ?? []) as unknown as Station[]);

      // Check-in history for this associate
      const { data: history } = await supabase
        .from("check_ins")
        .select("id, completed_at, scheduled_date, status, flagged, reviewed_at, flag_reasons, role_level_snapshot, notes_summary, followup_commitment")
        .eq("associate_id", associateId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(25);
      setCheckinHistory((history ?? []) as unknown as CheckinHistoryRow[]);

      // Incident / discipline record (all-time history, most recent first)
      const { data: incidentData } = await supabase
        .from("incidents")
        .select("id, date, type, description, associate_response, created_at, company_members(profiles(full_name))")
        .eq("associate_id", associateId)
        .order("date", { ascending: false });
      setIncidents((incidentData ?? []) as unknown as IncidentRow[]);

      // Active (non-completed) annual review for this associate
      const { data: reviewData } = await supabase
        .from("reviews")
        .select("id, status, review_year")
        .eq("associate_id", associateId)
        .neq("status", "completed")
        .maybeSingle();
      setActiveReview(reviewData ?? null);

      // Latest advance_to_next progression plan (for "Conduct Assessment" button)
      const { data: planData } = await supabase
        .from("progression_plans")
        .select("id")
        .eq("associate_id", associateId)
        .eq("outcome", "advance_to_next")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setAdvancePlan(planData ?? null);

      setLoading(false);
    })();
  }, [associateId, router]);

  // ---------------------------------------------------------------------------
  // Filtered positions + stations + advisory warning
  // ---------------------------------------------------------------------------
  const visiblePositions = callerRole === "owner"
    ? positions
    : positions.filter((p) => !p.is_managerial);

  const filteredPositions = departmentId
    ? visiblePositions.filter((p) => p.department_id === departmentId)
    : visiblePositions;

  const filteredStations = departmentId
    ? stations.filter((s) => s.department_id === departmentId)
    : stations;

  const stationWarning = (() => {
    if (!stationId || !positionId) return null;
    const station  = stations.find((s) => s.id === stationId);
    if (!station?.min_position_id) return null;
    const minPos   = positions.find((p) => p.id === station.min_position_id);
    const assocPos = positions.find((p) => p.id === positionId);
    if (!minPos || !assocPos) return null;
    if ((assocPos.level ?? 0) < (minPos.level ?? 0)) {
      return `Advisory: ${station.name} typically requires ${minPos.title} or higher. This associate is classified as ${assocPos.title}.`;
    }
    return null;
  })();

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------
  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch(`/api/associates/${associateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          hireDate,
          status,
          departmentId: departmentId || null,
          positionId:   positionId   || null,
          stationId:    stationId    || null,
        }),
      });

      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to save");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Resend invite
  // ---------------------------------------------------------------------------
  async function onResendInvite() {
    setInviteSending(true);
    setInviteError(null);
    setInviteSent(false);
    const res = await fetch(`/api/associates/${associateId}/invite`, { method: "POST" });
    const json = await res.json() as { error?: string; sent?: boolean; linked?: boolean; email?: string };
    setInviteSending(false);
    if (res.ok) {
      if (json.linked) {
        // Email was already registered — associate row is now linked directly.
        // Reload so the pending-invite banner disappears and "Account active" shows.
        router.refresh();
      } else {
        setInviteSent(true);
      }
    } else {
      setInviteError(json.error ?? "Failed to resend invite");
    }
  }

  // ---------------------------------------------------------------------------
  // Start annual review
  // ---------------------------------------------------------------------------
  async function onStartReview() {
    setReviewBusy(true);
    setReviewError(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ associate_id: associateId, review_year: reviewYear }),
      });
      const json = await res.json() as { error?: string; reviewId?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to create review");
      router.push(`/dashboard/reviews/${json.reviewId}`);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Something went wrong");
      setReviewBusy(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Offboard associate
  // ---------------------------------------------------------------------------
  async function onOffboard() {
    if (!offboardReason.trim() || offboardBusy) return;
    setOffboardBusy(true);
    setOffboardError(null);
    try {
      const res = await fetch(`/api/associates/${associateId}/offboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: offboardReason.trim() }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to offboard");
      setOffboardOpen(false);
      setOffboardReason("");
      router.refresh();
    } catch (err) {
      setOffboardError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setOffboardBusy(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Transfer location (owner only)
  // ---------------------------------------------------------------------------
  async function onTransfer() {
    if (!transferLocationId) return;
    setTransferBusy(true);
    setTransferError(null);
    setTransferDone(false);

    try {
      const res = await fetch(`/api/associates/${associateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId: transferLocationId }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Transfer failed");
      setTransferDone(true);
      // Reload to reflect new location in header
      router.refresh();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setTransferBusy(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Log incident / commendation
  // ---------------------------------------------------------------------------
  async function onLogIncident() {
    if (!incidentFormDesc.trim()) return;
    setIncidentBusy(true);
    setIncidentError(null);
    setIncidentDone(false);
    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          associateId,
          type:        incidentFormType,
          description: incidentFormDesc.trim(),
        }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to log incident");
      setIncidentDone(true);
      setIncidentFormDesc("");
      setIncidentFormOpen(false);
      // Reload incidents list
      const supabase = createClient();
      const { data } = await supabase
        .from("incidents")
        .select("id, date, type, description, associate_response, created_at, company_members(profiles(full_name))")
        .eq("associate_id", associateId)
        .order("date", { ascending: false });
      setIncidents((data ?? []) as unknown as IncidentRow[]);
    } catch (err) {
      setIncidentError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIncidentBusy(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <main className="page-pad" style={{ maxWidth: 600, margin: "0 auto" }}>
        <p style={{ color: "#6b7280" }}>Loading…</p>
      </main>
    );
  }

  if (error && !associate) {
    return (
      <main className="page-pad" style={{ maxWidth: 600, margin: "0 auto" }}>
        <p style={{ color: "#991b1b" }}>{error}</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 600, margin: "0 auto" }}>
      {/* Back */}
      <button
        onClick={() => router.push("/dashboard/associates")}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "#6b7280", padding: 0, marginBottom: 20, fontSize: 14,
        }}
      >
        ← Roster
      </button>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {associate?.locations?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={associate.locations.logo_url}
                alt="Location logo"
                style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 6, border: "1px solid #e5e7eb", flexShrink: 0 }}
              />
            )}
            <h1 style={{ fontSize: 24, fontWeight: 700 }}>
              {associate?.first_name} {associate?.last_name}
            </h1>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, marginLeft: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => router.push(`/dashboard/milestones/${associateId}`)}
              style={{
                padding: "8px 14px",
                backgroundColor: "white",
                color: "#111",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              90-Day Plan
            </button>
            {activeReview ? (
              <button
                type="button"
                onClick={() => router.push(`/dashboard/reviews/${activeReview.id}`)}
                style={{
                  padding: "8px 14px",
                  backgroundColor: "white",
                  color: "#111",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Annual Review →
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setReviewFormOpen((o) => !o); setReviewError(null); }}
                style={{
                  padding: "8px 14px",
                  backgroundColor: "white",
                  color: "#111",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {reviewFormOpen ? "Cancel" : "Start Annual Review"}
              </button>
            )}
            {advancePlan && (
              <button
                type="button"
                onClick={() => router.push(`/dashboard/assessments/new?associate_id=${associateId}`)}
                style={{
                  padding: "8px 14px",
                  backgroundColor: "white",
                  color: "#111",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Conduct Assessment
              </button>
            )}
            <a
              href={`/api/associates/${associateId}/record`}
              style={{
                padding: "8px 14px",
                backgroundColor: "white",
                color: "#111",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Download Record
            </a>
            {associate?.status !== "terminated" && (
              <button
                type="button"
                onClick={() => { setOffboardOpen((o) => !o); setOffboardError(null); }}
                style={{
                  padding: "8px 14px",
                  backgroundColor: "white",
                  color: "#991b1b",
                  border: "1px solid #fca5a5",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {offboardOpen ? "Cancel" : "Offboard"}
              </button>
            )}
            <button
              type="button"
              onClick={() => router.push(`/dashboard/checkins/new?associateId=${associateId}`)}
              style={{
                padding: "8px 14px",
                backgroundColor: "#111",
                color: "white",
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Start Check-In
            </button>
          </div>
        </div>
        <p style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>
          {associate?.locations?.name ?? ""}
          {associate?.departments?.name ? ` · ${associate.departments.name}` : ""}
          {associate?.positions?.title  ? ` · ${associate.positions.title}`  : ""}
          {associate?.stations?.name    ? ` · ${associate.stations.name}`    : ""}
        </p>
        {associate?.email && (
          <p style={{ color: "#6b7280", fontSize: 14, marginTop: 2 }}>
            {associate.email}
          </p>
        )}

        {/* Pending invite banner */}
        {associate?.email && !associate?.user_id && (
          <div style={{
            marginTop: 12, padding: "10px 14px",
            borderRadius: 7, border: "1px solid #e0e7ff",
            backgroundColor: "#f5f3ff",
            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#4338ca" }}>
                Invite pending
              </span>
              <span style={{ fontSize: 12, color: "#6b7280", marginLeft: 8 }}>
                {associate.email} — invite link expires after 24 hrs
              </span>
            </div>
            <button
              type="button"
              onClick={onResendInvite}
              disabled={inviteSending || inviteSent}
              style={{
                padding: "5px 12px", fontSize: 12, fontWeight: 600,
                borderRadius: 5, border: "1px solid #c7d2fe",
                background: inviteSent ? "#d1fae5" : "#fff",
                color:      inviteSent ? "#065f46" : "#4338ca",
                cursor: (inviteSending || inviteSent) ? "default" : "pointer",
                flexShrink: 0,
              }}
            >
              {inviteSending ? "Sending…" : inviteSent ? "Sent!" : "Resend invite"}
            </button>
            {inviteError && (
              <p style={{ fontSize: 12, color: "#991b1b", width: "100%", margin: 0 }}>
                {inviteError}
              </p>
            )}
          </div>
        )}

        {/* Already accepted */}
        {associate?.user_id && (
          <span style={{
            display: "inline-block", marginTop: 8,
            fontSize: 11, padding: "2px 8px", borderRadius: 4,
            background: "#d1fae5", color: "#065f46", fontWeight: 600,
          }}>
            Account active
          </span>
        )}
      </div>

      {/* Inline annual review form */}
      {reviewFormOpen && !activeReview && (
        <div style={{
          marginBottom: 20,
          padding: "16px 18px",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          backgroundColor: "#fafafa",
        }}>
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Start Annual Review</p>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <label style={{ display: "block", flex: 1 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Review Year
              </span>
              <input
                type="number"
                value={reviewYear}
                onChange={(e) => setReviewYear(Number(e.target.value))}
                min={2020}
                max={2100}
                style={{
                  display: "block", width: "100%", marginTop: 5,
                  padding: "8px 10px", border: "1px solid #d1d5db",
                  borderRadius: 6, fontSize: 14, boxSizing: "border-box",
                }}
              />
            </label>
            <button
              type="button"
              onClick={onStartReview}
              disabled={reviewBusy}
              style={{
                padding: "9px 16px", fontWeight: 600, fontSize: 14,
                backgroundColor: reviewBusy ? "#9ca3af" : "#111",
                color: "white", border: "none", borderRadius: 6,
                cursor: reviewBusy ? "not-allowed" : "pointer",
                whiteSpace: "nowrap", flexShrink: 0,
              }}
            >
              {reviewBusy ? "Creating…" : "Create review"}
            </button>
          </div>
          {reviewError && (
            <p style={{ fontSize: 12, color: "#991b1b", marginTop: 8 }}>{reviewError}</p>
          )}
        </div>
      )}

      {/* Offboard confirmation panel */}
      {offboardOpen && associate?.status !== "terminated" && (
        <div style={{
          marginBottom: 20,
          padding: "16px 18px",
          border: "1px solid #fca5a5",
          borderRadius: 8,
          backgroundColor: "#fff7f7",
        }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: "#991b1b", marginBottom: 6 }}>
            Offboard {associate?.first_name} {associate?.last_name}
          </p>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 14, lineHeight: 1.5 }}>
            This will permanently mark this associate as terminated and log an immutable separation record.
            This action cannot be undone.
          </p>
          <label style={{ display: "block", marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
              Reason for separation (required)
            </span>
            <textarea
              value={offboardReason}
              onChange={(e) => setOffboardReason(e.target.value)}
              placeholder="e.g., Voluntary resignation — last day 14 March 2026"
              rows={3}
              style={{
                width: "100%",
                padding: "9px 10px",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                fontSize: 14,
                resize: "vertical",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </label>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              disabled={!offboardReason.trim() || offboardBusy}
              onClick={onOffboard}
              style={{
                padding: "9px 18px",
                fontWeight: 600,
                fontSize: 14,
                backgroundColor: !offboardReason.trim() || offboardBusy ? "#e5e7eb" : "#991b1b",
                color: !offboardReason.trim() || offboardBusy ? "#9ca3af" : "white",
                border: "none",
                borderRadius: 6,
                cursor: !offboardReason.trim() || offboardBusy ? "not-allowed" : "pointer",
              }}
            >
              {offboardBusy ? "Offboarding…" : "Confirm Offboard"}
            </button>
            <button
              type="button"
              onClick={() => { setOffboardOpen(false); setOffboardReason(""); setOffboardError(null); }}
              style={{
                padding: "9px 16px",
                fontWeight: 600,
                fontSize: 14,
                backgroundColor: "white",
                color: "#374151",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
          {offboardError && (
            <p style={{ fontSize: 12, color: "#991b1b", marginTop: 8 }}>{offboardError}</p>
          )}
        </div>
      )}

      {/* Form */}
      <form onSubmit={onSave} style={{ display: "grid", gap: 16 }}>

        <p style={sectionLabel}>Profile</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "block" }}>
            <span style={{ fontWeight: 500 }}>First name</span>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              style={inputStyle}
            />
          </label>
          <label style={{ display: "block" }}>
            <span style={{ fontWeight: 500 }}>Last name</span>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              style={inputStyle}
            />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "block" }}>
            <span style={{ fontWeight: 500 }}>Hire date</span>
            <input
              type="date"
              value={hireDate}
              onChange={(e) => setHireDate(e.target.value)}
              required
              style={inputStyle}
            />
          </label>
          <label style={{ display: "block" }}>
            <span style={{ fontWeight: 500 }}>Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={inputStyle}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s} style={{ textTransform: "capitalize" }}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p style={{ ...sectionLabel, marginTop: 8 }}>Role</p>

        <label style={{ display: "block" }}>
          <span style={{ fontWeight: 500 }}>Department</span>
          <select
            value={departmentId}
            onChange={(e) => { setDepartmentId(e.target.value); setPositionId(""); }}
            style={inputStyle}
          >
            <option value="">Select department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>

        <label style={{ display: "block" }}>
          <span style={{ fontWeight: 500 }}>Position</span>
          <select
            value={positionId}
            onChange={(e) => setPositionId(e.target.value)}
            style={inputStyle}
          >
            <option value="">Select position</option>
            {filteredPositions.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
          {(() => {
            const desc = filteredPositions.find((p) => p.id === positionId)?.description;
            return desc ? (
              <p style={{ fontSize: 12, color: "#6b7280", marginTop: 6, lineHeight: 1.5, fontStyle: "italic" }}>
                {desc}
              </p>
            ) : null;
          })()}
        </label>

        <label style={{ display: "block" }}>
          <span style={{ fontWeight: 500 }}>Station</span>
          <select
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            style={inputStyle}
          >
            <option value="">Select station</option>
            {filteredStations.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>

        {stationWarning && (
          <p style={{
            padding: "10px 12px",
            borderRadius: 6,
            background: "#fffbeb",
            border: "1px solid #fcd34d",
            color: "#92400e",
            fontSize: 13,
          }}>
            ⚠ {stationWarning}
          </p>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button
            type="submit"
            disabled={busy}
            style={{
              flex: 1,
              padding: "12px 0",
              fontWeight: 600,
              backgroundColor: busy ? "#9ca3af" : "#111",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/dashboard/associates")}
            style={{
              padding: "12px 20px",
              fontWeight: 600,
              backgroundColor: "white",
              color: "#374151",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>

        {saved && (
          <p style={{ padding: 12, borderRadius: 6, background: "#f0fdf4", color: "#166534", fontSize: 14 }}>
            Saved successfully.
          </p>
        )}
        {error && (
          <p style={{ padding: 12, borderRadius: 6, background: "#fef2f2", color: "#991b1b", fontSize: 14 }}>
            {error}
          </p>
        )}
      </form>

      {/* ── Transfer location (owner only) ───────────────────────────── */}
      {callerRole === "owner" && companyLocations.length > 1 && (
        <div style={{
          marginTop: 32,
          padding: "18px 20px",
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          backgroundColor: "#fafafa",
        }}>
          <p style={{ ...sectionLabel, borderBottom: "none", paddingBottom: 0, marginBottom: 12 }}>
            Transfer location
          </p>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
            Currently at <strong>{associate?.locations?.name ?? "—"}</strong>. Select a new location to transfer this associate.
          </p>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <select
              value={transferLocationId}
              onChange={(e) => { setTransferLocationId(e.target.value); setTransferDone(false); }}
              style={{ ...inputStyle, marginTop: 0, flex: 1 }}
            >
              <option value="">Select location…</option>
              {companyLocations
                .filter((l) => l.id !== associate?.location_id)
                .map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
            </select>
            <button
              type="button"
              onClick={onTransfer}
              disabled={!transferLocationId || transferBusy}
              style={{
                padding: "9px 16px",
                fontWeight: 600,
                fontSize: 14,
                backgroundColor: (!transferLocationId || transferBusy) ? "#9ca3af" : "#111",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: (!transferLocationId || transferBusy) ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {transferBusy ? "Transferring…" : "Transfer"}
            </button>
          </div>
          {transferDone && (
            <p style={{ marginTop: 10, fontSize: 13, color: "#166534" }}>Transfer complete.</p>
          )}
          {transferError && (
            <p style={{ marginTop: 10, fontSize: 13, color: "#991b1b" }}>{transferError}</p>
          )}
        </div>
      )}

      {/* ── Discipline & commendation record ─────────────────────────── */}
      {(() => {
        const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

        const TYPE_META: Record<string, { label: string; bg: string; color: string }> = {
          commendation: { label: "Commendation",     bg: "#dcfce7", color: "#166534" },
          verbal:       { label: "Verbal",           bg: "#fef9c3", color: "#854d0e" },
          written:      { label: "Written",          bg: "#ffedd5", color: "#9a3412" },
          separation:   { label: "Separation",       bg: "#fee2e2", color: "#991b1b" },
          termination:  { label: "Separation record",bg: "#fee2e2", color: "#7f1d1d" },
        };

        return (
          <div style={{ marginTop: 40, marginBottom: 40 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>Discipline & Commendations</h2>
              <button
                type="button"
                onClick={() => { setIncidentFormOpen((o) => !o); setIncidentError(null); setIncidentDone(false); }}
                style={{
                  padding: "6px 12px", fontSize: 12, fontWeight: 600,
                  backgroundColor: "#111", color: "white",
                  border: "none", borderRadius: 5, cursor: "pointer",
                }}
              >
                {incidentFormOpen ? "Cancel" : "+ Log entry"}
              </button>
            </div>

            {/* Log form */}
            {incidentFormOpen && (
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, marginBottom: 16, backgroundColor: "#fafafa" }}>
                <div className="form-grid-inline" style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 10, alignItems: "flex-end" }}>
                  <label style={{ display: "block" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Type</span>
                    <select
                      value={incidentFormType}
                      onChange={(e) => setIncidentFormType(e.target.value)}
                      style={{ display: "block", width: "100%", marginTop: 5, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 }}
                    >
                      <option value="commendation">Commendation</option>
                      <option value="verbal">Verbal warning</option>
                      <option value="written">Written warning</option>
                      <option value="separation">Separation warning</option>
                    </select>
                  </label>
                  <label style={{ display: "block" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Description <span style={{ color: "#ef4444" }}>*</span></span>
                    <textarea
                      value={incidentFormDesc}
                      onChange={(e) => setIncidentFormDesc(e.target.value)}
                      rows={2}
                      placeholder="Describe the incident or commendation in detail…"
                      style={{ display: "block", width: "100%", marginTop: 5, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, resize: "vertical", boxSizing: "border-box" }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={onLogIncident}
                    disabled={incidentBusy || !incidentFormDesc.trim()}
                    style={{
                      padding: "9px 16px", fontWeight: 600, fontSize: 14,
                      backgroundColor: (!incidentFormDesc.trim() || incidentBusy) ? "#9ca3af" : "#111",
                      color: "white", border: "none", borderRadius: 6,
                      cursor: (!incidentFormDesc.trim() || incidentBusy) ? "not-allowed" : "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {incidentBusy ? "Saving…" : "Save"}
                  </button>
                </div>
                {incidentError && <p style={{ fontSize: 12, color: "#991b1b", marginTop: 8 }}>{incidentError}</p>}
              </div>
            )}

            {incidentDone && (
              <p style={{ fontSize: 13, color: "#166534", marginBottom: 10 }}>Entry saved. Staff member has been notified.</p>
            )}

            {incidents.length === 0 ? (
              <p style={{ color: "#9ca3af", fontSize: 14 }}>No entries on record.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {incidents.map((inc) => {
                  const meta = TYPE_META[inc.type] ?? { label: inc.type, bg: "#f3f4f6", color: "#374151" };
                  const isActive = inc.type !== "commendation" && (inc.date >= cutoff);
                  const recordedBy = (inc.company_members as unknown as { profiles: { full_name: string | null } | null } | null)?.profiles?.full_name ?? "Supervisor";
                  return (
                    <div
                      key={inc.id}
                      style={{
                        border: `1px solid ${isActive && inc.type !== "commendation" ? "#fca5a5" : "#e5e7eb"}`,
                        borderRadius: 7,
                        padding: "10px 14px",
                        backgroundColor: isActive && inc.type !== "commendation" ? "#fff7f7" : "#fafafa",
                        opacity: !isActive && inc.type !== "commendation" ? 0.65 : 1,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 4, backgroundColor: meta.bg, color: meta.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            {meta.label}
                          </span>
                          {!isActive && inc.type !== "commendation" && (
                            <span style={{ fontSize: 10, color: "#9ca3af", fontStyle: "italic" }}>expired (365d)</span>
                          )}
                          {isActive && inc.type !== "commendation" && (
                            <span style={{ fontSize: 10, color: "#ef4444", fontWeight: 600 }}>● active</span>
                          )}
                        </div>
                        <span style={{ fontSize: 12, color: "#9ca3af" }}>
                          {new Date(inc.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                          {" · "}{recordedBy}
                        </span>
                      </div>
                      <p style={{ fontSize: 14, color: "#374151", marginTop: 6, lineHeight: 1.5 }}>{inc.description}</p>
                      {inc.associate_response && (
                        <div style={{ marginTop: 8, padding: "8px 12px", backgroundColor: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 6 }}>
                          <p style={{ fontSize: 11, fontWeight: 600, color: "#0369a1", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.04em" }}>Staff response</p>
                          <p style={{ fontSize: 13, color: "#0c4a6e", lineHeight: 1.5 }}>{inc.associate_response}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Check-in history ─────────────────────────────────────────── */}
      <div style={{ marginTop: 40 }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 14,
        }}>
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>
            Check-in history
          </h2>
          <button
            type="button"
            onClick={() => router.push(`/dashboard/checkins/new?associateId=${associateId}`)}
            style={{
              padding: "6px 12px", fontSize: 12, fontWeight: 600,
              backgroundColor: "#111", color: "white",
              border: "none", borderRadius: 5, cursor: "pointer",
            }}
          >
            + New Check-In
          </button>
        </div>

        {checkinHistory.length === 0 ? (
          <p style={{ color: "#9ca3af", fontSize: 14 }}>No completed check-ins yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {checkinHistory.map((c) => {
              const isUnreviewedFlag = c.flagged && !c.reviewed_at;
              const isReviewedFlag   = c.flagged && !!c.reviewed_at;
              return (
                <a
                  key={c.id}
                  href={`/dashboard/checkins/${c.id}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    padding: "10px 14px",
                    borderRadius: 7,
                    border: isUnreviewedFlag
                      ? "1px solid #fca5a5"
                      : "1px solid #e5e7eb",
                    backgroundColor: isUnreviewedFlag ? "#fff5f5" : "#fafafa",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>
                        {c.completed_at
                          ? new Date(c.completed_at).toLocaleDateString(undefined, {
                              weekday: "short", month: "short", day: "numeric", year: "numeric",
                            })
                          : c.scheduled_date}
                      </span>
                      {c.role_level_snapshot && (
                        <span style={{
                          fontSize: 10, padding: "1px 6px", borderRadius: 4,
                          background: "#f3f4f6", color: "#6b7280", fontWeight: 500,
                          textTransform: "capitalize",
                        }}>
                          {c.role_level_snapshot}
                        </span>
                      )}
                      {isUnreviewedFlag && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                          background: "#fee2e2", color: "#991b1b",
                        }}>
                          FLAGGED
                        </span>
                      )}
                      {isReviewedFlag && (
                        <span style={{
                          fontSize: 10, fontWeight: 500, padding: "1px 6px", borderRadius: 4,
                          background: "#f3f4f6", color: "#9ca3af",
                        }}>
                          reviewed
                        </span>
                      )}
                    </div>
                    {c.notes_summary && (
                      <p style={{
                        fontSize: 12, color: "#6b7280", marginTop: 3,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {c.notes_summary.length > 90
                          ? c.notes_summary.slice(0, 90) + "…"
                          : c.notes_summary}
                      </p>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: 12, flexShrink: 0 }}>
                    View →
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
