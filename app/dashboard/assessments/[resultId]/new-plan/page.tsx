import { redirect } from "next/navigation";
import { createClient as createServerSupabase } from "../../../../lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import NewPlanForm from "./NewPlanForm";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export default async function NewPlanPage({
  params,
}: {
  params: Promise<{ resultId: string }>;
}) {
  const { resultId } = await params;

  // Auth gate
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: member } = await supabaseAdmin
    .from("company_members")
    .select("id, role, company_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || !["owner", "supervisor"].includes(member.role)) {
    redirect("/dashboard");
  }

  // Fetch assessment result — must be failed
  const { data: result } = await supabaseAdmin
    .from("assessment_results")
    .select("id, associate_id, template_id, passed")
    .eq("id", resultId)
    .maybeSingle();

  if (!result || result.passed !== false) redirect("/dashboard");

  // Fetch template → target position
  const { data: template } = await supabaseAdmin
    .from("assessment_templates")
    .select("id, position_id, location_id")
    .eq("id", result.template_id)
    .maybeSingle();

  if (!template) redirect("/dashboard");

  // Verify company access
  const { data: assoc } = await supabaseAdmin
    .from("associates")
    .select("id, first_name, last_name, locations(company_id)")
    .eq("id", result.associate_id)
    .maybeSingle();

  if (!assoc) redirect("/dashboard");
  const locData = assoc.locations as { company_id: string } | null;
  if (locData?.company_id !== member.company_id) redirect("/dashboard");

  // Fetch target position title
  const { data: targetPos } = await supabaseAdmin
    .from("positions")
    .select("title")
    .eq("id", template.position_id)
    .maybeSingle();

  const associateName = `${assoc.first_name} ${assoc.last_name}`;
  const targetPosition = targetPos?.title ?? "next tier";

  return (
    <NewPlanForm
      resultId={resultId}
      associateId={result.associate_id}
      associateName={associateName}
      targetPosition={targetPosition}
    />
  );
}
