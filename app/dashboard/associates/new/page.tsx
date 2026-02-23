"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";

type Location   = { id: string; name: string };
type Department = { id: string; name: string };
type Position   = { id: string; title: string; department_id: string | null; level: number | null; is_managerial: boolean };
type Station    = { id: string; name: string; department_id: string; min_position_id: string | null; criticality: number; sort_order: number };

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

export default function NewAssociatePage() {
  const router = useRouter();

  // Caller identity
  const [role, setRole]               = useState<string>("");
  const [memberId, setMemberId]       = useState<string>("");
  const [companyId, setCompanyId]     = useState<string>("");

  // Location options (owner sees all; supervisor has one fixed)
  const [locations, setLocations]         = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");

  // Dependent dropdowns
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions,   setPositions]   = useState<Position[]>([]);
  const [stations,    setStations]    = useState<Station[]>([]);

  // Form fields
  const [firstName,    setFirstName]    = useState("");
  const [lastName,     setLastName]     = useState("");
  const [email,        setEmail]        = useState("");
  const [hireDate,     setHireDate]     = useState(
    new Date().toISOString().split("T")[0]
  );
  const [departmentId, setDepartmentId] = useState("");
  const [positionId,   setPositionId]   = useState("");
  const [stationId,    setStationId]    = useState("");

  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(false);
  const [msg,     setMsg]     = useState<{ text: string; ok: boolean } | null>(null);

  // ── Load caller's membership ──────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const { data: m } = await supabase
        .from("company_members")
        .select("id, role, company_id, location_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!m || !["owner", "supervisor"].includes(m.role)) {
        router.replace("/dashboard");
        return;
      }

      setRole(m.role);
      setMemberId(m.id);
      setCompanyId(m.company_id);

      if (m.role === "supervisor") {
        setSelectedLocationId(m.location_id ?? "");
      } else {
        // Owner: fetch all locations
        const { data: locs } = await supabase
          .from("locations")
          .select("id, name")
          .eq("company_id", m.company_id)
          .order("name");
        setLocations(locs ?? []);
      }

      setLoading(false);
    })();
  }, [router]);

  // ── Load departments + positions + stations when location is selected ──────
  useEffect(() => {
    if (!selectedLocationId) return;

    (async () => {
      const supabase = createClient();
      const [{ data: depts }, { data: pos }, { data: sta }] = await Promise.all([
        supabase
          .from("departments")
          .select("id, name")
          .eq("location_id", selectedLocationId)
          .order("name"),
        supabase
          .from("positions")
          .select("id, title, department_id, level, is_managerial")
          .eq("location_id", selectedLocationId)
          .order("level"),
        supabase
          .from("stations")
          .select("id, name, department_id, min_position_id, criticality, sort_order")
          .eq("location_id", selectedLocationId)
          .order("sort_order"),
      ]);
      setDepartments(depts ?? []);
      setPositions(pos ?? []);
      setStations((sta ?? []) as Station[]);
      setDepartmentId("");
      setPositionId("");
      setStationId("");
    })();
  }, [selectedLocationId]);

  // Supervisors (GMs) cannot assign managerial titles — only owners can
  const visiblePositions = role === "owner"
    ? positions
    : positions.filter((p) => !p.is_managerial);

  const filteredPositions = departmentId
    ? visiblePositions.filter((p) => p.department_id === departmentId)
    : visiblePositions;

  const filteredStations = departmentId
    ? stations.filter((s) => s.department_id === departmentId)
    : [];

  // Advisory warning: associate's position level is below station's minimum
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

  // ── Submit ────────────────────────────────────────────────────────────────
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    try {
      const res = await fetch("/api/associates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          hireDate,
          locationId:   selectedLocationId,
          departmentId: departmentId || null,
          positionId:   positionId   || null,
          stationId:    stationId    || null,
        }),
      });

      const json = await res.json() as {
        error?: string;
        invited?: boolean;
        inviteError?: string;
      };

      if (!res.ok) throw new Error(json.error ?? "Failed to add associate");

      if (!json.invited && json.inviteError) {
        setMsg({
          text: `${firstName} was added but the invite email failed: ${json.inviteError}. You can resend from their profile.`,
          ok: false,
        });
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setMsg({
        text: err instanceof Error ? err.message : "Something went wrong",
        ok: false,
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        <p style={{ color: "#6b7280" }}>Loading…</p>
      </main>
    );
  }

  const canSubmit = !busy && !!selectedLocationId && !!firstName && !!lastName && !!email && !!hireDate;

  return (
    <main style={{ padding: 24, maxWidth: 520, margin: "0 auto" }}>
      <button
        onClick={() => router.back()}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#6b7280",
          padding: 0,
          marginBottom: 20,
          fontSize: 14,
        }}
      >
        ← Back
      </button>

      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Add Staff Member</h1>
      <p style={{ color: "#6b7280", marginTop: 4, marginBottom: 24 }}>
        They&apos;ll receive an email invite to create their account.
      </p>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 16 }}>

        {/* Location — owners only */}
        {role === "owner" && (
          <label style={{ display: "block" }}>
            <span style={{ fontWeight: 500 }}>Location</span>
            <select
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              required
              style={inputStyle}
            >
              <option value="">Select a location</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>
        )}

        {/* Name row */}
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

        <label style={{ display: "block" }}>
          <span style={{ fontWeight: 500 }}>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
        </label>

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
          <span style={{ fontWeight: 500 }}>Department</span>
          <select
            value={departmentId}
            onChange={(e) => { setDepartmentId(e.target.value); setPositionId(""); }}
            disabled={!selectedLocationId}
            style={inputStyle}
          >
            <option value="">Select department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>

        <label style={{ display: "block" }}>
          <span style={{ fontWeight: 500 }}>Classification</span>
          <select
            value={positionId}
            onChange={(e) => setPositionId(e.target.value)}
            disabled={!selectedLocationId}
            style={inputStyle}
          >
            <option value="">Select classification</option>
            {filteredPositions.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            padding: "12px 0",
            fontWeight: 600,
            backgroundColor: canSubmit ? "#111" : "#9ca3af",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: canSubmit ? "pointer" : "not-allowed",
            marginTop: 4,
          }}
        >
          {busy ? "Sending invite…" : "Add & send invite"}
        </button>

        {msg && (
          <p
            style={{
              padding: 12,
              borderRadius: 6,
              fontSize: 14,
              background: msg.ok ? "#d1fae5" : "#fef2f2",
              color:      msg.ok ? "#065f46" : "#991b1b",
            }}
          >
            {msg.text}
          </p>
        )}
      </form>
    </main>
  );
}
