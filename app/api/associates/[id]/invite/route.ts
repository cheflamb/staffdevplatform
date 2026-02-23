import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "../../../../lib/supabase/server";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// ---------------------------------------------------------------------------
// POST /api/associates/[id]/invite
// Resends (or sends for the first time) a Supabase invite email to an
// associate whose user_id is still null — i.e. they haven't accepted yet.
// Caller must be owner or supervisor with access to the associate's location.
// ---------------------------------------------------------------------------
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: associateId } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Caller membership
  const { data: member } = await supabaseAdmin
    .from("company_members")
    .select("role, company_id, location_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || !["owner", "supervisor"].includes(member.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch the associate
  const { data: associate } = await supabaseAdmin
    .from("associates")
    .select("id, email, first_name, last_name, user_id, location_id, locations(company_id)")
    .eq("id", associateId)
    .maybeSingle();

  if (!associate) {
    return NextResponse.json({ error: "Associate not found" }, { status: 404 });
  }

  // Verify location access
  const companyId = (associate.locations as { company_id: string } | null)?.company_id;
  if (companyId !== member.company_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (member.role === "supervisor" && associate.location_id !== member.location_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!associate.email) {
    return NextResponse.json({ error: "Associate has no email address on file" }, { status: 400 });
  }

  if (associate.user_id) {
    return NextResponse.json({ error: "Associate has already accepted their invite" }, { status: 409 });
  }

  // Resend the invite — Supabase generates a fresh link and invalidates the old one
  const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    associate.email,
    {
      redirectTo: `${APP_URL}/auth/callback`,
      data: { full_name: `${associate.first_name} ${associate.last_name}` },
    }
  );

  if (inviteErr) {
    // If the email is already registered (e.g. an owner was also added as an
    // associate), link the existing auth user directly instead of re-inviting.
    const alreadyRegistered =
      inviteErr.message.toLowerCase().includes("already been registered") ||
      inviteErr.message.toLowerCase().includes("already registered");

    if (alreadyRegistered) {
      const { data: existingUserId, error: lookupErr } = await supabaseAdmin
        .rpc("get_auth_user_id_by_email", { p_email: associate.email });

      if (lookupErr || !existingUserId) {
        console.error("[/api/associates/[id]/invite] lookup error:", lookupErr?.message);
        return NextResponse.json({ error: inviteErr.message }, { status: 500 });
      }

      // Link associate row to the existing auth user
      await supabaseAdmin
        .from("associates")
        .update({ user_id: existingUserId })
        .eq("id", associateId);

      // Ensure a company_members row exists for this user as an associate
      await supabaseAdmin
        .from("company_members")
        .upsert(
          {
            company_id:  companyId,
            user_id:     existingUserId,
            role:        "associate",
            location_id: associate.location_id,
          },
          { onConflict: "company_id,user_id", ignoreDuplicates: true }
        );

      return NextResponse.json({ sent: false, linked: true, email: associate.email });
    }

    console.error("[/api/associates/[id]/invite] resend error:", inviteErr.message);
    return NextResponse.json({ error: inviteErr.message }, { status: 500 });
  }

  return NextResponse.json({ sent: true, email: associate.email });
}
