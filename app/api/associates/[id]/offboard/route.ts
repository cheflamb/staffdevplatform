import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "../../../../lib/supabase/server";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Auth
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: member } = await supabaseAdmin
    .from("company_members")
    .select("id, role, company_id, location_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || !["owner", "supervisor"].includes(member.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch associate
  const { data: assoc } = await supabaseAdmin
    .from("associates")
    .select("id, first_name, last_name, status, location_id, user_id, locations(company_id)")
    .eq("id", id)
    .maybeSingle();

  if (!assoc) return NextResponse.json({ error: "Associate not found" }, { status: 404 });

  const locData = assoc.locations as unknown as { company_id: string } | null;
  if (locData?.company_id !== member.company_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (member.role === "supervisor" && assoc.location_id !== member.location_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (assoc.status === "terminated") {
    return NextResponse.json({ error: "Associate is already terminated" }, { status: 409 });
  }

  // Validate reason
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json({ error: "Reason is required" }, { status: 400 });
  }
  if (reason.length > 2000) {
    return NextResponse.json({ error: "Reason must be 2000 characters or fewer" }, { status: 400 });
  }

  // Set status to terminated
  const { error: statusErr } = await supabaseAdmin
    .from("associates")
    .update({ status: "terminated" })
    .eq("id", id);

  if (statusErr) {
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }

  // Log termination incident (immutable record)
  const today = new Date().toISOString().slice(0, 10);
  await supabaseAdmin
    .from("incidents")
    .insert({
      associate_id: id,
      type:         "termination",
      date:         today,
      description:  reason,
      location_id:  assoc.location_id,
      recorded_by:  member.id,
    });

  // Notify associate if they have an account
  if (assoc.user_id) {
    const { data: assocMember } = await supabaseAdmin
      .from("company_members")
      .select("id")
      .eq("user_id", assoc.user_id as string)
      .maybeSingle();

    if (assocMember) {
      await supabaseAdmin
        .from("notifications")
        .insert({
          user_id: assoc.user_id as string,
          title:   "Employment status update",
          body:    "Your employment status has been updated. Please contact your manager if you have questions.",
          link:    "/dashboard/associate",
        });
    }
  }

  return NextResponse.json({ ok: true });
}
