import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "../../lib/supabase/server";

// PATCH /api/profile — update the authenticated user's profile fields
export async function PATCH(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const fullName  = String(body.fullName  ?? "").trim();
  const phone     = String(body.phone     ?? "").trim();
  const jobTitle  = String(body.jobTitle  ?? "").trim();

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, phone, job_title: jobTitle })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ updated: true });
}
