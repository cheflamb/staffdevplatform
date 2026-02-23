import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "../../lib/supabase/server";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function isValidUUID(s: unknown): s is string {
  return (
    typeof s === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  );
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: member } = await supabaseAdmin
    .from("company_members")
    .select("id, role, company_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || !["owner", "supervisor"].includes(member.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { associate_id, review_year, scheduled_date } = body;

  if (!isValidUUID(associate_id)) {
    return NextResponse.json({ error: "Invalid associate_id" }, { status: 400 });
  }

  const yearNum = typeof review_year === "number" ? review_year : Number(review_year);
  if (!Number.isInteger(yearNum) || yearNum < 2020 || yearNum > 2100) {
    return NextResponse.json({ error: "Invalid review_year" }, { status: 400 });
  }

  // Verify associate belongs to caller's company
  const { data: assoc } = await supabaseAdmin
    .from("associates")
    .select("id, location_id, locations(company_id)")
    .eq("id", associate_id)
    .maybeSingle();

  if (!assoc) {
    return NextResponse.json({ error: "Associate not found" }, { status: 404 });
  }

  const locationData = assoc.locations as { company_id: string } | null;
  if (locationData?.company_id !== member.company_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Check no existing non-completed review for same associate + year
  const { data: existing } = await supabaseAdmin
    .from("reviews")
    .select("id, status")
    .eq("associate_id", associate_id)
    .eq("review_year", yearNum)
    .neq("status", "completed")
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "An active review already exists for this associate and year", reviewId: existing.id },
      { status: 409 }
    );
  }

  const insertData: Record<string, unknown> = {
    associate_id,
    location_id: assoc.location_id,
    type: "annual",
    status: "pending_self",
    review_year: yearNum,
  };

  if (scheduled_date && typeof scheduled_date === "string") {
    insertData.scheduled_date = scheduled_date;
  }

  const { data: review, error: insertErr } = await supabaseAdmin
    .from("reviews")
    .insert(insertData)
    .select("id")
    .single();

  if (insertErr || !review) {
    return NextResponse.json({ error: "Failed to create review" }, { status: 500 });
  }

  return NextResponse.json({ reviewId: review.id });
}
