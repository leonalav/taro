import * as React from "react";
import {
  Circle,
  CircleCheck,
  CircleDashed,
  CircleDot,
  ChevronDown,
  PanelRightClose,
  Plus,
  Search,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, type DropdownOption } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { TASK_STATUSES, type Priority, type Task, type TaskStatus } from "@/data/mock";
import { cn } from "@/utils/cn";

type PriorityFilter = "all" | Priority;
type StatusFilter = "all" | TaskStatus;

const priorityOptions: DropdownOption<PriorityFilter>[] = [
  { value: "all", label: "All Priorities" },
  { value: "High", label: "High" },
  { value: "Medium", label: "Medium" },
  { value: "Low", label: "Low" },
];

const statusOptions: DropdownOption<StatusFilter>[] = [
  { value: "all", label: "All Statuses" },
  ...TASK_STATUSES.map((s) => ({ value: s, label: s })),
];

const statusIcon: Record<TaskStatus, LucideIcon> = {
  Backlog: CircleDashed,
  "To Do": Circle,
  "In Progress": CircleDot,
  Done: CircleCheck,
};

const priorityVariant: Record<Priority, "high" | "medium" | "low"> = {
  High: "high",
  Medium: "medium",
  Low: "low",
};

const severityVariant: Record<Task["severity"], "high" | "medium" | "low"> = {
  Critical: "high",
  High: "high",
  Medium: "medium",
  Low: "low",
};

interface TasksBoardProps {
  tasks: Task[];
  onCycleStatus: (id: string) => void;
  onClose: () => void;
}

export function TasksBoard({ tasks, onCycleStatus, onClose }: TasksBoardProps) {
  const [query, setQuery] = React.useState("");
  const [priority, setPriority] = React.useState<PriorityFilter>("all");
  const [status, setStatus] = React.useState<StatusFilter>("all");

  const q = query.trim().toLowerCase();
  const filtered = tasks.filter(
    (t) =>
      (priority === "all" || t.priority === priority) &&
      (q === "" || t.title.toLowerCase().includes(q) || t.details.toLowerCase().includes(q) || t.tags.some((tag) => tag.includes(q)))
  );
  const columns = TASK_STATUSES.filter((s) => status === "all" || s === status);

  return (
    <aside className="@container flex min-w-0 flex-1 flex-col bg-[#070707]">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-2 px-5">
        <h2 className="text-sm font-medium">Tasks</h2>
        <span className="text-xs tabular-nums text-muted-foreground">{tasks.length}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" title="New task" aria-label="New task">
            <Plus />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onClose} title="Hide tasks" aria-label="Hide tasks">
            <PanelRightClose />
          </Button>
        </div>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 px-5 pb-4">
        <div className="relative min-w-0 flex-1 @[520px]:max-w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search issues"
            aria-label="Search issues"
            className="w-full pl-8"
          />
        </div>
        <DropdownMenu value={priority} options={priorityOptions} onValueChange={setPriority} ariaLabel="Filter by priority" />
        <DropdownMenu value={status} options={statusOptions} onValueChange={setStatus} ariaLabel="Filter by status" />
      </div>

      {/* Board */}
      {/* Fits the panel: 4 columns when wide, 2 when medium, stacked vertically when narrow. */}
      <div className="scrollbar-thin grid min-h-0 flex-1 auto-rows-min grid-cols-1 content-start gap-3 overflow-y-auto px-5 pb-5 @[600px]:grid-cols-2 @[1060px]:grid-cols-4">
        {columns.map((col) => (
          <Column
            key={col}
            status={col}
            tasks={filtered.filter((t) => t.status === col)}
            onCycleStatus={onCycleStatus}
          />
        ))}
      </div>
    </aside>
  );
}

function Column({
  status,
  tasks,
  onCycleStatus,
}: {
  status: TaskStatus;
  tasks: Task[];
  onCycleStatus: (id: string) => void;
}) {
  const Icon = statusIcon[status];

  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-border bg-background p-2">
      <div className="flex items-center gap-2 px-2 pt-1.5 pb-2.5 text-[13px]">
        <Icon className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
        <span className="text-muted-foreground">{status}</span>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground/60">{tasks.length}</span>
      </div>

      <div className="flex flex-col gap-2">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onCycle={() => onCycleStatus(task.id)} />
        ))}
        {tasks.length === 0 && (
          <div className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground/60">
            No tasks
          </div>
        )}
      </div>
    </section>
  );
}

function TaskCard({ task, onCycle }: { task: Task; onCycle: () => void }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <article className="group flex w-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-[border-color,background-color] duration-150 hover:border-[#2e2e2e] hover:bg-[#0d0d0d]">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        className="flex w-full flex-col gap-2 p-3.5 text-left"
      >
        <div className="flex w-full items-start gap-2">
          <span className="min-w-0 flex-1 text-[13.5px] leading-5 font-medium text-foreground">{task.title}</span>
          <ChevronDown className={cn("mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
        </div>
        <div className={cn("text-xs leading-[1.1rem] text-muted-foreground", !expanded && "line-clamp-2")}>{task.description}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge variant={priorityVariant[task.priority]}>{task.priority}</Badge>
          <Badge variant={severityVariant[task.severity]}>Severity · {task.severity}</Badge>
          {task.tags.map((tag) => (
            <Badge key={tag} variant="default" className="border-border/70 text-muted-foreground/80">{tag}</Badge>
          ))}
        </div>
      </button>

      {expanded && (
        <div className="animate-pop border-t border-border px-3.5 pt-3 pb-3.5">
          <section>
            <h4 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">What this means</h4>
            <p className="mt-1.5 text-xs leading-relaxed text-foreground/80">{task.details}</p>
          </section>
          <section className="mt-3.5">
            <h4 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Planned solution</h4>
            <ol className="mt-1.5 space-y-1.5">
              {task.solution.map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-foreground/80">
                  <span className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[10px] text-muted-foreground">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>
          <div className="mt-3.5 flex items-center justify-between border-t border-border pt-2.5">
            <span className="text-[11px] text-muted-foreground">Status · {task.status}</span>
            <Button variant="secondary" size="sm" onClick={onCycle}>Move to next status</Button>
          </div>
        </div>
      )}
    </article>
  );
}
