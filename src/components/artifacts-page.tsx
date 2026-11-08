import * as React from "react";
import { ArrowLeft, Check, Copy, Folder, Layers, LayoutPanelTop, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  artifactFolders,
  artifactKindLabels,
  artifacts,
  type Artifact,
  type ArtifactKind,
} from "@/data/artifacts";
import { cn } from "@/utils/cn";

interface ArtifactsPageProps {
  onBack: () => void;
  onReuse: (artifact: Artifact) => void;
}

const typeFilters: { value: "all" | ArtifactKind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "design", label: "Design" },
  { value: "skeleton", label: "Skeletal design" },
  { value: "prototype", label: "Prototype" },
];

export function ArtifactsPage({ onBack, onReuse }: ArtifactsPageProps) {
  const [query, setQuery] = React.useState("");
  const [folder, setFolder] = React.useState("all");
  const [kind, setKind] = React.useState<"all" | ArtifactKind>("all");
  const [selected, setSelected] = React.useState<Artifact | null>(null);
  const [copied, setCopied] = React.useState(false);
  const closeDialog = React.useCallback((open: boolean) => {
    if (!open) setSelected(null);
  }, []);

  const groups = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const byFolder = new Map<string, Artifact[]>();
    artifacts.forEach((artifact) => {
      if (folder !== "all" && artifact.folderId !== folder) return;
      if (kind !== "all" && artifact.kind !== kind) return;
      if (q && !`${artifact.name} ${artifact.folderId} ${artifact.tags.join(" ")}`.toLowerCase().includes(q)) return;
      const list = byFolder.get(artifact.folderId) ?? [];
      list.push(artifact);
      byFolder.set(artifact.folderId, list);
    });
    return [...byFolder.entries()];
  }, [query, folder, kind]);

  const copyName = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.name);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="@container animate-fade flex min-w-0 flex-1 flex-col bg-background">
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1520px] px-5 pt-6 pb-10 @[650px]:px-7">
          <header>
            <div className="flex items-end justify-between gap-4">
              <div>
                <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.035em]">My artifacts</h1>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Every design and skeletal design you've made, grouped by folder.</p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                <LayoutPanelTop className="size-3.5" />
                <span>{artifacts.length} artifacts · {artifactFolders.length} folders</span>
                <button type="button" onClick={onBack} aria-label="Back to chat" title="Back to chat" className="ml-1 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                  <ArrowLeft className="size-3.5" />
                </button>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[180px] flex-1 @[850px]:max-w-[260px]">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search artifacts..." aria-label="Search artifacts" className="h-[30px] rounded-md border-[#262626] bg-[#090909] pr-7 pl-8 text-xs" />
                {query && <button type="button" aria-label="Clear artifact search" onClick={() => setQuery("")} className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="size-3" /></button>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter artifacts by folder">
                <FolderFilter active={folder === "all"} onClick={() => setFolder("all")}>All folders</FolderFilter>
                {artifactFolders.map((id) => (
                  <FolderFilter key={id} active={folder === id} onClick={() => setFolder(id)}>
                    <Folder className="size-3 text-muted-foreground" />{id}
                  </FolderFilter>
                ))}
              </div>
            </div>

            <div className="mt-2 flex justify-end">
              <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-[#080808] p-0.5" role="radiogroup" aria-label="Artifact type">
                {typeFilters.map((option) => (
                  <button key={option.value} type="button" role="radio" aria-checked={kind === option.value} onClick={() => setKind(option.value)} className={cn("h-6 rounded-md px-2.5 text-[11px] transition-colors", kind === option.value ? "bg-[#202020] text-foreground ring-1 ring-inset ring-white/[0.08]" : "text-muted-foreground hover:text-foreground")}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </header>

          {groups.length === 0 && (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
              <Layers className="size-5 text-muted-foreground" />
              <p className="text-sm text-foreground">No artifacts match these filters.</p>
              <Button variant="secondary" size="sm" onClick={() => { setQuery(""); setFolder("all"); setKind("all"); }}>Clear filters</Button>
            </div>
          )}

          <div className="mt-7 space-y-8">
            {groups.map(([folderId, list]) => (
              <section key={folderId} aria-label={`${folderId} artifacts`}>
                <div className="mb-3 flex items-center gap-2">
                  <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                  <h2 className="text-xs font-medium text-foreground">{folderId}</h2>
                  <span className="text-[10px] text-muted-foreground/70 tabular-nums">{list.length}</span>
                  <span className="ml-1 h-px flex-1 bg-border" />
                </div>
                <div className="grid grid-cols-1 gap-3 @[480px]:grid-cols-2 @[800px]:grid-cols-3">
                  {list.map((artifact) => (
                    <button key={artifact.id} type="button" onClick={() => { setCopied(false); setSelected(artifact); }} aria-label={`Open ${artifact.name}`} className="group overflow-hidden rounded-[11px] border border-[#222] bg-[#090909] text-left outline-none transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-[#444] focus-visible:ring-2 focus-visible:ring-taro/50">
                      <div className="relative aspect-[16/10] w-full" style={{ background: artifact.preview }}>
                        <span className="absolute top-2 right-2 rounded-[5px] bg-black/45 px-1.5 py-0.5 text-[10px] leading-3 font-medium text-white/90">{artifact.updated}</span>
                      </div>
                      <div className="border-t border-black/10 px-3 pt-3 pb-2.5">
                        <p className="truncate text-xs leading-4 font-medium text-foreground">{artifact.name}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <KindBadge kind={artifact.kind} />
                          {artifact.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={selected !== null} onOpenChange={closeDialog} labelledBy="artifact-detail-title" className="w-[min(740px,calc(100vw-40px))] rounded-2xl bg-[#090909]">
        {selected && (
          <div>
            <div className="relative aspect-[16/9] max-h-[60vh] w-full" style={{ background: selected.preview }}>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#07101f]/85 via-black/0 to-black/0" />
              <div className="absolute inset-x-5 bottom-5 flex items-end gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] leading-4 font-medium tracking-wide text-white/50 uppercase">{artifactKindLabels[selected.kind]} · {selected.folderId}</p>
                  <h2 id="artifact-detail-title" className="mt-1 text-lg leading-6 font-semibold tracking-tight text-white">{selected.name}</h2>
                </div>
                <span className="rounded-[5px] bg-black/45 px-1.5 py-0.5 text-[10px] font-medium text-white/80">{selected.updated}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 px-5 py-[18px]">
              <div className="mr-auto flex flex-wrap gap-1">{selected.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</div>
              <button type="button" onClick={() => void copyName()} className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}{copied ? "Copied" : "Copy name"}
              </button>
              <Button size="sm" onClick={() => { const artifact = selected; setSelected(null); onReuse(artifact); }} className="h-7 gap-1.5 rounded-md text-[11px]">
                <Layers className="size-3.5" />Reuse this design
              </Button>
            </div>
            <footer className="flex items-center gap-4 border-t border-border px-5 py-3">
              <p className="flex-1 text-[10px] leading-4 text-muted-foreground">Saved as a real frame, not a screenshot — reuse brings tokens and spacing across.</p>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close artifact preview" className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><X className="size-3.5" /></button>
            </footer>
          </div>
        )}
      </Dialog>
    </section>
  );
}

function FolderFilter({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={cn("inline-flex h-[25px] items-center gap-1.5 whitespace-nowrap rounded-full border px-2 text-[10px] transition-colors", active ? "border-taro/45 bg-taro/[0.09] text-taro" : "border-border text-muted-foreground hover:border-[#3b3b3b] hover:text-foreground")}>{children}</button>;
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-[4px] border border-[#252525] px-1.5 text-[10px] leading-[16px] text-muted-foreground">{children}</span>;
}

function KindBadge({ kind }: { kind: ArtifactKind }) {
  return <span className={cn("inline-flex items-center rounded-[4px] border px-1.5 text-[10px] leading-[16px]", kind === "skeleton" ? "border-[#252525] text-muted-foreground" : "border-taro/25 bg-taro/10 text-taro")}>{artifactKindLabels[kind]}</span>;
}
