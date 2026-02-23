import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "../../../../lib/supabase/server";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ---------------------------------------------------------------------------
// PATCH /api/checkins/[id]/review
// Body: { note?: string }
// Marks a flagged check-in as reviewed by the caller.
// Caller must be owner or supervisor with access to the check-in's location.
// ---------------------------------------------------------------------------
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: checkinId } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Caller membership
  const { data: member } = await supabaseAdmin
    .from("company_members")
    .select("id, role, company_id, location_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || !["owner", "supervisor"].includes(member.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch the check-in to verify location access
  const { data: checkin } = await supabaseAdmin
    .from("check_ins")
    .select("id, location_id, flagged, locations(company_id)")
    .eq("id", checkinId)
    .maybeSingle();

  if (!checkin) return NextResponse.json({ error: "Check-in not found" }, { status: 404 });

  const companyId = (checkin.locations as { company_id: string } | null)?.company_id;
  if (companyId !== member.company_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (member.role === "supervisor" && checkin.location_id !== member.location_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const note = typeof body.note === "string" ? body.note.trim() : null;

  const { error } = await supabaseAdmin
    .from("check_ins")
    .update({
      reviewed_at: new Date().toISOString(),
      review_note: note || null,
    })
    .eq("id", checkinId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ reviewed: true });
}
