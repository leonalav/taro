/* ------------------------------------------------------------------
 * Statistics presentation. All activity counters are derived from local
 * recorded usage in StatisticsPage.
 * ------------------------------------------------------------------ */

export interface StatCard {
  id: string;
  label: string;
  value: string;
  hint: string;
}

export const statCards: StatCard[] = [
  { id: "designs", label: "Design plans", value: "0", hint: "Saved on this device" },
  { id: "lines", label: "Lines of code by AI", value: "0", hint: "0 added this month" },
  { id: "messages", label: "Messages sent to AI", value: "0", hint: "0 this month" },
  { id: "tasks", label: "Tasks completed", value: "0", hint: "Completed and described" },
];

export interface HeatDay {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  count: number;
  label: string;
}

export const heatmapRanges = [
  { id: "1m", label: "1M", months: 1 },
  { id: "3m", label: "3M", months: 3 },
  { id: "6m", label: "6M", months: 6 },
  { id: "9m", label: "9M", months: 9 },
  { id: "12m", label: "12M", months: 12 },
] as const;

export const totalContributions = (days: HeatDay[]) => days.reduce((sum, d) => sum + d.count, 0);

/** CSS colour for a contribution count, matching the green heatmap ramp. */
export function heatColor(count: number) {
  if (count === 0) return "rgba(255,255,255,0.05)";
  if (count <= 2) return "rgba(34,197,94,0.25)";
  if (count <= 4) return "rgba(34,197,94,0.45)";
  if (count <= 8) return "rgba(34,197,94,0.7)";
  return "rgba(34,197,94,0.95)";
}
