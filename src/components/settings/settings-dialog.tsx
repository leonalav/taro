import * as React from "react";
import { Search, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { AccountSection, AppearanceSection, type SectionProps } from "@/components/settings/sections-personal";
import {
  AgentsSection,
  BrowserSection,
  PluginsSection,
  RulesSection,
} from "@/components/settings/sections-workspace";
import {ModelsSettings} from '@/components/model-settings';
import {SourceControlSettings} from '@/components/source-control-settings';
import { settingsSections, type Settings, type SettingsSectionId } from "@/data/settings";
import { cn } from "@/utils/cn";

const sectionComponents: Record<SettingsSectionId, (props: SectionProps) => React.ReactElement> = {
  account: AccountSection,
  appearance: AppearanceSection,
  plugins: PluginsSection,
  rules: RulesSection,
  models: ModelsSettings,
  agents: AgentsSection,
  "source-control": SourceControlSettings,
  browser: BrowserSection,
};

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: SettingsSectionId;
  onSectionChange: (section: SettingsSectionId) => void;
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
}

export function SettingsDialog({
  open,
  onOpenChange,
  section,
  onSectionChange,
  settings,
  onSettingsChange,
}: SettingsDialogProps) {
  const [query, setQuery] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const update: SectionProps["update"] = (key, value) => onSettingsChange({ ...settings, [key]: value });

  const q = query.trim().toLowerCase();
  const visibleSections = settingsSections.filter(
    (s) => !q || s.label.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
  );
  const groups = (["Personal", "Workspace"] as const)
    .map((group) => ({ group, items: visibleSections.filter((s) => s.group === group) }))
    .filter((g) => g.items.length > 0);

  const current = settingsSections.find((s) => s.id === section) ?? settingsSections[0];
  const Body = sectionComponents[current.id];

  // Reset scroll when switching sections.
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [section]);

  // Clear the nav search whenever the dialog closes.
  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const onNavKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const ids = visibleSections.map((s) => s.id);
    const idx = ids.indexOf(section);
    const next = e.key === "ArrowDown" ? ids[(idx + 1) % ids.length] : ids[(idx - 1 + ids.length) % ids.length];
    if (next) {
      onSectionChange(next);
      document.getElementById(`settings-nav-${next}`)?.focus();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      labelledBy="settings-title"
      className="flex h-[min(680px,calc(100vh-48px))] w-[min(920px,calc(100vw-48px))]"
    >
      {/* Nav */}
      <aside className="flex w-14 shrink-0 flex-col border-r border-border bg-sidebar sm:w-[220px]">
        <div className="px-3 pt-4 pb-3">
          <p className="hidden px-2 pb-3 text-[13px] font-semibold text-foreground sm:block">Settings</p>
          <div className="relative hidden sm:block">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search settings"
              aria-label="Search settings"
              className="h-8 w-full rounded-lg border border-sidebar-border bg-background pr-2 pl-8 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:border-taro/50"
            />
          </div>
        </div>

        <nav aria-label="Settings sections" className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-3" onKeyDown={onNavKeyDown}>
          {groups.length === 0 && <p className="px-2 py-4 text-xs text-muted-foreground">No matches.</p>}
          {groups.map(({ group, items }) => (
            <div key={group} className="mb-4">
              <p className="hidden px-2 pb-1.5 text-xs text-muted-foreground/70 sm:block">{group}</p>
              <div className="flex flex-col gap-0.5">
                {items.map(({ id, label, icon: Icon }) => {
                  const active = id === section;
                  return (
                    <button
                      key={id}
                      id={`settings-nav-${id}`}
                      type="button"
                      aria-label={label}
                      title={label}
                      aria-current={active ? "page" : undefined}
                      onClick={() => onSectionChange(id)}
                      className={cn(
                        "flex h-8 items-center justify-center gap-2.5 rounded-lg px-1 text-[13px] text-muted-foreground transition-colors outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-taro/30 sm:justify-start sm:px-2.5",
                        active && "bg-sidebar-accent text-foreground ring-1 ring-inset ring-white/[0.06]"
                      )}
                    >
                      <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="hidden border-t border-sidebar-border px-5 py-3 text-[11px] text-muted-foreground/70 sm:block">
          Taro 0.4.2 · <span className="text-muted-foreground">Changes save automatically</span>
        </div>
      </aside>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-start gap-2 border-b border-border px-4 pt-6 pb-5 sm:gap-4 sm:px-8">
          <div className="min-w-0 flex-1">
            <h2 id="settings-title" className="text-lg font-semibold tracking-tight text-foreground">
              {current.label}
            </h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{current.description}</p>
          </div>
          <span className="mt-1 hidden items-center gap-1 text-[11px] text-muted-foreground/70 md:flex">
            <Kbd>esc</Kbd>
          </span>
          <button
            type="button"
            aria-label="Close settings"
            onClick={() => onOpenChange(false)}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          <div key={current.id} className="animate-pop mx-auto max-w-[620px] px-3 py-5 sm:px-8 sm:py-7">
            <Body settings={settings} update={update} />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
