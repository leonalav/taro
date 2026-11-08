import * as React from "react";
import { ArrowUpRight, CornerDownLeft, MessageSquare, Package, Search, SlidersHorizontal, Grid2x2, Type, User } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { artifacts } from "@/data/artifacts";
import { navSections, type Folder, type Thread } from "@/data/mock";
import { cn } from "@/utils/cn";

type FilterId = "all" | "folders" | "chats" | "artifacts" | "features";

interface FilterDef {
  id: FilterId;
  label: string;
  icon: React.ReactNode;
}

const FILTERS: FilterDef[] = [
  { id: "all", label: "All", icon: null },
  { id: "folders", label: "Folders", icon: null },
  { id: "chats", label: "Chats", icon: <MessageSquare className="size-3.5" /> },
  { id: "artifacts", label: "Artifacts", icon: <Package className="size-3.5" /> },
  { id: "features", label: "Features", icon: <Grid2x2 className="size-3.5" /> },
];

type Row = {
  id: string;
  group: string;
  title: string;
  breadcrumb: string;
  kind: "folder" | "chat" | "artifact" | "feature";
  icon: React.ReactNode;
  run: () => void;
};

interface CommandPaletteProps {
  folders: Folder[];
  threads: Thread[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectFolder: (folderId: string) => void;
  onSelectThread: (threadId: string) => void;
  onSelectArtifact: () => void;
  onSelectFeature: (featureId: string) => void;
  onNewThread: () => void;
}

export function CommandPalette({
  folders,
  threads,
  open,
  onOpenChange,
  onSelectFolder,
  onSelectThread,
  onSelectArtifact,
  onSelectFeature,
  onNewThread,
}: CommandPaletteProps) {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<FilterId>("all");
  const [index, setIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setFilter("all");
      setIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const rows = React.useMemo<Row[]>(() => {
    const out: Row[] = [];

    if (filter === "all" || filter === "folders") {
      folders.forEach((folder) =>
        out.push({
          id: `folder-${folder.id}`,
          group: "Folders",
          title: folder.name,
          breadcrumb: "folder",
          kind: "folder",
          icon: <Search className="size-3.5 text-muted-foreground" />,
          run: () => onSelectFolder(folder.id),
        })
      );
    }

    if (filter === "all" || filter === "chats") {
      threads
        .filter((thread) => !thread.archived)
        .forEach((thread) => {
          const folder = folders.find((f) => f.id === thread.folderId);
          out.push({
            id: `chat-${thread.id}`,
            group: "Chats",
            title: thread.name,
            breadcrumb: `${folder?.name ?? ""} · ${thread.updated}`,
            kind: "chat",
            icon: <MessageSquare className="size-3.5 text-taro/70" />,
            run: () => onSelectThread(thread.id),
          });
        });
    }

    if (filter === "all" || filter === "artifacts") {
      artifacts.forEach((artifact) =>
        out.push({
          id: `artifact-${artifact.id}`,
          group: "Artifacts",
          title: artifact.name,
          breadcrumb: `${artifact.kind} · ${artifact.frames} frames`,
          kind: "artifact",
          icon: <Package className="size-3.5 text-violet-400/80" />,
          run: onSelectArtifact,
        })
      );
    }

    if (filter === "all" || filter === "features") {
      navSections
        .flatMap((section) => section.items)
        .forEach((item) =>
          out.push({
            id: `feature-${item.id}`,
            group: "Features",
            title: item.label,
            breadcrumb: "Taro",
            kind: "feature",
            icon: <Grid2x2 className="size-3.5 text-amber-400/80" />,
            run: () => onSelectFeature(item.id),
          })
        );
      out.push({
        id: "feature-new-thread",
        group: "Features",
        title: "New chat",
        breadcrumb: "current folder",
        kind: "feature",
        icon: <Grid2x2 className="size-3.5 text-amber-400/80" />,
        run: onNewThread,
      });
    }

    return out;
  }, [filter, folders, threads, onSelectFolder, onSelectThread, onSelectArtifact, onSelectFeature, onNewThread]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter((row) => row.title.toLowerCase().includes(q) || row.breadcrumb.toLowerCase().includes(q))
    : rows;

  const groups = React.useMemo(() => {
    const map = new Map<string, Row[]>();
    filtered.forEach((row) => {
      const list = map.get(row.group) ?? [];
      list.push(row);
      map.set(row.group, list);
    });
    return Array.from(map.entries());
  }, [filtered]);

  React.useEffect(() => setIndex(0), [query, filter]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const row = filtered[index];
        if (row) {
          row.run();
          onOpenChange(false);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, filtered, index, onOpenChange]);

  React.useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!open) return null;

  let flat = -1;

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center pt-[10vh]">
      <div className="animate-fade absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={() => onOpenChange(false)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search Taro"
        className="animate-dialog relative w-[min(680px,calc(100vw-48px))] overflow-hidden rounded-2xl border border-border bg-[#0a0a0a] shadow-[0_32px_120px_-20px_rgba(0,0,0,0.95)]"
      >
        {/* Input */}
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search folders, chats, artifacts and features…"
            aria-label="Search Taro"
            className="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70"
          />
          <Kbd>esc</Kbd>
        </div>

        {/* Filters */}
        <div className="scrollbar-none flex items-center gap-1 overflow-x-auto border-b border-border px-3 py-2">
          <SlidersHorizontal className="mr-1 size-3.5 shrink-0 text-muted-foreground" />
          {FILTERS.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
              className={cn(
                "flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs transition-colors",
                filter === id ? "bg-accent text-foreground ring-1 ring-inset ring-white/[0.06]" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {/* Results */}
        <div ref={listRef} className="scrollbar-thin max-h-[52vh] overflow-y-auto p-2">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <Type className="size-5 text-muted-foreground" />
              <p className="text-sm text-foreground">No matches for “{query}”</p>
              <button type="button" onClick={() => setQuery("")} className="text-xs text-muted-foreground hover:text-foreground">
                Clear search
              </button>
            </div>
          )}

          {groups.map(([group, list]) => (
            <div key={group} className="mb-1">
              <p className="px-2.5 py-1.5 text-[11px] tracking-[0.08em] text-muted-foreground/70 uppercase">{group}</p>
              {list.map((row) => {
                flat += 1;
                const position = flat;
                const active = position === index;
                return (
                  <button
                    key={row.id}
                    type="button"
                    data-active={active}
                    onMouseEnter={() => setIndex(position)}
                    onClick={() => {
                      row.run();
                      onOpenChange(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                      active ? "bg-accent text-foreground" : "text-muted-foreground"
                    )}
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                      {row.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-foreground">{row.title}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{row.breadcrumb}</span>
                    </span>
                    {active ? (
                      <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ArrowUpRight className="size-3.5 shrink-0 opacity-40" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>⏎</Kbd> open
          </span>
          <span className="ml-auto flex items-center gap-1">
            <User className="size-3" /> {filtered.length} results
          </span>
        </div>
      </div>
    </div>
  );
}
