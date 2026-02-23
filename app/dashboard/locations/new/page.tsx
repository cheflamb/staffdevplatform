"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

const US_TIMEZONES = [
  { label: "Eastern",  value: "America/New_York" },
  { label: "Central",  value: "America/Chicago" },
  { label: "Mountain", value: "America/Denver" },
  { label: "Pacific",  value: "America/Los_Angeles" },
  { label: "Alaska",   value: "America/Anchorage" },
  { label: "Hawaii",   value: "Pacific/Honolulu" },
];

function isValidPhone(value: string): boolean {
  return value.replace(/\D/g, "").length === 10;
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

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

const invalidStyle: React.CSSProperties = {
  ...inputStyle,
  border: "1px solid #ef4444",
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

const req = <span style={{ color: "#ef4444" }}> *</span>;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function NewLocationPage() {
  const router = useRouter();

  // Location fields
  const [name,          setName]          = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [city,          setCity]          = useState("");
  const [state,         setState]         = useState("");
  const [timezone,      setTimezone]      = useState("America/New_York");
  const [suite,         setSuite]         = useState("");
  const [zip,           setZip]           = useState("");
  const [phone,         setPhone]         = useState("");

  // GM fields
  const [gmFirst, setGmFirst] = useState("");
  const [gmLast,  setGmLast]  = useState("");
  const [gmPhone, setGmPhone] = useState("");

  // Logo
  const [logoFile,    setLogoFile]    = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // UI state
  const [submitted, setSubmitted] = useState(false);
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const phoneValid   = isValidPhone(phone);
  const gmPhoneValid = isValidPhone(gmPhone);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!phoneValid || !gmPhoneValid) return;

    setBusy(true);
    setError(null);

    try {
      // 1. Create location
      const res = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          street_address: streetAddress,
          suite:          suite || null,
          city,
          state,
          zip,
          timezone,
          phone,
          gm_first_name: gmFirst,
          gm_last_name:  gmLast,
          gm_phone:      gmPhone,
        }),
      });

      const json = await res.json() as { error?: string; locationId?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to create location");

      // 2. Upload logo if selected, then patch location with logo_url
      if (logoFile && json.locationId) {
        const supabase = createClient();
        const ext  = logoFile.name.split(".").pop();
        const path = `location-logos/${json.locationId}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from("staffappbucket")
          .upload(path, logoFile, { upsert: true });

        if (!uploadErr) {
          const { data: { publicUrl } } = supabase.storage
            .from("staffappbucket")
            .getPublicUrl(path);

          await fetch(`/api/locations/${json.locationId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name, street_address: streetAddress, suite: suite || null,
              city, state, zip, timezone, phone,
              gm_first_name: gmFirst, gm_last_name: gmLast, gm_phone: gmPhone,
              logo_url: publicUrl,
            }),
          });
        }
      }

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 560, margin: "0 auto" }}>
      <button
        onClick={() => router.back()}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "#6b7280", padding: 0, marginBottom: 20, fontSize: 14,
        }}
      >
        ← Back
      </button>

      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Add Location</h1>
      <p style={{ color: "#6b7280", marginTop: 4, marginBottom: 28 }}>
        Each location gets its own team, positions, and review setup.
      </p>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 16 }}>

        {/* ── Location details ───────────────────────────────────────── */}
        <p style={sectionLabel}>Location Details</p>

        <label style={{ display: "block" }}>
          <span style={{ fontWeight: 500 }}>Location name{req}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Downtown, North Side, Main Kitchen"
            style={inputStyle}
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 12 }}>
          <label style={{ display: "block" }}>
            <span style={{ fontWeight: 500 }}>Street address{req}</span>
            <input
              value={streetAddress}
              onChange={(e) => setStreetAddress(e.target.value)}
              required
              placeholder="123 Main St"
              style={inputStyle}
            />
          </label>
          <label style={{ display: "block" }}>
            <span style={{ fontWeight: 500 }}>Suite / Unit</span>
            <input
              value={suite}
              onChange={(e) => setSuite(e.target.value)}
              placeholder="Ste 200"
              style={inputStyle}
            />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 90px 140px", gap: 12, alignItems: "end" }}>
          <label style={{ display: "block" }}>
            <span style={{ fontWeight: 500 }}>City{req}</span>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
              style={inputStyle}
            />
          </label>

          <label style={{ display: "block" }}>
            <span style={{ fontWeight: 500 }}>State{req}</span>
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              required
              style={inputStyle}
            >
              <option value="">—</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          <label style={{ display: "block" }}>
            <span style={{ fontWeight: 500 }}>Zip{req}</span>
            <input
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              required
              placeholder="00000"
              inputMode="numeric"
              maxLength={10}
              style={inputStyle}
            />
          </label>

          <label style={{ display: "block" }}>
            <span style={{ fontWeight: 500 }}>Timezone{req}</span>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              style={inputStyle}
            >
              {US_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </label>
        </div>

        <label style={{ display: "block" }}>
          <span style={{ fontWeight: 500 }}>Location phone{req}</span>
          <input
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            required
            placeholder="(555) 555-5555"
            inputMode="tel"
            style={submitted && !phoneValid ? invalidStyle : inputStyle}
          />
          {submitted && !phoneValid && (
            <span style={{ color: "#ef4444", fontSize: 13, marginTop: 4, display: "block" }}>
              Enter a valid 10-digit US phone number
            </span>
          )}
        </label>

        {/* ── Logo ───────────────────────────────────────────────────── */}
        <p style={{ ...sectionLabel, marginTop: 8 }}>Location Logo</p>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {logoPreview && (
            <img
              src={logoPreview}
              alt="Logo preview"
              style={{ width: 72, height: 72, objectFit: "contain", borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
          )}
          <div>
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              style={{
                padding: "8px 14px", border: "1px solid #d1d5db", borderRadius: 6,
                background: "white", cursor: "pointer", fontSize: 14, fontWeight: 500,
              }}
            >
              {logoFile ? "Change logo" : "Upload logo"}
            </button>
            {logoFile && (
              <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{logoFile.name}</p>
            )}
            <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>PNG, JPG or SVG · max 2 MB</p>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setLogoFile(file);
                if (file) setLogoPreview(URL.createObjectURL(file));
              }}
            />
          </div>
        </div>

        {/* ── General Manager ────────────────────────────────────────── */}
        <p style={{ ...sectionLabel, marginTop: 8 }}>General Manager</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "block" }}>
            <span style={{ fontWeight: 500 }}>First name{req}</span>
            <input
              value={gmFirst}
              onChange={(e) => setGmFirst(e.target.value)}
              required
              style={inputStyle}
            />
          </label>
          <label style={{ display: "block" }}>
            <span style={{ fontWeight: 500 }}>Last name{req}</span>
            <input
              value={gmLast}
              onChange={(e) => setGmLast(e.target.value)}
              required
              style={inputStyle}
            />
          </label>
        </div>

        <label style={{ display: "block" }}>
          <span style={{ fontWeight: 500 }}>GM phone{req}</span>
          <input
            value={gmPhone}
            onChange={(e) => setGmPhone(formatPhone(e.target.value))}
            required
            placeholder="(555) 555-5555"
            inputMode="tel"
            style={submitted && !gmPhoneValid ? invalidStyle : inputStyle}
          />
          {submitted && !gmPhoneValid && (
            <span style={{ color: "#ef4444", fontSize: 13, marginTop: 4, display: "block" }}>
              Enter a valid 10-digit US phone number
            </span>
          )}
        </label>

        <button
          type="submit"
          disabled={busy}
          style={{
            padding: "12px 0",
            fontWeight: 600,
            backgroundColor: busy ? "#9ca3af" : "#111",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: busy ? "not-allowed" : "pointer",
            marginTop: 8,
          }}
        >
          {busy ? "Creating…" : "Create location"}
        </button>

        {error && (
          <p style={{ padding: 12, borderRadius: 6, background: "#fef2f2", color: "#991b1b", fontSize: 14 }}>
            {error}
          </p>
        )}
      </form>
    </main>
  );
}
