import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "../../../../lib/supabase/server";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import AssociateRecordPDF from "../../../../components/AssociateRecordPDF";
import type {
  PDFAssociate,
  PDFIncident,
  PDFCheckin,
  PDFReview,
  PDFAssessment,
  PDFProgressionPlan,
} from "../../../../components/AssociateRecordPDF";

export const runtime = "nodejs";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Auth
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: member } = await supabaseAdmin
    .from("company_members")
    .select("role, company_id, location_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || !["owner", "supervisor"].includes(member.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify associate belongs to caller's company
  const { data: assoc } = await supabaseAdmin
    .from("associates")
    .select(
      "id, first_name, last_name, hire_date, status, location_id, " +
      "positions(title), departments(name), stations(name), locations(name, company_id)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!assoc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const locData = assoc.locations as { name: string; company_id: string } | null;
  if (locData?.company_id !== member.company_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (member.role === "supervisor" && assoc.location_id !== member.location_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parallel data fetch
  const [
    { data: incidents },
    { data: checkins },
    { data: reviews },
    { data: assessments },
    { data: plans },
  ] = await Promise.all([
    supabaseAdmin
      .from("incidents")
      .select("id, date, type, description, associate_response")
      .eq("associate_id", id)
      .order("date", { ascending: false }),

    supabaseAdmin
      .from("check_ins")
      .select("id, completed_at, type, notes_summary, followup_commitment")
      .eq("associate_id", id)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(100),

    supabaseAdmin
      .from("reviews")
      .select("id, review_year, status")
      .eq("associate_id", id)
      .eq("status", "completed")
      .order("review_year", { ascending: false }),

    supabaseAdmin
      .from("assessment_results")
      .select("id, date, passed, notes, current_classification, proposed_classification, assessment_templates(title)")
      .eq("associate_id", id)
      .order("date", { ascending: false }),

    supabaseAdmin
      .from("progression_plans")
      .select(`
        id, outcome, created_at,
        positions:target_position_id ( title ),
        progression_milestones ( day_target, goal_text, status )
      `)
      .eq("associate_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const associate: PDFAssociate = {
    first_name:  assoc.first_name,
    last_name:   assoc.last_name,
    hire_date:   assoc.hire_date,
    status:      assoc.status,
    positions:   assoc.positions as { title: string } | null,
    departments: assoc.departments as { name: string } | null,
    stations:    assoc.stations as { name: string } | null,
    locations:   locData ? { name: locData.name } : null,
  };

  const generatedAt = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const buffer = await renderToBuffer(
    React.createElement(AssociateRecordPDF, {
      associate,
      incidents:   (incidents ?? []) as PDFIncident[],
      checkins:    (checkins  ?? []) as PDFCheckin[],
      reviews:     (reviews   ?? []) as PDFReview[],
      assessments: (assessments ?? []) as PDFAssessment[],
      plans:       (plans ?? []) as PDFProgressionPlan[],
      generatedAt,
    })
  );

  const filename = `${assoc.first_name}-${assoc.last_name}-record.pdf`
    .replace(/[^a-z0-9-]/gi, "-")
    .toLowerCase();

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
