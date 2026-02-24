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
// POST /api/onboarding/invite-supervisor
// Body: { firstName: string; lastName: string; email: string }
// Called during the owner onboarding flow to invite the first GM/supervisor.
// Creates the auth user via invite email + pre-provisions their company_members
// row so the callback routes them straight to the dashboard.
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Caller must be an owner
  const { data: member } = await supabaseAdmin
    .from("company_members")
    .select("role, company_id, location_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || member.role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName  = typeof body.lastName  === "string" ? body.lastName.trim()  : "";
  const email     = typeof body.email     === "string" ? body.email.trim().toLowerCase() : "";

  if (!firstName || !lastName || !email) {
    return NextResponse.json({ error: "firstName, lastName, and email are required" }, { status: 400 });
  }

  const fullName = `${firstName} ${lastName}`;

  // Send the invite — this creates the auth user immediately and returns their ID.
  const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: `${APP_URL}/auth/callback`,
      data: { full_name: fullName },
    }
  );

  if (inviteErr) {
    // If the user is already registered, look them up and link directly.
    const alreadyRegistered =
      inviteErr.message.toLowerCase().includes("already been registered") ||
      inviteErr.message.toLowerCase().includes("already registered");

    if (alreadyRegistered) {
      const { data: existingUserId, error: lookupErr } = await supabaseAdmin
        .rpc("get_auth_user_id_by_email", { p_email: email });

      if (lookupErr || !existingUserId) {
        return NextResponse.json({ error: inviteErr.message }, { status: 500 });
      }

      await supabaseAdmin
        .from("company_members")
        .upsert(
          {
            company_id:  member.company_id,
            user_id:     existingUserId,
            role:        "supervisor",
            location_id: member.location_id,
          },
          { onConflict: "company_id,user_id", ignoreDuplicates: true }
        );

      return NextResponse.json({ sent: false, linked: true, email });
    }

    console.error("[/api/onboarding/invite-supervisor] invite error:", inviteErr.message);
    return NextResponse.json({ error: inviteErr.message }, { status: 500 });
  }

  const newUserId = inviteData.user?.id;
  if (!newUserId) {
    return NextResponse.json({ error: "Invite succeeded but no user ID returned" }, { status: 500 });
  }

  // Pre-provision their company_members row so /api/provision returns hasCompany=true
  // when they accept the invite and land on /auth/callback.
  const { error: memberErr } = await supabaseAdmin
    .from("company_members")
    .insert({
      company_id:  member.company_id,
      user_id:     newUserId,
      role:        "supervisor",
      location_id: member.location_id,
    });

  if (memberErr) {
    console.error("[/api/onboarding/invite-supervisor] company_members insert error:", memberErr.message);
    // Non-fatal: invite was sent; the member row can be fixed manually.
  }

  return NextResponse.json({ sent: true, email });
}
