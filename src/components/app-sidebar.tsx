import * as React from "react";
import {
  ChevronDown,
  Crown,
  Folder,
  FolderPlus,
  Headset,
  MoreVertical,
  PanelLeftClose,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { BrandMark } from "@/components/taro-mark";
import { SessionTree } from "@/components/session-tree";
import { agents, navSections, disabledNavSections, type Folder as FolderType, type NavItem, type Thread } from "@/data/mock";
import { cn } from "@/utils/cn";

export interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeNav: string;
  onNavChange: (id: string) => void;
  onOpenSearch: () => void;
  activeAgentId: string;
  onAgentChange: (id: string) => void;
  folders: FolderType[];
  threads: Thread[];
  activeThreadId: string;
  runningThreadId?: string | null;
  onSelectThread: (id: string) => void;
  onTogglePin: (folderId: string) => void;
  onArchive: (threadId: string) => void;
  onNewThread: (folderId?: string) => void;
  onNewFolder: (name:string) => void | Promise<void>;
  onOpenFolder: () => void | Promise<void>;
  onSelectFolder: (folderId:string) => void;
  onRenameFolder: (folderId:string,name:string) => void;
  onDeleteFolder: (folderId:string) => void;
  onRenameThread: (threadId:string,name:string) => void;
  onMoveThread: (threadId:string,folderId:string) => void;
  onRestoreThread: (threadId:string) => void;
  user: { name: string; email: string; initials: string };
  onOpenAccount: () => void;
  onUpgradePlan: () => void;
}

/* ------------------------------------------------------------------
 * Root
 * ------------------------------------------------------------------ */

export function AppSidebar(props: AppSidebarProps) {
  return props.collapsed ? <RailSidebar {...props} /> : <ExpandedSidebar {...props} />;
}

/* ------------------------------------------------------------------
 * Expanded
 * ------------------------------------------------------------------ */

