import * as React from "react";
import {
  ArrowDownAZ,
  ArrowLeft,
  ArrowUpAZ,
  ArrowUpDown,
  Check,
  ChevronDown,
  Download,
  Film,
  HardDrive,
  Layers,
  Pause,
  Play,
  Search,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DropdownMenu, type DropdownOption } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { mediaCategories, mediaItems, type MediaItem } from "@/data/media";
import type { Library, SavedMedia } from "@/lib/media-store";
import { cn } from "@/utils/cn";

type SortId = "name-asc" | "name-desc" | "pro-desc" | "pro-asc" | "rating-desc" | "popular";
type Access = "all" | "free" | "pro";
type Tab = "browse" | "downloads" | "uploads";

const sortOptions: DropdownOption<SortId>[] = [
  { value: "name-asc", label: "A → Z", icon: <ArrowDownAZ className="size-3.5" /> },
  { value: "name-desc", label: "Z → A", icon: <ArrowUpAZ className="size-3.5" /> },
  { value: "pro-desc", label: "Pro → Free", icon: <ArrowUpDown className="size-3.5" /> },
  { value: "pro-asc", label: "Free → Pro", icon: <ArrowUpDown className="size-3.5" /> },
  { value: "rating-desc", label: "Top rated", icon: <Star className="size-3.5" /> },
  { value: "popular", label: "Most downloaded", icon: <ArrowUpDown className="size-3.5" /> },
];

const PAGE_SIZE = 12;
const proOnly = (item: MediaItem) => item.price > 0;

