import * as React from "react";
import { Camera, Check, Laptop, LogOut, Monitor, Moon, Smartphone, Sun } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { SettingsGroup, SettingsRow } from "@/components/settings/primitives";
import { accents, type Density, type Settings, type Theme } from "@/data/settings";
import { cn } from "@/utils/cn";

export interface SectionProps {
  settings: Settings;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

/* ------------------------------------------------------------------
 * My account
 * ------------------------------------------------------------------ */

export function AccountSection({ settings, update }: SectionProps) {
  const account = settings.account;
  const patch = (value: Partial<typeof account>) => update("account", { ...account, ...value });
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [sessions, setSessions] = React.useState([
    { id: "mac", device: "MacBook Pro · Taro 0.4.2", where: "Lisbon, PT", current: true, icon: Laptop },
    { id: "iphone", device: "iPhone 16 · Taro Mobile", where: "Lisbon, PT · 2h ago", current: false, icon: Smartphone },
    { id: "studio", device: "Mac Studio · Taro 0.4.1", where: "Porto, PT · 3d ago", current: false, icon: Monitor },
  ]);

  return (
    <div className="space-y-8">
      <SettingsGroup title="Profile">
        <div className="flex items-center gap-4 px-4 py-4">
          <div className="relative">
            <Avatar initials={initials(account.name)} tone="sunset" className="size-14 text-base" />
            <button
              type="button"
              aria-label="Change photo"
              className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full border border-border bg-popover text-muted-foreground transition-colors hover:text-foreground"
            >
              <Camera className="size-3" />
            </button>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{account.name || "Unnamed"}</p>
            <p className="text-xs text-muted-foreground">
              @{account.handle || "handle"} · Pro plan
            </p>
          </div>
          <Badge variant="taro" className="ml-auto">
            Pro
          </Badge>
        </div>
        <SettingsRow label="Display name" htmlFor="acc-name">
          <Input id="acc-name" value={account.name} onChange={(e) => patch({ name: e.target.value })} className="w-60" />
        </SettingsRow>
        <SettingsRow label="Email" description="Used for sign-in and notifications." htmlFor="acc-email">
          <Input
            id="acc-email"
            type="email"
            value={account.email}
            onChange={(e) => patch({ email: e.target.value })}
            className="w-60"
          />
        </SettingsRow>
        <SettingsRow label="Handle" description="How agents and teammates @mention you." htmlFor="acc-handle">
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
              @
            </span>
            <Input
              id="acc-handle"
              value={account.handle}
              onChange={(e) => patch({ handle: e.target.value.replace(/[^a-z0-9_-]/gi, "").toLowerCase() })}
              className="w-60 pl-7"
            />
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Notifications">
        <SettingsRow label="Mentions & replies" description="When an agent or teammate needs your input.">
          <Switch
            aria-label="Mentions & replies"
            checked={account.notifyMentions}
            onCheckedChange={(v) => patch({ notifyMentions: v })}
          />
        </SettingsRow>
        <SettingsRow label="Daily design digest" description="A morning summary of agent work and open reviews.">
          <Switch
            aria-label="Daily design digest"
            checked={account.notifyDigest}
            onCheckedChange={(v) => patch({ notifyDigest: v })}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Sessions"
        description="Devices currently signed in to your account."
        action={
          sessions.length > 1 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSessions((list) => list.filter((s) => s.current))}
            >
              Sign out others
            </Button>
          ) : undefined
        }
      >
        {sessions.map(({ id, device, where, current, icon: Icon }) => (
          <SettingsRow
            key={id}
            label={
              <span className="flex items-center gap-2.5">
                <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
                {device}
                {current && <Badge variant="success">This device</Badge>}
              </span>
            }
            description={<span className="pl-[26px]">{where}</span>}
          >
            {!current && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSessions((list) => list.filter((s) => s.id !== id))}
              >
                Revoke
              </Button>
            )}
          </SettingsRow>
        ))}
      </SettingsGroup>

      <SettingsGroup title="Danger zone">
        <SettingsRow label="Sign out" description="Sign out of Taro on this device.">
          <Button variant="secondary" size="sm">
            <LogOut />
            Sign out
          </Button>
        </SettingsRow>
        <SettingsRow
          label="Delete account"
          description="Permanently delete your account, threads and design history. This cannot be undone."
        >
          {confirmDelete ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" className="bg-destructive text-white hover:bg-destructive/90">
                Yes, delete
              </Button>
            </>
          ) : (
            <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
              Delete account
            </Button>
          )}
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
}

/* ------------------------------------------------------------------
 * Appearance
 * ------------------------------------------------------------------ */

const themeCards: { id: Theme; label: string; icon: typeof Moon; available: boolean }[] = [
  { id: "dark", label: "Dark", icon: Moon, available: true },
  { id: "light", label: "Light", icon: Sun, available: false },
  { id: "system", label: "System", icon: Monitor, available: false },
];