function ExpandedSidebar({
  onToggle,
  activeNav,
  onNavChange,
  onOpenSearch,
  activeAgentId,
  onAgentChange,
  folders,
  threads,
  activeThreadId,
  runningThreadId,
  onSelectThread,
  onTogglePin,
  onArchive,
  onNewThread,
  onNewFolder,
  onOpenFolder,
  onSelectFolder,
  onRenameFolder,
  onDeleteFolder,
  onRenameThread,
  onMoveThread,
  onRestoreThread,
  user,
  onOpenAccount,
  onUpgradePlan,
}: AppSidebarProps) {
  const [addingFolder,setAddingFolder]=React.useState(false);
  const [folderError,setFolderError]=React.useState("");
  const createFolder=async(name:string)=>{
    try { await onNewFolder(name); setAddingFolder(false); setFolderError(""); }
    catch(error) { setFolderError(String(error)); }
  };
  return (
    <aside className="flex h-full w-[264px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-3 pt-3">
        <BrandMark />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-5 tracking-tight">Taro</p>
          <p className="truncate text-xs text-muted-foreground">Design-first coding agent</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onToggle} title="Collapse sidebar (⌘B)" aria-label="Collapse sidebar">
          <PanelLeftClose />
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 pt-4">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-8 w-full items-center gap-2 rounded-lg border border-sidebar-border bg-background px-2.5 text-[13px] text-muted-foreground transition-colors hover:border-[#2e2e2e] hover:text-foreground"
        >
          <Search className="size-3.5" />
          <span className="flex-1 text-left">Search…</span>
          <Kbd>⌘K</Kbd>
        </button>
      </div>

      {/* Nav + Explorer */}
      <nav className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {navSections.map((section) => (
          <div key={section.label} className="mt-5 first:mt-4">
            <p className="px-2.5 pb-1.5 text-xs text-muted-foreground/70">{section.label}</p>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) =>
                item.id === "agents" ? (
                  <AgentGroup
                    key={item.id}
                    item={item}
                    active={activeNav === item.id}
                    activeAgentId={activeAgentId}
                    onAgentChange={onAgentChange}
                    onActivate={() => onNavChange(item.id)}
                  />
                ) : (
                  <NavButton
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    active={activeNav === item.id}
                    disabled={disabledNavSections.has(item.id)}
                    onClick={() => onNavChange(item.id)}
                  />
                )
              )}
            </div>
          </div>
        ))}

        {/* Explorer — folders (directories) holding chat sessions */}
        <div className="mt-6">
          <div className="flex items-center justify-between px-2.5 pb-1 pt-1">
            <p className="text-xs text-muted-foreground/70">Explorer</p>
            <div className="flex items-center gap-0.5">
              <button type="button" aria-label="Open folder" title="Open an existing folder" onClick={()=>{setFolderError("");void Promise.resolve().then(onOpenFolder).catch(error=>setFolderError(String(error)));}} className="flex size-6 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-taro">
                <Folder className="size-3.5" />
              </button>
              <button type="button" aria-label="Create folder" title="Create and open a folder" onClick={()=>{setFolderError("");setAddingFolder(true);}} className="flex size-6 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-taro">
                <FolderPlus className="size-3.5" />
              </button>
            </div>
          </div>
          {addingFolder && <input autoFocus aria-label="Folder name" placeholder="New folder name" className="mb-1 h-7 w-full rounded-md border border-taro/40 bg-background px-2 text-sm outline-none" onKeyDown={e=>{if(e.key==="Enter")void createFolder(e.currentTarget.value);if(e.key==="Escape")setAddingFolder(false);}} />}
          {folderError && <p role="alert" className="px-2 pb-1 text-xs text-red-400">{folderError}</p>}
          <SessionTree
            folders={folders}
            threads={threads}
            activeThreadId={activeThreadId}
            runningThreadId={runningThreadId}
            onSelectThread={onSelectThread}
            onTogglePin={onTogglePin}
            onArchive={onArchive}
            onNewThread={onNewThread}
            onSelectFolder={onSelectFolder}
            onRenameFolder={onRenameFolder}
            onDeleteFolder={onDeleteFolder}
            onRenameThread={onRenameThread}
            onMoveThread={onMoveThread}
            onRestoreThread={onRestoreThread}
          />
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3">
        <Button
          variant="default"
          size="sm"
          className="mb-2 w-full justify-start gap-2 rounded-full bg-white px-3 text-black shadow-none hover:bg-white/85"
          onClick={onUpgradePlan}
          title="Manage plan — upgrade to Lite+"
        >
          <Crown className="size-3.5 text-black" />
          <span className="flex-1 text-left">Upgrade plan</span>
          <span className="rounded-full bg-black/10 px-1.5 py-px text-[10px] leading-4 font-medium text-black/70">
            Lite+
          </span>
        </Button>
        <button
          type="button"
          className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        >
          <Headset className="size-4 shrink-0" strokeWidth={1.75} />
          <span className="flex-1 text-left">Need support?</span>
          <Badge variant="subtle">New</Badge>
        </button>
        <NavButton
          icon={Settings}
          label="Settings"
          active={activeNav === "settings"}
          onClick={() => onNavChange("settings")}
        />

        <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-sidebar-border bg-background p-2">
          <Avatar initials={user.initials} tone="sunset" size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium leading-4">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="My account" title="My account" onClick={onOpenAccount}>
            <MoreVertical />
          </Button>
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------
 * Collapsed icon rail
 * ------------------------------------------------------------------ */