export function GalleryPage({ onBack, library, onReuse }: { onBack: () => void; library: Library; onReuse: (item: MediaItem) => void }) {
  const [tab, setTab] = React.useState<Tab>("browse");
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<SortId>("popular");
  const [access, setAccess] = React.useState<Access>("all");
  const [category, setCategory] = React.useState<string>("All");
  const [limit, setLimit] = React.useState(PAGE_SIZE);
  const [autoplay, setAutoplay] = React.useState(true);
  const [active, setActive] = React.useState<MediaItem | SavedMedia | null>(null);
  const [showMore, setShowMore] = React.useState(true);
  const sentinelRef = React.useRef<HTMLDivElement>(null);

  // Remove credentials saved by the retired remote-provider controls.
  React.useEffect(() => {
    try {
      localStorage.removeItem("taro.media.keys.v2");
      localStorage.removeItem("taro.pexels.apiKey");
      localStorage.removeItem("taro.gallery.source");
    } catch {
      /* local storage can be unavailable in private browsing */
    }
  }, []);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = mediaItems.filter((item) => {
      if (access === "free" && proOnly(item)) return false;
      if (access === "pro" && !proOnly(item)) return false;
      if (category !== "All" && item.category !== category) return false;
      if (!q) return true;
      return item.title.toLowerCase().includes(q) || item.creator.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
    });

    return [...list].sort((a, b) => {
      switch (sort) {
        case "name-asc":
          return a.title.localeCompare(b.title);
        case "name-desc":
          return b.title.localeCompare(a.title);
        case "pro-desc":
          return Number(proOnly(b)) - Number(proOnly(a)) || a.title.localeCompare(b.title);
        case "pro-asc":
          return Number(proOnly(a)) - Number(proOnly(b)) || a.title.localeCompare(b.title);
        case "rating-desc":
          return b.rating - a.rating;
        default:
          return b.downloads - a.downloads;
      }
    });
  }, [query, sort, access, category]);

  React.useEffect(() => {
    setLimit(PAGE_SIZE);
    setShowMore(true);
  }, [query, sort, access, category]);

  const visible = filtered.slice(0, limit);
  const hasMore = limit < filtered.length;

  // This pages through the local catalog only. It never fetches remote media.
  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el || tab !== "browse" || !showMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          if (hasMore) setLimit((n) => n + PAGE_SIZE);
          else setShowMore(false);
        }
      },
      { rootMargin: "500px 0px", root: el.closest("[data-gallery-scroll]") }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [tab, hasMore, showMore, limit]);

  const libraryItems = tab === "downloads" ? library.downloads : library.uploads;
  const libraryFiltered = libraryItems.filter((item) => {
    const q = query.trim().toLowerCase();
    return !q || item.title.toLowerCase().includes(q) || item.creator.toLowerCase().includes(q);
  });

  const onUpload = (files: FileList | File[] | null) => {
    if (!files) return;
    const videos = Array.from(files).filter((f) => f.type.startsWith("video/") || /\.(mp4|mov|webm|m4v|ogv)$/i.test(f.name));
    if (videos.length) void library.addUploads(videos);
  };

  const downloadItem = (item: MediaItem | SavedMedia) => {
    library.saveDownload(item);
    const src = item.video || item.poster;
    void (async () => {
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${item.title.replace(/\s+/g, "-").toLowerCase()}.${item.video ? "mp4" : "jpg"}`;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        window.open(src, "_blank", "noopener");
      }
    })();
  };

  return (
    <section className="animate-fade flex min-w-0 flex-1 flex-col bg-background">
      <header className="shrink-0 border-b border-border px-6 pt-5 pb-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to chat" title="Back to chat">
            <ArrowLeft />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">Gallery</h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">Animated backgrounds for your frames. Hover to preview, click to inspect.</p>
          </div>
          <div className="ml-auto flex items-center gap-2.5 pt-1">
            <Play className="size-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Autoplay on hover</span>
            <Switch aria-label="Autoplay on hover" checked={autoplay} onCheckedChange={setAutoplay} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-40 flex-1 md:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === "browse" ? "Search backgrounds, creators, styles…" : "Search your media…"}
              aria-label="Search gallery"
              className="pr-8 pl-8"
            />
            {query && (
              <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {tab === "browse" && (
            <>
              <DropdownMenu value={sort} options={sortOptions} onValueChange={setSort} ariaLabel="Sort gallery" triggerClassName="w-52 justify-between" />
              <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5" role="radiogroup" aria-label="Media access">
                {(
                  [
                    { id: "all", label: "All" },
                    { id: "free", label: "Always Free" },
                    { id: "pro", label: "Pro-only" },
                  ] as { id: Access; label: string }[]
                ).map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={access === id}
                    onClick={() => setAccess(id)}
                    className={cn(
                      "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs whitespace-nowrap transition-colors",
                      access === id ? "bg-accent text-foreground ring-1 ring-inset ring-white/[0.06]" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {access === id && id !== "all" && <Check className="size-3" />}
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}

          {tab === "uploads" && (
            <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-white/90">
              <Upload className="size-4" />
              Upload videos
              <input type="file" accept="video/*" multiple className="hidden" onChange={(e) => { onUpload(e.target.files); e.target.value = ""; }} />
            </label>
          )}
        </div>

        {tab === "browse" && (
          <div className="scrollbar-none mt-3 flex items-center gap-1.5 overflow-x-auto">
            {mediaCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                aria-pressed={category === cat}
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  category === cat ? "border-taro/40 bg-taro/10 text-taro" : "border-border text-muted-foreground hover:border-[#333] hover:text-foreground"
                )}
              >
                {cat}
              </button>
            ))}
            <span className="ml-auto shrink-0 pl-3 text-xs text-muted-foreground tabular-nums">{filtered.length} {filtered.length === 1 ? "result" : "results"}</span>
          </div>
        )}
      </header>

      <div className="flex shrink-0 items-center gap-1 border-b border-border px-6">
        <TabButton active={tab === "browse"} onClick={() => setTab("browse")}>Browse</TabButton>
        <span className="mx-2 h-4 w-px bg-border" />
        <span className="mr-1 text-xs text-muted-foreground">Your Media</span>
        <TabButton active={tab === "downloads"} onClick={() => setTab("downloads")}><Download className="size-3.5" />Downloads<Count value={library.downloads.length} /></TabButton>
        <TabButton active={tab === "uploads"} onClick={() => setTab("uploads")}><HardDrive className="size-3.5" />Uploads<Count value={library.uploads.length} /></TabButton>
      </div>

      <div data-gallery-scroll className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {tab !== "browse" && (
          <div className="px-6 pt-5 pb-1">
            <p className="text-xs text-muted-foreground">
              {tab === "downloads" ? "Backgrounds you saved from the gallery. Playable from their source." : "Your own videos. Stored on this device, so they survive reloads."}
            </p>
          </div>
        )}

        {tab === "browse" && visible.length === 0 && (
          <EmptyState icon={<Film className="size-6 text-muted-foreground" />} title="No backgrounds match." action={
            <Button variant="secondary" size="sm" onClick={() => { setQuery(""); setAccess("all"); setCategory("All"); }}>Reset filters</Button>
          } />
        )}

        {tab !== "browse" && libraryFiltered.length === 0 && (
          <EmptyState
            icon={tab === "downloads" ? <Download className="size-6 text-muted-foreground" /> : <Upload className="size-6 text-muted-foreground" />}
            title={tab === "downloads" ? "Nothing downloaded yet." : "No uploads yet."}
            detail={tab === "downloads" ? "Open a background and hit Download to keep it in Your Media." : "Drag and drop video files here, or use Upload videos."}
            action={tab === "uploads" ? <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg bg-secondary px-3 text-sm font-medium text-secondary-foreground ring-1 ring-inset ring-border"><Upload className="size-4" />Choose files<input type="file" accept="video/*" multiple className="hidden" onChange={(e) => onUpload(e.target.files)} /></label> : undefined}
          />
        )}

        {tab === "uploads" && (
          <div onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }} onDrop={(e) => { e.preventDefault(); onUpload(e.dataTransfer.files); }} className="mx-6 mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
            Drop video files anywhere in this panel to add them to Uploads
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {tab === "browse" && visible.map((item) => <MediaCard key={item.id} item={item} autoplay={autoplay} onOpen={() => setActive(item)} />)}
          {tab !== "browse" && libraryFiltered.map((item) => <LibraryCard key={item.id} item={item} autoplay={autoplay} onOpen={() => setActive(item)} onRemove={() => library.remove(item.id)} />)}
        </div>

        {tab === "browse" && (
          <div className="px-6 pb-8">
            <div ref={sentinelRef} className="flex items-center justify-center gap-3 py-2">
              {hasMore ? <><ChevronDown className="size-3.5 text-muted-foreground" /><span className="text-xs text-muted-foreground">{visible.length} of {filtered.length} · scroll for more</span></> : <span className="text-xs text-muted-foreground">End of the gallery</span>}
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground/60">Browse the curated animated background collection.</p>
          </div>
        )}
      </div>

      <Dialog open={active !== null} onOpenChange={(open) => !open && setActive(null)} labelledBy="media-preview-title" className="w-[min(960px,calc(100vw-48px))]">
        {active && (
          <div className="flex flex-col">
            {active.video ? <video key={active.id} src={active.video} poster={active.poster || undefined} autoPlay loop muted playsInline controls className="aspect-video w-full bg-black object-contain" /> : <div className="flex aspect-video w-full items-center justify-center bg-black text-muted-foreground"><Film className="size-8" /></div>}
            <div className="flex flex-wrap items-center gap-3 p-5">
              <div className="min-w-0 flex-1">
                <h2 id="media-preview-title" className="text-base font-semibold tracking-tight">{active.title}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{active.creator}{" "}· {active.resolution} · {active.duration} · {active.category}</p>
              </div>
              {proOnly(active) && <Badge variant="taro">Pro-only</Badge>}
              {"origin" in active && active.origin === "uploaded" ? <Badge variant="taro">Your upload</Badge> : "origin" in active || library.hasDownload(active.id) ? <Badge variant="success">In Your Media</Badge> : <Button variant="secondary" size="sm" onClick={() => downloadItem(active)}><Download />Download</Button>}
              <Button size="sm" onClick={() => { const item = active; setActive(null); onReuse(item); }}><Layers />Reuse this media</Button>
              {active.pageUrl && <a href={active.pageUrl} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground transition-colors hover:text-foreground">Source ↗</a>}
            </div>
          </div>
        )}
      </Dialog>
    </section>
  );
}

function EmptyState({ icon, title, detail, action }: { icon: React.ReactNode; title: string; detail?: string; action?: React.ReactNode }) {
  return <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 text-center">{icon}<p className="text-sm text-foreground">{title}</p>{detail && <p className="max-w-xs text-xs text-muted-foreground">{detail}</p>}{action}</div>;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={cn("-mb-px flex h-10 items-center gap-1.5 border-b-2 px-1.5 text-[13px] transition-colors", active ? "border-taro text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{children}</button>;
}

function Count({ value }: { value: number }) {
  return <span className="rounded-md bg-accent px-1.5 text-[11px] leading-4 text-muted-foreground tabular-nums">{value}</span>;
}

function LibraryCard({ item, autoplay, onOpen, onRemove }: { item: SavedMedia; autoplay: boolean; onOpen: () => void; onRemove: () => void }) {
  return <div className="group relative"><MediaCard item={item} autoplay={autoplay} onOpen={onOpen} /><button type="button" aria-label={`Remove ${item.title}`} onClick={onRemove} className="absolute top-2 right-2 z-10 flex size-6 items-center justify-center rounded-md bg-black/60 text-white/80 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 hover:text-white focus-visible:opacity-100"><Trash2 className="size-3.5" /></button><span className="absolute bottom-2.5 left-2.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/70 backdrop-blur">{item.origin === "uploaded" ? "Your upload" : "Saved"}</span></div>;
}

function MediaCard({ item, autoplay, onOpen }: { item: MediaItem; autoplay: boolean; onOpen: () => void }) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [inView, setInView] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const [broken, setBroken] = React.useState(false);
  const shouldPlay = autoplay && hovered && inView && Boolean(item.video) && !broken;

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => setInView(entries.some((e) => e.isIntersecting)), { rootMargin: "300px", root: el.closest("[data-gallery-scroll]") });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  React.useEffect(() => {
    const video = videoRef.current;
    if (video && shouldPlay) void video.play().catch(() => undefined);
  }, [shouldPlay]);

  return (
    <div ref={wrapRef}>
      <div role="button" tabIndex={0} aria-label={`Preview ${item.title}`} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => { setHovered(false); videoRef.current?.pause(); }} className="group relative block aspect-[16/10] w-full cursor-pointer overflow-hidden rounded-xl border border-border bg-[#0d0d0d] outline-none transition-[border-color,transform] duration-150 hover:border-[#3a3a3a] focus-visible:ring-2 focus-visible:ring-taro/40">
        {item.poster ? <img src={item.poster} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#1a1a1a] to-[#0b0b0b]"><Film className="size-6 text-white/20" /></div>}
        {shouldPlay && <video ref={videoRef} src={item.video} poster={item.poster || undefined} muted loop playsInline preload="auto" onCanPlay={() => setReady(true)} onError={() => setBroken(true)} className={cn("absolute inset-0 h-full w-full object-cover transition-opacity duration-300", ready ? "opacity-100" : "opacity-0")} />}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/25" />
        {broken && <span className="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-md bg-black/70 px-2 py-1 text-[11px] text-white/80 backdrop-blur">Preview unavailable</span>}
        {proOnly(item) && <span className="absolute top-2.5 left-2.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur">Pro-only</span>}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 text-[11px] text-white/80">{item.duration && item.duration !== "—" && <span className="rounded-md bg-black/50 px-1.5 py-0.5 backdrop-blur">{item.duration}</span>}{item.resolution && item.resolution !== "—" && <span className="rounded-md bg-black/50 px-1.5 py-0.5 backdrop-blur">{item.resolution}</span>}</div>
        <div className="absolute bottom-0 left-0 flex w-full items-end gap-2 p-3"><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium text-white">{item.title}</p><p className="truncate text-[11px] text-white/60">{item.creator}</p></div>{item.rating > 0 && <span className="flex shrink-0 items-center gap-1 text-[11px] text-white/70 tabular-nums"><Star className="size-3 text-amber-400" />{item.rating.toFixed(1)}</span>}</div>
        <span className="absolute inset-0 m-auto flex size-10 items-center justify-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">{autoplay ? <Play className="size-4" /> : <Pause className="size-4" />}</span>
      </div>
    </div>
  );
}
