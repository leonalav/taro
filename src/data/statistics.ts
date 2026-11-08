/* ------------------------------------------------------------------
 * Scaffold statistics. AI message/code counters are replaced with local
 * recorded usage in StatisticsPage; the remaining figures are sample data.
 * ------------------------------------------------------------------ */

export interface StatCard {
  id: string;
  label: string;
  value: string;
  hint: string;
}

export const statCards: StatCard[] = [
  { id: "designs", label: "Designs built", value: "128", hint: "12 in the last 30 days" },
  { id: "lines", label: "Lines of code by AI", value: "0", hint: "0 added this month" },
  { id: "messages", label: "Messages sent to AI", value: "0", hint: "0 this month" },
  { id: "credits", label: "Credits left", value: "7,840", hint: "resets on the 1st" },
];

export const creditsUsed = { used: 2160, total: 10000 };

/** Designs built per week, oldest → newest. */
export const designsTrend = [
  4, 6, 5, 8, 7, 11, 9, 14, 12, 18, 16, 22, 19, 26, 24, 31, 28, 36, 34, 42, 39, 48, 45, 53,
];

export interface HeatDay {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  count: number;
  label: string;
}

/** Deterministic pseudo-random so the heatmap is stable between renders. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function buildHeatmap(months: number, end = new Date()): HeatDay[] {
  const rand = seeded(months * 7919 + 13);
  const days: HeatDay[] = [];
  const start = new Date(end);
  start.setMonth(start.getMonth() - months);
  start.setDate(1);

  const cursor = new Date(start);
  while (cursor <= end) {
    const weekday = cursor.getDay();
    const weekend = weekday === 0 || weekday === 6;
    const base = weekend ? 0.15 : 0.62;
    const roll = rand();
    let count = 0;
    if (roll < base) count = 0;
    else if (roll < 0.8) count = 1 + Math.floor(rand() * 3);
    else if (roll < 0.94) count = 4 + Math.floor(rand() * 5);
    else count = 9 + Math.floor(rand() * 8);

    const month = MONTHS[cursor.getMonth()];
    days.push({
      date: cursor.toISOString().slice(0, 10),
      count,
      label: `${DAYS[weekday]}, ${month} ${cursor.getDate()} · ${count} contribution${count === 1 ? "" : "s"}`,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
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
