"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "../../../../lib/supabase/client";

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
type LocationData = {
  name: string;
  street_address: string | null;
  suite: string | null;
  city: string;
  state: string;
  zip: string | null;
  timezone: string;
  phone: string | null;
  gm_first_name: string | null;
  gm_last_name: string | null;
  gm_phone: string | null;
  logo_url: string | null;
};

export default function EditLocationPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const locationId = params.id;

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
  const [logoFile,        setLogoFile]        = useState<File | null>(null);
  const [logoPreview,     setLogoPreview]     = useState<string | null>(null);
  const [existingLogoUrl, setExistingLogoUrl] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // UI state
  const [loading,   setLoading]   = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [saved,     setSaved]     = useState(false);

  const phoneValid   = isValidPhone(phone);
  const gmPhoneValid = isValidPhone(gmPhone);

  // Load existing location data
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/locations/${locationId}`);
        if (!res.ok) {
          const json = await res.json() as { error?: string };
          setError(json.error ?? "Failed to load location");
          return;
        }
        const loc = await res.json() as LocationData;
        setName(loc.name ?? "");
        setStreetAddress(loc.street_address ?? "");
        setSuite(loc.suite ?? "");
        setCity(loc.city ?? "");
        setZip(loc.zip ?? "");
        setState(loc.state ?? "");
        setTimezone(loc.timezone ?? "America/New_York");
        setPhone(formatPhone(loc.phone ?? ""));
        setGmFirst(loc.gm_first_name ?? "");
        setGmLast(loc.gm_last_name ?? "");
        setGmPhone(formatPhone(loc.gm_phone ?? ""));
        setExistingLogoUrl(loc.logo_url ?? null);
      } catch {
        setError("Failed to load location");
      } finally {
        setLoading(false);
      }
    })();
  }, [locationId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!phoneValid || !gmPhoneValid) return;

    setBusy(true);
    setError(null);
    setSaved(false);

    try {
      // Upload new logo if selected
      let newLogoUrl: string | undefined;
      if (logoFile) {
        const supabase = createClient();
        const ext  = logoFile.name.split(".").pop();
        const path = `location-logos/${locationId}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from("staffappbucket")
          .upload(path, logoFile, { upsert: true });

        if (!uploadErr) {
          const { data: { publicUrl } } = supabase.storage
            .from("staffappbucket")
            .getPublicUrl(path);
          newLogoUrl = publicUrl;
        }
      }

      const patchBody: Record<string, unknown> = {
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
      };
      if (newLogoUrl !== undefined) patchBody.logo_url = newLogoUrl;

      const res = await fetch(`/api/locations/${locationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });

      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to update location");

      if (newLogoUrl) setExistingLogoUrl(newLogoUrl);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main style={{ padding: 24, maxWidth: 560, margin: "0 auto" }}>
        <p style={{ color: "#6b7280" }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 560, margin: "0 auto" }}>
      <button
        onClick={() => router.push("/dashboard")}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "#6b7280", padding: 0, marginBottom: 20, fontSize: 14,
        }}
      >
        ← Back to dashboard
      </button>

      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Edit Location</h1>
      <p style={{ color: "#6b7280", marginTop: 4, marginBottom: 28 }}>
        Update location details and General Manager information.
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
          {(logoPreview || existingLogoUrl) && (
            <img
              src={logoPreview ?? existingLogoUrl!}
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
              {logoFile ? "Change logo" : existingLogoUrl ? "Replace logo" : "Upload logo"}
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
            onClick={() => router.push("/dashboard")}
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
            Location updated successfully.
          </p>
        )}

        {error && (
          <p style={{ padding: 12, borderRadius: 6, background: "#fef2f2", color: "#991b1b", fontSize: 14 }}>
            {error}
          </p>
        )}
      </form>
    </main>
  );
}
