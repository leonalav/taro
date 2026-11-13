import * as React from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Bell, Copy, Maximize2, Minus, UserRound, X } from "lucide-react";
import {BrandMark} from "@/components/taro-mark";

/** Desktop window title bar with native controls and a centered "Taro / folder / session" trail. */
export function TitleBar({ crumbs,welcome,onHome,onAccount }: { crumbs: string[];welcome?:boolean;onHome?:()=>void;onAccount?:()=>void }) {
  const [maximized, setMaximized] = React.useState(false);
  const [notifications,setNotifications]=React.useState(false);

  React.useEffect(() => {
    if (!isTauri()) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;
    const window = getCurrentWindow();

    void window.isMaximized().then((value) => {
      if (!disposed) setMaximized(value);
    });
    void window.onResized(() => {
      void window.isMaximized().then((value) => {
        if (!disposed) setMaximized(value);
      });
    }).then((stopListening) => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const runWindowAction = async (action: "close" | "minimize" | "toggle-maximize") => {
    if (!isTauri()) return;

    const window = getCurrentWindow();
    if (action === "close") await window.close();
    else if (action === "minimize") await window.minimize();
    else {
      await window.toggleMaximize();
      setMaximized(await window.isMaximized());
    }
  };

  return (
    <header className="app-drag relative flex h-10 shrink-0 items-center border-b border-border bg-background px-4" data-tauri-drag-region="deep">
      <div className="app-no-drag flex items-center gap-0.5">
        <WindowControl label="Close window" color="bg-[#ff5f57]" onClick={() => void runWindowAction("close")}>
          <X />
        </WindowControl>
        <WindowControl
          label={maximized ? "Restore window" : "Maximize window"}
          color="bg-[#28c840]"
          onClick={() => void runWindowAction("toggle-maximize")}
        >
          {maximized ? <Copy /> : <Maximize2 />}
        </WindowControl>
        <WindowControl label="Minimize window" color="bg-[#febc2e]" onClick={() => void runWindowAction("minimize")}>
          <Minus />
        </WindowControl>
      </div>
      {onHome&&<button type="button" onClick={onHome} aria-label={welcome ? "Taro — go to welcome" : "Go to welcome"} className="app-no-drag ml-6 flex items-center gap-2 rounded-md text-sm font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-taro"><BrandMark className="size-6"/>{welcome&&"Taro"}</button>}
      {!welcome&&<p className="pointer-events-none absolute inset-x-32 truncate text-center text-xs text-muted-foreground">
        <span className="text-foreground/80">Taro</span>
        {crumbs.map((crumb, i) => (
          <React.Fragment key={i}>
            <span className="mx-1.5 text-muted-foreground/40">/</span>
            <span className={i === crumbs.length - 1 ? "text-foreground/90" : undefined}>{crumb}</span>
          </React.Fragment>
        ))}
      </p>}
      {welcome&&<div className="app-no-drag ml-auto flex items-center gap-4"><div className="relative"><button aria-label="Notifications" aria-expanded={notifications} onClick={()=>setNotifications(value=>!value)} className="rounded-md p-1 text-muted-foreground hover:text-foreground"><Bell className="size-4"/></button>{notifications&&<div role="status" className="absolute top-9 right-0 z-50 w-56 rounded-xl border border-border bg-popover px-4 py-5 text-xs text-muted-foreground shadow-xl">No new notifications.</div>}</div><button aria-label="My account" onClick={onAccount} className="rounded-full bg-white/[0.06] p-1.5 text-muted-foreground hover:text-foreground"><UserRound className="size-4"/></button></div>}
    </header>
  );
}

function WindowControl({
  label,
  color,
  onClick,
  children,
}: {
  label: string;
  color: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      data-tauri-drag-region="false"
      className="group/control relative flex size-6 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/80"
    >
      <span aria-hidden="true" className={`pointer-events-none absolute size-3 rounded-full ${color} ring-1 ring-inset ring-black/20`} />
      <span className="relative z-10 flex items-center justify-center opacity-0 transition-opacity group-hover/control:opacity-100 group-focus-visible/control:opacity-100 [&>svg]:size-2 [&>svg]:stroke-[2.5]" aria-hidden="true">
        {children}
      </span>
    </button>
  );
}
