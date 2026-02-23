import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "../../../lib/supabase/server";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Prompt = { id: string; category: string; prompt_text: string; sort_order: number };

// ---------------------------------------------------------------------------
// Role tier logic
// Lead+ = position has is_lead OR is_managerial
// ---------------------------------------------------------------------------
function getRoleLevel(isLead: boolean, isManagerial: boolean): "line" | "lead" {
  return isLead || isManagerial ? "lead" : "line";
}

// Pick one random item from an array, excluding any IDs in the exclude set.
// Falls back to the full pool if every option was excluded.
function pickRandom(pool: Prompt[], excludeIds: Set<string>): Prompt | null {
  if (pool.length === 0) return null;
  const filtered = pool.filter((p) => !excludeIds.has(p.id));
  const source = filtered.length > 0 ? filtered : pool; // fallback: ignore exclusions
  return source[Math.floor(Math.random() * source.length)];
}

// ---------------------------------------------------------------------------
// GET /api/checkins/suggest?associateId=<uuid>
// ---------------------------------------------------------------------------
export async function GET(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Caller must be owner or supervisor
  const { data: member } = await supabaseAdmin
    .from("company_members")
    .select("role, company_id, location_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || !["owner", "supervisor"].includes(member.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse query param
  const { searchParams } = new URL(req.url);
  const associateId = searchParams.get("associateId")?.trim() ?? "";
  if (!associateId) {
    return NextResponse.json({ error: "associateId is required" }, { status: 400 });
  }

  // Fetch associate + their position (for role level)
  const { data: assoc } = await supabaseAdmin
    .from("associates")
    .select(
      "id, location_id, position_id, locations(company_id), positions(is_lead, is_managerial)"
    )
    .eq("id", associateId)
    .maybeSingle();

  if (!assoc) {
    return NextResponse.json({ error: "Associate not found" }, { status: 404 });
  }

  // Verify same company
  const companyId = (assoc.locations as { company_id: string } | null)?.company_id;
  if (companyId !== member.company_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Supervisors can only run suggest for associates at their location
  if (member.role === "supervisor" && assoc.location_id !== member.location_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Determine role level
  const pos = assoc.positions as { is_lead: boolean; is_managerial: boolean } | null;
  const roleLevel = getRoleLevel(pos?.is_lead ?? false, pos?.is_managerial ?? false);

  // Get prompt IDs used in the last 2 completed check-ins for this associate
  const { data: recentCheckins } = await supabaseAdmin
    .from("check_ins")
    .select("id")
    .eq("associate_id", associateId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(2);

  const recentIds = (recentCheckins ?? []).map((c: { id: string }) => c.id);

  let excludePromptIds: Set<string> = new Set();
  if (recentIds.length > 0) {
    const { data: usedPrompts } = await supabaseAdmin
      .from("checkin_prompts")
      .select("prompt_id")
      .in("checkin_id", recentIds);

    excludePromptIds = new Set((usedPrompts ?? []).map((p: { prompt_id: string }) => p.prompt_id));
  }

  // Fetch all prompts grouped by category
  const { data: allPrompts } = await supabaseAdmin
    .from("prompts")
    .select("id, category, prompt_text, sort_order")
    .order("sort_order");

  const byCategory: Record<string, Prompt[]> = {
    clarity: [],
    capacity: [],
    competence: [],
    connection: [],
  };

  for (const p of allPrompts ?? []) {
    byCategory[p.category]?.push(p as Prompt);
  }

  // Pick 1 per category (rotation logic: exclude recently used, fallback to full pool)
  const suggestions: Prompt[] = [];
  for (const category of ["clarity", "capacity", "competence", "connection"] as const) {
    const pick = pickRandom(byCategory[category], excludePromptIds);
    if (pick) suggestions.push(pick);
  }

  return NextResponse.json({ roleLevel, suggestions });
}
