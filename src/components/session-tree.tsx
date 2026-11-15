import * as React from "react";
import { Archive, Folder, FolderOpen, Pin, PinOff, Plus, MoreHorizontal, RotateCcw, Pencil, ArrowRight, Trash2, LoaderCircle } from "lucide-react";
import type { Folder as FolderType, Thread } from "@/data/mock";
import { cn } from "@/utils/cn";

interface SessionTreeProps {
  folders: FolderType[];
  threads: Thread[];
  activeThreadId: string;
  runningThreadId?: string | null;
  onSelectThread: (id: string) => void;
  onTogglePin: (folderId: string) => void;
  onArchive: (threadId: string) => void;
  onNewThread: (folderId: string) => void;
  onSelectFolder: (folderId:string) => void;
  onRenameFolder: (folderId:string,name:string) => void;
  onDeleteFolder: (folderId:string) => void;
  onRenameThread: (threadId:string,name:string) => void;
  onMoveThread: (threadId:string,folderId:string) => void;
  onRestoreThread: (threadId:string) => void;
}

/** Pinned folders first (most recently pinned on top), then original order. */
export function sortFolders(folders: FolderType[]): FolderType[] {
  return folders
    .map((folder, i) => ({ folder, i }))
    .sort((a, b) => {
      const pa = a.folder.pinnedAt ?? 0;
      const pb = b.folder.pinnedAt ?? 0;
      if (pa || pb) return pb - pa;
      return a.i - b.i;
    })
    .map(({ folder }) => folder);
}

/**
 * Left-bar Explorer. Folders represent directories; each holds chat
 * sessions. Hovering a session reveals Pin (pins its folder to the top)
 * and Archive (removes the session from the list).
 */
