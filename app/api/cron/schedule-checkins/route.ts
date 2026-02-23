import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ---------------------------------------------------------------------------
// GET /api/cron/schedule-checkins
// Called daily by Vercel Cron (see vercel.json — schedule: "0 6 * * *").
// Runs generate_scheduled_checkins() which creates scheduled check_ins rows
// for upcoming 30/60/90-day new-hire milestones and annual hire-date
// anniversaries. The function is idempotent — safe to call multiple times.
//
// Protected by CRON_SECRET env var. Vercel automatically injects
// Authorization: Bearer <CRON_SECRET> when invoking cron routes.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  // In development with no CRON_SECRET set, allow unauthenticated local calls.
  // In production (CRON_SECRET is set), enforce the Bearer token.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { data, error } = await supabaseAdmin.rpc("generate_scheduled_checkins");

  if (error) {
    console.error("[cron/schedule-checkins] RPC error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log("[cron/schedule-checkins] done:", data);
  return NextResponse.json({ ok: true, result: data });
}
