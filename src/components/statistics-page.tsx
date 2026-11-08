import * as React from "react";
import { ArrowLeft, ChartColumn, Info, Gauge, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import {
  creditsUsed,
  designsTrend,
  heatColor,
  heatmapRanges,
  statCards,
  totalContributions,
  buildHeatmap,
  type HeatDay,
} from "@/data/statistics";
import { getUsageMetricsSnapshot, subscribeUsageMetrics, summarizeUsage } from "@/lib/usage-metrics";

interface StatisticsPageProps {
  onBack: () => void;
}

export function StatisticsPage({ onBack }: StatisticsPageProps) {
  const usage = React.useSyncExternalStore(subscribeUsageMetrics, getUsageMetricsSnapshot, getUsageMetricsSnapshot);
  const summary = summarizeUsage(usage);
  const cards = statCards.map(card => card.id === "messages"
    ? { ...card, value: usage.totalMessages.toLocaleString(), hint: `${summary.messagesThisMonth.toLocaleString()} this month` }
    : card.id === "lines"
      ? { ...card, value: usage.totalLinesAdded.toLocaleString(), hint: `${summary.linesAddedThisMonth.toLocaleString()} added this month` }
      : card);
  const [rangeId, setRangeId] = React.useState<string>("6m");
  const range = heatmapRanges.find((r) => r.id === rangeId) ?? heatmapRanges[2];
  const days = React.useMemo(() => buildHeatmap(range.months), [range.months]);
  const total = totalContributions(days);

  return (
    <section className="animate-fade flex min-w-0 flex-1 flex-col bg-background">
      <header className="shrink-0 border-b border-border px-6 pt-5 pb-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to chat" title="Back to chat">
            <ArrowLeft />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ChartColumn className="size-4 text-taro" />
              <h1 className="text-lg font-semibold tracking-tight">Statistics</h1>
            </div>
            <p className="mt-0.5 text-[13px] text-muted-foreground">How you and your agents have been working.</p>
          </div>
        </div>
      </header>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-6">
        {/* Top row: headline stats */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((card) => (
            <div key={card.id} className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] tracking-[0.08em] text-muted-foreground uppercase">{card.label}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">{card.value}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{card.hint}</p>
            </div>
          ))}
        </div>

        {/* Charts row */}
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <BarChart title="Designs built" subtitle="per week, last 24 weeks" data={designsTrend} accent="var(--taro)" unit="designs" />
          <BarChart title="Messages sent" subtitle="per day, last 28 days" data={summary.messagesTrend} accent="#3b9eff" unit="messages" />
        </div>

        {/* Credits */}
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
            <div className="flex items-center gap-2">
              <Zap className="size-3.5 text-amber-400" />
              <p className="text-[11px] tracking-[0.08em] text-muted-foreground uppercase">Credits left</p>
            </div>
            <div className="mt-3 flex items-end gap-3">
              <p className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                {(creditsUsed.total - creditsUsed.used).toLocaleString()}
              </p>
              <p className="pb-1 text-[11px] text-muted-foreground">of {creditsUsed.total.toLocaleString()} this cycle</p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full bg-amber-400/80" style={{ width: `${(creditsUsed.used / creditsUsed.total) * 100}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {creditsUsed.used.toLocaleString()} used · resets on the 1st of next month
            </p>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-4">
            <div>
              <div className="flex items-center gap-2">
                <Gauge className="size-3.5 text-taro" />
                <p className="text-[11px] tracking-[0.08em] text-muted-foreground uppercase">Design score</p>
              </div>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground tabular-nums">92</p>
              <p className="mt-1 text-[11px] text-muted-foreground">avg across last 12 reviews</p>
            </div>
            <Badge variant="success" className="mt-3 w-fit">+4 vs last month</Badge>
          </div>
        </div>

        {/* Contribution heatmap */}
        <div className="mt-3 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] font-medium text-foreground">Contributions</p>
            <Badge variant="default">{total.toLocaleString()} in {range.label}</Badge>
            <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5" role="radiogroup" aria-label="Heatmap range">
              {heatmapRanges.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={rangeId === option.id}
                  onClick={() => setRangeId(option.id)}
                  className={cn(
                    "h-6 rounded-md px-2 text-[11px] font-medium transition-colors",
                    rangeId === option.id ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Designs, code and reviews contributed through Taro.</p>

          <Heatmap days={days} months={range.months} />

          <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>Less</span>
            {[0, 1, 3, 6, 10].map((count) => (
              <span key={count} className="size-3 rounded-[3px] ring-1 ring-inset ring-white/10" style={{ backgroundColor: heatColor(count) }} />
            ))}
            <span>More</span>
          </div>
        </div>

        <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground/70">
          <Info className="mt-px size-3 shrink-0" />
          Messages count submitted AI requests. Code counts added lines from successful AI Write, Edit and notebook code-cell changes, including replacements. These counters are stored on this device from now on; other figures are sample data.
        </p>
        <div className="h-6" />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------
 * Bar chart with hover tooltips
 * ------------------------------------------------------------------ */

function BarChart({
  title,
  subtitle,
  data,
  accent,
  unit,
}: {
  title: string;
  subtitle: string;
  data: number[];
  accent: string;
  unit: string;
}) {
  const max = Math.max(...data);
  const [hover, setHover] = React.useState<number | null>(null);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-[13px] font-medium text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground">{subtitle}</p>
      </div>

      <div className="relative mt-4">
        {hover !== null && (
          <div
            className="animate-pop pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-popover px-2 py-1 text-[11px] whitespace-nowrap text-foreground shadow-xl"
            style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}
          >
            <span className="font-medium tabular-nums">{data[hover]}</span> {unit}
          </div>
        )}
        <div className="flex h-32 items-end gap-[3px]">
          {data.map((value, i) => (
            <div
              key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className="group/bar relative flex-1 cursor-default rounded-t-[3px] transition-opacity"
              style={{
                height: `${max > 0 && value > 0 ? Math.max(4, (value / max) * 100) : 0}%`,
                backgroundColor: accent,
                opacity: hover === null || hover === i ? 1 : 0.45,
              }}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
        <span>peak {max}</span>
        <span>avg {Math.round(data.reduce((a, b) => a + b, 0) / data.length)}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
 * GitHub-style contribution heatmap
 * ------------------------------------------------------------------ */

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Mon", "Wed", "Fri"];

function Heatmap({ days, months }: { days: HeatDay[]; months: number }) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [hover, setHover] = React.useState<HeatDay | null>(null);

  // Group by week (columns of 7, starting Monday).
  const weeks = React.useMemo(() => {
    const columns: (HeatDay | null)[][] = [];
    let column: (HeatDay | null)[] = [];
    days.forEach((day, i) => {
      const weekday = new Date(`${day.date}T00:00:00`).getDay();
      const mondayIndex = (weekday + 6) % 7;
      if (i === 0) column = Array.from({ length: mondayIndex }, () => null);
      column.push(day);
      if (column.length === 7) {
        columns.push(column);
        column = [];
      }
    });
    if (column.length) columns.push(column);
    return columns;
  }, [days]);

  const monthLabels = React.useMemo(() => {
    const labels: { index: number; label: string }[] = [];
    let last = -1;
    weeks.forEach((week, i) => {
      const first = week.find(Boolean);
      if (!first) return;
      const month = Number(first.date.slice(5, 7)) - 1;
      if (month !== last) {
        labels.push({ index: i, label: months <= 3 ? MONTH_NAMES[month] : MONTH_NAMES[month] });
        last = month;
      }
    });
    return labels;
  }, [weeks, months]);

  // Keep the most recent weeks in view when the heatmap is dense.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [days]);

  return (
    <div>
      <div className="mt-4 flex gap-2">
        {/* Weekday gutter */}
        <div className="flex w-7 shrink-0 flex-col gap-[3px] pt-[14px]">
          {WEEKDAYS.map((label) => (
            <span key={label} className="h-[13px] text-[9px] leading-[13px] text-muted-foreground/60">
              {label}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          {/* Month labels */}
          <div className="relative mb-1 h-[13px]">
            {monthLabels.map(({ index, label }) => (
              <span
                key={`${label}-${index}`}
                className="absolute top-0 text-[9px] leading-[13px] text-muted-foreground/60"
                style={{ left: `${index * 16}px` }}
              >
                {label}
              </span>
            ))}
          </div>

          <div ref={scrollRef} className="scrollbar-none overflow-x-auto">
            <div className="flex gap-[3px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((day, di) =>
                    day ? (
                      <div
                        key={day.date}
                        onMouseEnter={() => setHover(day)}
                        onMouseLeave={() => setHover(null)}
                        title={day.label}
                        aria-label={day.label}
                        className={cn(
                          "size-[13px] rounded-[3px] ring-1 ring-inset ring-white/10 transition-transform hover:scale-125",
                          hover?.date === day.date && "ring-2 ring-white/60"
                        )}
                        style={{ backgroundColor: heatColor(day.count) }}
                      />
                    ) : (
                      <div key={`empty-${di}`} className="size-[13px]" />
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      <div className="mt-1 h-5 text-[11px] text-muted-foreground">
        {hover ? hover.label : "\u00A0"}
      </div>
    </div>
  );
}
