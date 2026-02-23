"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../../lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ChecklistItem = { id: string; item_text: string; sort_order: number };

type MilestoneTemplate = {
  id: string;
  day_target: number;
  title: string;
  purpose: string;
  suggested_script: string | null;
  duration_minutes: number;
  checklist_items: ChecklistItem[];
};

type CompletionRow = {
  id: string;
  milestone_id: string;
  status: "pending" | "completed" | "skipped";
  completed_at: string | null;
  notes: string | null;
  checklist_state: Record<string, boolean>;
};

type PlanData = {
  id: string;
  department_type: "BOH" | "FOH";
  start_date: string;
  status: string;
};

type AssociateInfo = {
  id: string;
  first_name: string;
  last_name: string;
  hire_date: string;
  location_id: string;
  locations: { name: string } | null;
};

type MilestoneDisplayItem = {
  milestone: MilestoneTemplate;
  completion: CompletionRow | null;
  milestoneDate: Date;
  daysFromNow: number; // negative = overdue
};

type FormState = {
  checklistState: Record<string, boolean>;
  notes: string;
  busy: boolean;
  error: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function statusBadge(
  item: MilestoneDisplayItem
): { label: string; bg: string; text: string } {
  const s = item.completion?.status ?? "pending";
  if (s === "completed") return { label: "Done",    bg: "#d1fae5", text: "#065f46" };
  if (s === "skipped")   return { label: "Skipped", bg: "#f3f4f6", text: "#6b7280" };
  if (item.daysFromNow < 0) return { label: "Overdue",    bg: "#fee2e2", text: "#991b1b" };
  if (item.daysFromNow <= 7) return { label: "Due soon",  bg: "#fef3c7", text: "#92400e" };
  return { label: "Upcoming", bg: "#eff6ff", text: "#1d4ed8" };
}

function formatDate(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function MilestonePlanPage() {
  const router = useRouter();
  const params = useParams<{ associateId: string }>();
  const associateId = params.associateId;

  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [callerRole,   setCallerRole]   = useState<string>("");
  const [associate,    setAssociate]    = useState<AssociateInfo | null>(null);
  const [plan,         setPlan]         = useState<PlanData | null>(null);
  const [items,        setItems]        = useState<MilestoneDisplayItem[]>([]);

  // Plan creation state (when no plan exists)
  const [deptType,     setDeptType]     = useState<"BOH" | "FOH">("BOH");
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [createError,  setCreateError]  = useState<string | null>(null);

  // Inline completion form state
  const [expanded,     setExpanded]     = useState<string | null>(null); // milestone.id
  const [forms,        setForms]        = useState<Record<string, FormState>>({});

  // ---------------------------------------------------------------------------
  // Load data
  // ---------------------------------------------------------------------------
  const loadPlan = useCallback(async (planId: string, deptTypeVal: "BOH" | "FOH", hireDate: string) => {
    const supabase = createClient();

    const [{ data: milestones }, { data: completions }] = await Promise.all([
      supabase
        .from("ninety_day_milestones")
        .select("id, day_target, title, purpose, suggested_script, duration_minutes")
        .eq("department_type", deptTypeVal)
        .order("day_target"),
      supabase
        .from("ninety_day_completions")
        .select("id, milestone_id, status, completed_at, notes, checklist_state")
        .eq("plan_id", planId),
    ]);

    const milestoneIds = (milestones ?? []).map((m) => m.id);

    const { data: checklistItems } = await supabase
      .from("ninety_day_checklist_items")
      .select("id, milestone_id, item_text, sort_order")
      .in("milestone_id", milestoneIds)
      .order("sort_order");

    const today = new Date();
    const hire  = new Date(hireDate + "T00:00:00");

    const displayItems: MilestoneDisplayItem[] = (milestones ?? []).map((m) => {
      const milestoneDate = new Date(hire.getTime() + m.day_target * 86_400_000);
      const daysFromNow   = Math.floor((milestoneDate.getTime() - today.getTime()) / 86_400_000);
      const completion    = ((completions ?? []) as CompletionRow[]).find(
        (c) => c.milestone_id === m.id
      ) ?? null;
      const checklist = ((checklistItems ?? []) as { id: string; milestone_id: string; item_text: string; sort_order: number }[])
        .filter((ci) => ci.milestone_id === m.id)
        .sort((a, b) => a.sort_order - b.sort_order);

      return {
        milestone: { ...m, checklist_items: checklist },
        completion,
        milestoneDate,
        daysFromNow,
      };
    });

    setItems(displayItems);

    // Initialise form state for each pending completion
    const initialForms: Record<string, FormState> = {};
    for (const di of displayItems) {
      if (di.completion?.status === "pending") {
        const initChecklist: Record<string, boolean> = {};
        for (const ci of di.milestone.checklist_items) {
          initChecklist[ci.id] = false;
        }
        initialForms[di.milestone.id] = {
          checklistState: initChecklist,
          notes: "",
          busy: false,
          error: null,
        };
      }
    }
    setForms(initialForms);
  }, []);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const { data: m } = await supabase
        .from("company_members")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!m || !["owner", "supervisor"].includes(m.role)) {
        router.replace("/dashboard");
        return;
      }
      setCallerRole(m.role);

      const { data: assoc } = await supabase
        .from("associates")
        .select("id, first_name, last_name, hire_date, location_id, locations(name)")
        .eq("id", associateId)
        .maybeSingle();

      if (!assoc) { setError("Associate not found."); setLoading(false); return; }
      setAssociate(assoc as AssociateInfo);

      const { data: planData } = await supabase
        .from("ninety_day_plans")
        .select("id, department_type, start_date, status")
        .eq("associate_id", associateId)
        .maybeSingle();

      if (planData) {
        setPlan(planData as PlanData);
        await loadPlan(planData.id, planData.department_type as "BOH" | "FOH", assoc.hire_date);
      }

      setLoading(false);
    })();
  }, [associateId, router, loadPlan]);

  // ---------------------------------------------------------------------------
  // Create plan
  // ---------------------------------------------------------------------------
  async function onCreatePlan() {
    setCreatingPlan(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/milestones/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ associateId, departmentType: deptType }),
      });
      const json = await res.json() as { error?: string; planId?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to create plan");

      // Reload plan data
      const supabase = createClient();
      const { data: planData } = await supabase
        .from("ninety_day_plans")
        .select("id, department_type, start_date, status")
        .eq("associate_id", associateId)
        .maybeSingle();

      if (planData && associate) {
        setPlan(planData as PlanData);
        await loadPlan(planData.id, planData.department_type as "BOH" | "FOH", associate.hire_date);
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setCreatingPlan(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Toggle checklist item
  // ---------------------------------------------------------------------------
  function toggleChecklist(milestoneId: string, itemId: string) {
    setForms((prev) => ({
      ...prev,
      [milestoneId]: {
        ...prev[milestoneId],
        checklistState: {
          ...prev[milestoneId].checklistState,
          [itemId]: !prev[milestoneId].checklistState[itemId],
        },
      },
    }));
  }

  // ---------------------------------------------------------------------------
  // Complete / skip
  // ---------------------------------------------------------------------------
  async function onComplete(
    completionId: string,
    milestoneId: string,
    action: "completed" | "skipped"
  ) {
    const form = forms[milestoneId];
    if (!form) return;

    setForms((prev) => ({
      ...prev,
      [milestoneId]: { ...prev[milestoneId], busy: true, error: null },
    }));

    try {
      const res = await fetch(`/api/milestones/completions/${completionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status:         action,
          checklistState: form.checklistState,
          notes:          form.notes,
        }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to save");

      // Update local state
      setItems((prev) =>
        prev.map((di) =>
          di.milestone.id === milestoneId
            ? {
                ...di,
                completion: {
                  ...di.completion!,
                  status: action,
                  completed_at: new Date().toISOString(),
                  notes: form.notes || null,
                  checklist_state: form.checklistState,
                },
              }
            : di
        )
      );
      setExpanded(null);
    } catch (err) {
      setForms((prev) => ({
        ...prev,
        [milestoneId]: {
          ...prev[milestoneId],
          busy: false,
          error: err instanceof Error ? err.message : "Something went wrong",
        },
      }));
    }
  }

  // ---------------------------------------------------------------------------
  // Render: loading / error
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <main style={{ padding: 24, maxWidth: 680, margin: "0 auto" }}>
        <p style={{ color: "#6b7280" }}>Loading…</p>
      </main>
    );
  }

  if (error || !associate) {
    return (
      <main style={{ padding: 24, maxWidth: 680, margin: "0 auto" }}>
        <p style={{ color: "#991b1b" }}>{error ?? "Associate not found."}</p>
      </main>
    );
  }

  const hireDate   = new Date(associate.hire_date + "T00:00:00");
  const daysInRole = Math.floor((Date.now() - hireDate.getTime()) / 86_400_000);
  const pct90      = Math.min(100, Math.round((daysInRole / 90) * 100));

  // ---------------------------------------------------------------------------
  // Render: main
  // ---------------------------------------------------------------------------
  return (
    <main style={{ padding: 24, maxWidth: 680, margin: "0 auto" }}>
      {/* Back */}
      <Link
        href={`/dashboard/associates/${associateId}`}
        style={{ color: "#6b7280", fontSize: 14, textDecoration: "none" }}
      >
        ← {associate.first_name} {associate.last_name}
      </Link>

      {/* Header */}
      <div style={{ marginTop: 16, marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700 }}>90-Day Plan</h1>
            <p style={{ color: "#6b7280", fontSize: 14, marginTop: 3 }}>
              {associate.first_name} {associate.last_name}
              {associate.locations?.name ? ` · ${associate.locations.name}` : ""}
            </p>
          </div>
          {plan && (
            <span style={{
              fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 10,
              background: plan.department_type === "BOH" ? "#fef3c7" : "#eff6ff",
              color:      plan.department_type === "BOH" ? "#92400e" : "#1d4ed8",
            }}>
              {plan.department_type}
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>
            <span>Day {daysInRole} of 90</span>
            <span>Hired {formatDate(hireDate)}</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: "#e5e7eb", overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${pct90}%`,
              background: daysInRole > 90 ? "#10b981" : "#6366f1",
              borderRadius: 3,
              transition: "width 0.3s",
            }} />
          </div>
          {/* Milestone markers */}
          <div style={{ position: "relative", height: 16 }}>
            {[30, 60, 90].map((d) => {
              const left = Math.min(99, (d / 90) * 100);
              return (
                <span
                  key={d}
                  style={{
                    position: "absolute",
                    left: `${left}%`,
                    transform: "translateX(-50%)",
                    fontSize: 10,
                    color: daysInRole >= d ? "#6366f1" : "#9ca3af",
                    fontWeight: 600,
                  }}
                >
                  {d}d
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── No plan yet ─────────────────────────────────────────────────── */}
      {!plan && (
        <div style={{
          padding: "24px",
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Begin 90-Day Plan</h2>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
            Select the associate&apos;s track to load the milestone conversations and checklists.
          </p>

          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            {(["BOH", "FOH"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setDeptType(t)}
                style={{
                  flex: 1,
                  padding: "12px 0",
                  borderRadius: 6,
                  border: deptType === t ? "2px solid #6366f1" : "1px solid #d1d5db",
                  background: deptType === t ? "#eef2ff" : "white",
                  color: deptType === t ? "#4338ca" : "#374151",
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: "pointer",
                }}
              >
                {t}
                <span style={{ display: "block", fontSize: 11, fontWeight: 400, color: deptType === t ? "#6366f1" : "#9ca3af" }}>
                  {t === "BOH" ? "Back of house" : "Front of house"}
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onCreatePlan}
            disabled={creatingPlan}
            style={{
              width: "100%",
              padding: "12px 0",
              borderRadius: 6,
              border: "none",
              background: creatingPlan ? "#9ca3af" : "#111",
              color: "white",
              fontWeight: 600,
              fontSize: 14,
              cursor: creatingPlan ? "not-allowed" : "pointer",
            }}
          >
            {creatingPlan ? "Creating plan…" : "Start 90-Day Plan"}
          </button>

          {createError && (
            <p style={{ marginTop: 10, fontSize: 13, color: "#991b1b" }}>{createError}</p>
          )}
        </div>
      )}

      {/* ── Plan milestone timeline ─────────────────────────────────────── */}
      {plan && items.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((di) => {
            const badge      = statusBadge(di);
            const isActionable =
              di.completion?.status === "pending" &&
              (callerRole === "owner" || callerRole === "supervisor");
            const isExpanded = expanded === di.milestone.id;
            const form       = forms[di.milestone.id];
            const isDone     = di.completion?.status === "completed";
            const isSkipped  = di.completion?.status === "skipped";

            return (
              <div
                key={di.milestone.id}
                style={{
                  borderRadius: 8,
                  border: di.daysFromNow < 0 && di.completion?.status === "pending"
                    ? "1px solid #fca5a5"
                    : "1px solid #e5e7eb",
                  backgroundColor: isDone ? "#f9fafb" : di.daysFromNow < 0 && di.completion?.status === "pending" ? "#fff5f5" : "white",
                  overflow: "hidden",
                }}
              >
                {/* Row header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 16px",
                    cursor: isActionable ? "pointer" : "default",
                    opacity: isSkipped ? 0.6 : 1,
                  }}
                  onClick={() => isActionable && setExpanded(isExpanded ? null : di.milestone.id)}
                >
                  {/* Day badge */}
                  <div style={{
                    minWidth: 44,
                    height: 44,
                    borderRadius: 8,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    background: isDone ? "#d1fae5" : isSkipped ? "#f3f4f6" : di.daysFromNow < 0 ? "#fee2e2" : "#f3f4f6",
                    flexShrink: 0,
                  }}>
                    <span style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: isDone ? "#065f46" : isSkipped ? "#9ca3af" : di.daysFromNow < 0 ? "#991b1b" : "#374151",
                      lineHeight: 1,
                    }}>
                      {di.milestone.day_target}
                    </span>
                    <span style={{ fontSize: 9, color: "#9ca3af", fontWeight: 500 }}>DAY</span>
                  </div>

                  {/* Title + date */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>
                        {di.milestone.title}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        padding: "1px 7px", borderRadius: 10,
                        background: badge.bg, color: badge.text,
                      }}>
                        {badge.label}
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                      {formatDate(di.milestoneDate)}
                      {di.daysFromNow < 0 && di.completion?.status === "pending"
                        ? ` · ${Math.abs(di.daysFromNow)} day${Math.abs(di.daysFromNow) === 1 ? "" : "s"} overdue`
                        : di.daysFromNow >= 0 && di.daysFromNow <= 30 && di.completion?.status === "pending"
                        ? ` · in ${di.daysFromNow} day${di.daysFromNow === 1 ? "" : "s"}`
                        : ""}
                    </p>
                    {/* Completion notes preview */}
                    {isDone && di.completion?.notes && (
                      <p style={{ fontSize: 12, color: "#6b7280", marginTop: 3, fontStyle: "italic" }}>
                        &ldquo;{di.completion.notes}&rdquo;
                      </p>
                    )}
                  </div>

                  {/* Expand / action indicator */}
                  {isActionable && (
                    <span style={{ fontSize: 18, color: "#9ca3af", flexShrink: 0 }}>
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  )}
                  {isDone && (
                    <span style={{ fontSize: 16, color: "#10b981", flexShrink: 0 }}>✓</span>
                  )}
                </div>

                {/* Expanded form */}
                {isExpanded && form && (
                  <div style={{
                    borderTop: "1px solid #f3f4f6",
                    padding: "16px",
                    background: "#fafafa",
                    display: "grid",
                    gap: 14,
                  }}>
                    {/* Purpose + script */}
                    <div style={{
                      padding: "12px 14px",
                      borderRadius: 6,
                      background: "#eff6ff",
                      border: "1px solid #bfdbfe",
                    }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8", marginBottom: 4 }}>
                        PURPOSE
                      </p>
                      <p style={{ fontSize: 13, color: "#1e40af" }}>{di.milestone.purpose}</p>
                      {di.milestone.suggested_script && (
                        <>
                          <p style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8", marginTop: 10, marginBottom: 4 }}>
                            SUGGESTED OPENER
                          </p>
                          <p style={{ fontSize: 13, color: "#1e40af", fontStyle: "italic" }}>
                            &ldquo;{di.milestone.suggested_script}&rdquo;
                          </p>
                        </>
                      )}
                    </div>

                    {/* Checklist */}
                    {di.milestone.checklist_items.length > 0 && (
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Checklist
                        </p>
                        <div style={{ display: "grid", gap: 8 }}>
                          {di.milestone.checklist_items.map((ci) => (
                            <label
                              key={ci.id}
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 10,
                                cursor: "pointer",
                                fontSize: 14,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={form.checklistState[ci.id] ?? false}
                                onChange={() => toggleChecklist(di.milestone.id, ci.id)}
                                style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, cursor: "pointer" }}
                              />
                              <span style={{
                                textDecoration: form.checklistState[ci.id] ? "line-through" : "none",
                                color: form.checklistState[ci.id] ? "#9ca3af" : "#374151",
                              }}>
                                {ci.item_text}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Notes <span style={{ fontWeight: 400, textTransform: "none" }}>(optional)</span>
                      </p>
                      <textarea
                        value={form.notes}
                        onChange={(e) =>
                          setForms((prev) => ({
                            ...prev,
                            [di.milestone.id]: { ...prev[di.milestone.id], notes: e.target.value },
                          }))
                        }
                        placeholder="What happened in this conversation? Any concerns or highlights…"
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "9px 10px",
                          border: "1px solid #d1d5db",
                          borderRadius: 6,
                          fontSize: 14,
                          fontFamily: "inherit",
                          boxSizing: "border-box",
                          minHeight: 80,
                          resize: "vertical",
                        }}
                      />
                    </div>

                    {/* Error */}
                    {form.error && (
                      <p style={{ padding: "8px 12px", borderRadius: 6, background: "#fef2f2", color: "#991b1b", fontSize: 13 }}>
                        {form.error}
                      </p>
                    )}

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        type="button"
                        onClick={() => onComplete(di.completion!.id, di.milestone.id, "completed")}
                        disabled={form.busy}
                        style={{
                          flex: 1,
                          padding: "11px 0",
                          borderRadius: 6,
                          border: "none",
                          background: form.busy ? "#9ca3af" : "#111",
                          color: "white",
                          fontWeight: 600,
                          fontSize: 14,
                          cursor: form.busy ? "not-allowed" : "pointer",
                        }}
                      >
                        {form.busy ? "Saving…" : "Mark Complete"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onComplete(di.completion!.id, di.milestone.id, "skipped")}
                        disabled={form.busy}
                        style={{
                          padding: "11px 16px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          background: "white",
                          color: "#6b7280",
                          fontWeight: 600,
                          fontSize: 14,
                          cursor: form.busy ? "not-allowed" : "pointer",
                        }}
                      >
                        Skip
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpanded(null)}
                        disabled={form.busy}
                        style={{
                          padding: "11px 12px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          background: "white",
                          color: "#9ca3af",
                          fontSize: 14,
                          cursor: "pointer",
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