export function SessionTree({
  folders,
  threads,
  activeThreadId,
  runningThreadId,
  onSelectThread,
  onTogglePin,
  onArchive,
  onNewThread,
  onSelectFolder,
  onRenameFolder,
  onDeleteFolder,
  onRenameThread,
  onMoveThread,
  onRestoreThread,
}: SessionTreeProps) {
  const activeFolderId = threads.find((t) => t.id === activeThreadId)?.folderId;
  const [open, setOpen] = React.useState<Set<string>>(() => new Set(activeFolderId ? [activeFolderId] : []));
  const [menu,setMenu]=React.useState<string|null>(null);
  const [rename,setRename]=React.useState<{kind:"folder"|"chat";id:string;value:string}|null>(null);
  const [showArchived,setShowArchived]=React.useState(false);
  React.useEffect(()=>{const close=(event:MouseEvent)=>{if(!(event.target as HTMLElement).closest("[data-explorer-menu]"))setMenu(null);};document.addEventListener("mousedown",close);return()=>document.removeEventListener("mousedown",close);},[]);
  const commitRename=()=>{if(!rename)return; if(rename.kind==="folder")onRenameFolder(rename.id,rename.value);else onRenameThread(rename.id,rename.value);setRename(null);};

  // Keep the active session's folder expanded.
  React.useEffect(() => {
    if (!activeFolderId) return;
    setOpen((prev) => (prev.has(activeFolderId) ? prev : new Set([...prev, activeFolderId])));
  }, [activeFolderId]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <ul className="flex flex-col gap-px">
      {sortFolders(folders).map((folder) => {
        const sessions = threads.filter((t) => t.folderId === folder.id && !t.archived);
        const isOpen = open.has(folder.id);
        const FolderIcon = isOpen ? FolderOpen : Folder;
        const pinned = Boolean(folder.pinnedAt);

        return (
          <li key={folder.id} className={cn(isOpen && sessions.length > 0 && "pb-1.5")}>
            <div className="group/folder relative flex items-center" data-explorer-menu>
              {rename?.kind==="folder"&&rename.id===folder.id ? <input autoFocus aria-label={`Rename ${folder.name}`} value={rename.value} onChange={e=>setRename({...rename,value:e.target.value})} onKeyDown={e=>{if(e.key==="Enter")commitRename();if(e.key==="Escape")setRename(null);}} onBlur={commitRename} className="h-7 min-w-0 flex-1 rounded border border-taro/50 bg-background px-2 text-sm outline-none"/> :
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => {toggle(folder.id);onSelectFolder(folder.id);}}
                className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
              >
                <FolderIcon className="size-3.5 shrink-0 text-muted-foreground/70" strokeWidth={1.75} />
                <span className="truncate">{folder.name}</span>
                {pinned && <Pin className="size-3 shrink-0 text-taro/80" aria-label="Pinned" />}
              </button>
              }
              <button
                type="button"
                aria-label={`New chat in ${folder.name}`}
                title="New chat"
                onClick={() => {
                  onNewThread(folder.id);
                  setOpen((prev) => new Set([...prev, folder.id]));
                }}
                className="absolute right-7 flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover/folder:opacity-100 hover:bg-white/[0.06] hover:text-foreground focus-visible:opacity-100"
              >
                <Plus className="size-3" />
              </button>
              <button type="button" aria-label={`Options for ${folder.name}`} onClick={()=>setMenu(menu===`folder:${folder.id}`?null:`folder:${folder.id}`)} className="absolute right-1 flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/folder:opacity-100 focus-visible:opacity-100"><MoreHorizontal className="size-3.5"/></button>
              {menu===`folder:${folder.id}` && <div className="absolute right-0 top-7 z-50 w-48 rounded-xl border border-border bg-card p-1 shadow-xl">
                <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent" onClick={()=>{onNewThread(folder.id);setOpen(prev=>new Set([...prev,folder.id]));setMenu(null);}}><Plus className="size-3"/>New chat</button>
                {folder.id!=="taro" && <><button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent" onClick={()=>{setRename({kind:"folder",id:folder.id,value:folder.name});setMenu(null);}}><Pencil className="size-3"/>Rename folder</button><button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent" onClick={()=>{onDeleteFolder(folder.id);setMenu(null);}}><Trash2 className="size-3"/>Remove folder · move chats to taro</button></>}
              </div>}
            </div>

            {isOpen && (
              <ul className="flex flex-col gap-px">
                {sessions.length === 0 && (
                  <li className="py-1 pl-8 text-xs text-muted-foreground">No chats</li>
                )}
                {sessions.map((session) => {
                  const active = session.id === activeThreadId;
                  return (
                    <li key={session.id} className="group/row relative" data-explorer-menu>
                      {rename?.kind==="chat"&&rename.id===session.id ? <input autoFocus aria-label={`Rename ${session.name}`} value={rename.value} onChange={e=>setRename({...rename,value:e.target.value})} onKeyDown={e=>{if(e.key==="Enter")commitRename();if(e.key==="Escape")setRename(null);}} onBlur={commitRename} className="ml-5 h-7 w-[calc(100%-1.25rem)] rounded border border-taro/50 bg-background px-2 text-sm outline-none"/> :
                      <button
                        type="button"
                        onClick={() => onSelectThread(session.id)}
                         onDoubleClick={() => {if(session.id!=="brand")setRename({kind:"chat",id:session.id,value:session.name});}}
                         onKeyDown={event=>{if(event.key==="F2"&&session.id!=="brand"){event.preventDefault();setRename({kind:"chat",id:session.id,value:session.name});}}}
                        aria-current={active ? "true" : undefined}
                        title={session.name}
                        className={cn(
                          "flex h-7 w-full items-center gap-2.5 rounded-md pr-2 pl-[22px] text-left text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
                          active && "bg-sidebar-accent text-foreground ring-1 ring-inset ring-white/[0.05]"
                        )}
                      >
                        {session.id===runningThreadId?<LoaderCircle aria-label="Running" className="size-3 shrink-0 animate-spin text-taro"/>:<span data-status-dot="true" className={cn("size-1.5 shrink-0 rounded-full",active?"bg-taro":"bg-muted-foreground/40")}/>}
                        <span className="min-w-0 flex-1 truncate">{session.name}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums group-focus-within/row:opacity-0 group-hover/row:opacity-0">
                          {session.updated}
                        </span>
                      </button>
                      }

                      {/* Hover actions */}
                      <div className="absolute inset-y-0 right-1 flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100">
                        <button
                          type="button"
                          aria-label={pinned ? `Unpin ${folder.name}` : `Pin ${folder.name} to top`}
                          title={pinned ? "Unpin folder" : "Pin folder to top"}
                          onClick={() => onTogglePin(folder.id)}
                          className={cn(
                            "flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground",
                            pinned && "text-taro"
                          )}
                        >
                          {pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
                        </button>
                        {session.id!=="brand" && <button
                          type="button"
                          aria-label={`Archive ${session.name}`}
                          title="Archive"
                          onClick={() => onArchive(session.id)}
                          className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground"
                        >
                          <Archive className="size-3" />
                        </button>}
                        {session.id!=="brand" && <button type="button" aria-label={`Options for ${session.name}`} onClick={()=>setMenu(menu===`chat:${session.id}`?null:`chat:${session.id}`)} className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"><MoreHorizontal className="size-3"/></button>}
                      </div>
                      {menu===`chat:${session.id}` && <div className="absolute right-0 top-7 z-50 w-44 rounded-xl border border-border bg-card p-1 shadow-xl"><button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent" onClick={()=>{setRename({kind:"chat",id:session.id,value:session.name});setMenu(null);}}><Pencil className="size-3"/>Rename chat</button><p className="px-2 py-1 text-[10px] text-muted-foreground">Move to folder</p>{folders.filter(f=>f.id!==session.folderId).map(f=><button key={f.id} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent" onClick={()=>{onMoveThread(session.id,f.id);setMenu(null);}}><ArrowRight className="size-3"/>{f.name}</button>)}<button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent" onClick={()=>{onArchive(session.id);setMenu(null);}}><Archive className="size-3"/>Archive</button></div>}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
      {threads.some(t=>t.archived) && <li className="mt-2"><button type="button" onClick={()=>setShowArchived(v=>!v)} className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-xs text-muted-foreground hover:bg-sidebar-accent">Archived ({threads.filter(t=>t.archived).length})</button>{showArchived && <ul>{threads.filter(t=>t.archived).map(t=><li key={t.id} className="flex items-center gap-1 pl-5"><span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{t.name}</span><button type="button" aria-label={`Restore ${t.name}`} title="Restore chat" onClick={()=>onRestoreThread(t.id)} className="p-1 text-muted-foreground hover:text-foreground"><RotateCcw className="size-3"/></button></li>)}</ul>}</li>}
    </ul>
  );
}