export function AppearanceSection({ settings, update }: SectionProps) {
  const appearance = settings.appearance;
  const patch = (value: Partial<typeof appearance>) => update("appearance", { ...appearance, ...value });

  return (
    <div className="space-y-8">
      <section className="space-y-2.5">
        <h3 className="px-0.5 text-[13px] font-medium text-foreground">Theme</h3>
        <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Theme">
          {themeCards.map(({ id, label, icon: Icon, available }) => {
            const active = appearance.theme === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!available}
                onClick={() => patch({ theme: id })}
                className={cn(
                  "group rounded-xl border bg-card p-2 text-left transition-colors disabled:cursor-not-allowed",
                  active ? "border-taro/60 ring-2 ring-taro/20" : "border-border enabled:hover:border-[#333]"
                )}
              >
                <ThemePreview theme={id} />
                <div className="mt-2 flex items-center gap-1.5 px-1 text-xs">
                  <Icon className="size-3.5 text-muted-foreground" />
                  <span className={cn(available ? "text-foreground" : "text-muted-foreground")}>{label}</span>
                  {!available && (
                    <Badge variant="default" className="ml-auto">
                      Soon
                    </Badge>
                  )}
                  {active && <Check className="ml-auto size-3.5 text-taro" />}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <SettingsGroup>
        <SettingsRow label="Accent" description="Highlights, focus rings and active states.">
          <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Accent colour">
            {accents.map((accent) => {
              const active = appearance.accent === accent.id;
              return (
                <button
                  key={accent.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={accent.label}
                  title={accent.label}
                  onClick={() => patch({ accent: accent.id })}
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full ring-offset-2 ring-offset-card transition-shadow",
                    active ? "ring-2 ring-white/70" : "hover:ring-2 hover:ring-white/20"
                  )}
                  style={{ backgroundColor: accent.hex }}
                >
                  {active && <Check className="size-3 text-black/70" strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        </SettingsRow>
        <SettingsRow label="Interface density" description="Scales type and spacing across the app.">
          <Segmented<Density>
            ariaLabel="Interface density"
            value={appearance.density}
            onValueChange={(density) => patch({ density })}
            options={[
              { value: "compact", label: "Compact" },
              { value: "comfortable", label: "Default" },
              { value: "spacious", label: "Spacious" },
            ]}
          />
        </SettingsRow>
        <SettingsRow label="Reduce motion" description="Minimise animations and transitions.">
          <Switch
            aria-label="Reduce motion"
            checked={appearance.reduceMotion}
            onCheckedChange={(v) => patch({ reduceMotion: v })}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Canvas">
        <SettingsRow label="Dot grid" description="Show the background grid behind previews in Review mode.">
          <Switch
            aria-label="Dot grid"
            checked={appearance.canvasGrid}
            onCheckedChange={(v) => patch({ canvasGrid: v })}
          />
        </SettingsRow>
        <SettingsRow
          label="Expand code by default"
          description="Code stays in the background in Taro. Turn on to open diffs automatically."
        >
          <Switch
            aria-label="Expand code by default"
            checked={appearance.showCodeByDefault}
            onCheckedChange={(v) => patch({ showCodeByDefault: v })}
          />
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
}

function ThemePreview({ theme }: { theme: Theme }) {
  const dark = { bg: "#000", side: "#0a0a0a", line: "#262626", card: "#141414" };
  const light = { bg: "#fafafa", side: "#f0f0f0", line: "#dcdcdc", card: "#ffffff" };

  const pane = (c: typeof dark) => (
    <div className="flex h-full w-full" style={{ backgroundColor: c.bg }}>
      <div className="flex w-1/3 flex-col gap-1 p-1.5" style={{ backgroundColor: c.side }}>
        <span className="h-1 w-3/4 rounded-full" style={{ backgroundColor: c.line }} />
        <span className="h-1 w-1/2 rounded-full bg-taro/70" />
        <span className="h-1 w-2/3 rounded-full" style={{ backgroundColor: c.line }} />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-1.5">
        <span className="h-1 w-1/2 rounded-full" style={{ backgroundColor: c.line }} />
        <span className="h-1 w-3/4 rounded-full" style={{ backgroundColor: c.line }} />
        <span className="mt-auto h-3 rounded" style={{ backgroundColor: c.card, border: `1px solid ${c.line}` }} />
      </div>
    </div>
  );

  return (
    <div className="h-16 overflow-hidden rounded-lg ring-1 ring-inset ring-white/10">
      {theme === "dark" && pane(dark)}
      {theme === "light" && pane(light)}
      {theme === "system" && (
        <div className="relative h-full w-full">
          <div className="absolute inset-0">{pane(light)}</div>
          <div className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]">{pane(dark)}</div>
        </div>
      )}
    </div>
  );
}