function RailSidebar({
  onToggle,
  activeNav,
  onNavChange,
  onOpenSearch,
  user,
  onOpenAccount,
  onUpgradePlan,
}: AppSidebarProps) {
  return (
    <aside className="flex h-full w-[60px] shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar py-3">
      <button
        type="button"
        onClick={onToggle}
        aria-label="Expand sidebar"
        title="Expand sidebar (⌘B)"
        className="rounded-lg transition-transform hover:scale-105"
      >
        <BrandMark />
      </button>

      <div className="mt-4 flex flex-col items-center gap-1">
        <RailButton icon={Search} label="Search (⌘K)" onClick={onOpenSearch} />
        <span className="my-1.5 h-px w-6 bg-border" />
        {navSections.map((section, i) => (
          <React.Fragment key={section.label}>
            {i > 0 && <span className="my-1.5 h-px w-6 bg-border" />}
            {section.items.map((item) => (
              <RailButton
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={activeNav === item.id}
                disabled={disabledNavSections.has(item.id)}
                onClick={() => onNavChange(item.id)}
              />
            ))}
          </React.Fragment>
        ))}
      </div>

      <div className="mt-auto flex flex-col items-center gap-1">
        <RailButton
          icon={Crown}
          label="Upgrade plan — Lite+"
          onClick={onUpgradePlan}
          className="bg-white text-black hover:bg-white/85 hover:text-black"
        />
        <RailButton icon={Headset} label="Need support?" />
        <RailButton icon={Settings} label="Settings" active={activeNav === "settings"} onClick={() => onNavChange("settings")} />
        <button type="button" onClick={onOpenAccount} aria-label="My account" title="My account" className="mt-2 rounded-full">
          <Avatar initials={user.initials} tone="sunset" size="lg" />
        </button>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------
 * Building blocks
 * ------------------------------------------------------------------ */

function NavButton({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
  trailing,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      title={disabled ? `${label} — coming soon` : undefined}
      className={cn(
        "flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
        active && "bg-sidebar-accent text-foreground ring-1 ring-inset ring-white/[0.06]",
        disabled && "cursor-not-allowed opacity-40 hover:bg-transparent"
      )}
    >
      <Icon
        className={cn("size-4 shrink-0", active ? "text-foreground" : "text-muted-foreground/80")}
        strokeWidth={1.75}
      />
      <span className="flex-1 truncate text-left">{label}</span>
      {trailing}
    </button>
  );
}

function AgentGroup({
  item,
  active,
  activeAgentId,
  onAgentChange,
  onActivate,
}: {
  item: NavItem;
  active: boolean;
  activeAgentId: string;
  onAgentChange: (id: string) => void;
  onActivate: () => void;
}) {
  const [open, setOpen] = React.useState(true);

  return (
    <div>
      <NavButton
        icon={item.icon}
        label={item.label}
        active={active}
        onClick={() => {
          setOpen((o) => !o);
          onActivate();
        }}
        trailing={
          <>
            <span className="rounded-md bg-accent px-1.5 text-[11px] leading-5 tabular-nums text-foreground">
              {agents.length}
            </span>
            <ChevronDown
              className={cn("size-3.5 text-muted-foreground transition-transform duration-200", !open && "-rotate-90")}
            />
          </>
        }
      />

      {open && (
        <div className="relative ml-[18px] mt-0.5 flex flex-col gap-0.5 border-l border-border pl-3">
          {agents.map((agent) => {
            const selected = agent.id === activeAgentId;
            return (
              <button
                key={agent.id}
                type="button"
                onClick={() => onAgentChange(agent.id)}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
                  selected && "bg-sidebar-accent text-foreground ring-1 ring-inset ring-white/[0.06]"
                )}
              >
                <span
                  className={cn(
                    "size-2.5 shrink-0 rounded-[3px] border",
                    selected ? "border-taro bg-taro/25" : "border-muted-foreground/40"
                  )}
                />
                <span className="flex-1 truncate text-left">{agent.name}</span>
                {agent.status === "running" && <span className="size-1.5 rounded-full bg-success" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RailButton({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
  className,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={disabled ? `${label} — coming soon` : label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
        active && "bg-sidebar-accent text-foreground ring-1 ring-inset ring-white/[0.06]",
        disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
        className
      )}
    >
      <Icon className="size-[18px]" strokeWidth={1.75} />
    </button>
  );
}
