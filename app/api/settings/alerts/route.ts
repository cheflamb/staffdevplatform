import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "../../../lib/supabase/server";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const VALID_REASONS  = ["discriminatory_language", "concern_keywords", "concern_tags", "low_scores"] as const;
const VALID_ROLES    = ["owner", "supervisor", "both"] as const;
const VALID_URGENCY  = ["immediate", "next_login"] as const;

// ---------------------------------------------------------------------------
// GET /api/settings/alerts
// Returns all alert_settings rows for the caller's company.
// Accessible to owners and supervisors (read-only for supervisors).
// ---------------------------------------------------------------------------
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: member } = await supabaseAdmin
    .from("company_members")
    .select("company_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: settings, error } = await supabaseAdmin
    .from("alert_settings")
    .select("flag_reason, notify_role, urgency")
    .eq("company_id", member.company_id)
    .order("flag_reason");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ settings, role: member.role });
}

// ---------------------------------------------------------------------------
// PATCH /api/settings/alerts
// Body: { flagReason, notifyRole, urgency }
// Updates (upserts) a single flag_reason's escalation config.
// Owner only.
// ---------------------------------------------------------------------------
export async function PATCH(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: member } = await supabaseAdmin
    .from("company_members")
    .select("company_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || member.role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const flagReason = String(body.flagReason ?? "").trim();
  const notifyRole = String(body.notifyRole ?? "").trim();
  const urgency    = String(body.urgency    ?? "").trim();

  if (!(VALID_REASONS as readonly string[]).includes(flagReason)) {
    return NextResponse.json({ error: "Invalid flagReason" }, { status: 400 });
  }
  if (!(VALID_ROLES as readonly string[]).includes(notifyRole)) {
    return NextResponse.json({ error: "Invalid notifyRole" }, { status: 400 });
  }
  if (!(VALID_URGENCY as readonly string[]).includes(urgency)) {
    return NextResponse.json({ error: "Invalid urgency" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("alert_settings")
    .upsert(
      {
        company_id:  member.company_id,
        flag_reason: flagReason,
        notify_role: notifyRole,
        urgency,
        updated_at:  new Date().toISOString(),
      },
      { onConflict: "company_id,flag_reason" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ updated: true });
}
