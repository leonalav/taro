import * as React from "react";
import {invoke} from "@tauri-apps/api/core";
import {ArrowLeft,ArrowRight,Atom,Braces,ChevronRight,Code,Ellipsis,FileText,Folder,Hash,Image,Maximize2,Minimize2,PanelRightClose,Search,TerminalSquare,X} from "lucide-react";
import {CodeView} from "@/components/code-view";
import type {Lang} from "@/data/project";
import {cn} from "@/utils/cn";
import {useWorkspaceWatch} from "@/lib/use-workspace-watch";
const TerminalPanel=React.lazy(()=>import("@/components/terminal-panel").then(module=>({default:module.TerminalPanel})));

interface WorkspaceEntry {name:string;path:string;kind:"dir"|"file"}
interface WorkspaceFile {kind:"text"|"image"|"binary";content?:string;dataUrl?:string}
interface WorkspaceMatch {path:string;line?:number;snippet?:string}

function language(name:string):Lang {
  const ext=name.split(".").pop()?.toLowerCase();
  if(ext==="css")return "css";
  if(ext==="tsx"||ext==="jsx")return "tsx";
  if(["ts","js","mjs","cjs"].includes(ext||""))return "ts";
  if(ext==="json")return "json";
  if(ext==="html")return "html";
  return "md";
}

export function FileIcon({name,className}:{name:string;className?:string}) {
  const ext=name.split(".").pop()?.toLowerCase();
  const base=cn("size-3.5 shrink-0",className);
  if(ext==="css")return <Hash className={cn(base,"text-[#8cc8ff]")}/>;
  if(ext==="tsx"||ext==="jsx")return <Atom className={cn(base,"text-[#7fd4f5]")}/>;
  if(["ts","js","mjs"].includes(ext||""))return <Code className={cn(base,"text-[#8cb4ff]")}/>;
  if(ext==="json")return <Braces className={cn(base,"text-[#f0b37e]")}/>;
  if(["svg","png","jpg","jpeg","jfif","webp","gif"].includes(ext||""))return <Image className={cn(base,"text-[#c4a7ff]")}/>;
  return <FileText className={cn(base,"text-muted-foreground")}/>;
}

function IconButton({label,onClick,disabled,pressed,children}:{label:string;onClick?:()=>void;disabled?:boolean;pressed?:boolean;children:React.ReactNode}) {
  return <button type="button" title={label} aria-label={label} aria-pressed={pressed} onClick={onClick} disabled={disabled} className={cn("flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:pointer-events-none disabled:opacity-30 [&_svg]:size-4",pressed&&"bg-white/[0.08] text-foreground")}>{children}</button>;
}

function TreeList({path,depth,dirs,expanded,loading,onToggle,onOpen}:{path:string;depth:number;dirs:Record<string,WorkspaceEntry[]>;expanded:Set<string>;loading:Set<string>;onToggle:(path:string)=>void;onOpen:(entry:WorkspaceEntry)=>void}) {
  const entries=dirs[path]||[];
  return <ul role={depth===0?"tree":"group"} className="flex flex-col">
    {entries.map(entry=>entry.kind==="dir"?<li key={entry.path} role="treeitem" aria-expanded={expanded.has(entry.path)}>
      <button type="button" onClick={()=>onToggle(entry.path)} style={{paddingLeft:`${10+depth*14}px`}} className="flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-left text-[13px] text-foreground/85 transition-colors hover:bg-white/[0.04]">
        <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform",expanded.has(entry.path)&&"rotate-90")}/><Folder className="size-3.5 shrink-0 text-muted-foreground"/><span className="truncate">{entry.name}</span>
      </button>
      {expanded.has(entry.path)&&(loading.has(entry.path)?<p className="py-1 text-xs text-muted-foreground" style={{paddingLeft:`${28+depth*14}px`}}>Loading…</p>:<TreeList path={entry.path} depth={depth+1} dirs={dirs} expanded={expanded} loading={loading} onToggle={onToggle} onOpen={onOpen}/>)}
    </li>:<li key={entry.path} role="treeitem">
      <button type="button" onClick={()=>onOpen(entry)} title={entry.path} style={{paddingLeft:`${27+depth*14}px`}} className="flex h-7 w-full items-center gap-2 rounded-md pr-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"><FileIcon name={entry.name}/><span className="truncate">{entry.name}</span></button>
    </li>)}
  </ul>;
}

interface ExplorerPanelProps {root?:string;folderName:string;maximized:boolean;onToggleMaximize:()=>void;onClose:()=>void;onChooseFolder:()=>void|Promise<void>}

export function ExplorerPanel({root,folderName,maximized,onToggleMaximize,onClose,onChooseFolder}:ExplorerPanelProps) {
  const [view,setView]=React.useState<"explorer"|"terminal">("explorer");
  const [terminalVisited,setTerminalVisited]=React.useState(false);
  const [dirs,setDirs]=React.useState<Record<string,WorkspaceEntry[]>>({});
  const [loading,setLoading]=React.useState<Set<string>>(new Set());
  const [files,setFiles]=React.useState<Record<string,WorkspaceFile>>({});
  const [expanded,setExpanded]=React.useState<Set<string>>(new Set());
  const [history,setHistory]=React.useState<string[]>([""]);
  const [index,setIndex]=React.useState(0);
  const [tabs,setTabs]=React.useState<string[]>([]);
  const [menuOpen,setMenuOpen]=React.useState(false);
  const [searchOpen,setSearchOpen]=React.useState(false);
  const [query,setQuery]=React.useState("");
  const [results,setResults]=React.useState<WorkspaceMatch[]>([]);
  const [searching,setSearching]=React.useState(false);
  const [error,setError]=React.useState("");
  const [revision,setRevision]=React.useState(0);
  const liveRoot=React.useRef(root);liveRoot.current=root;
  const [copied,setCopied]=React.useState(false);
  const [highlight,setHighlight]=React.useState("");
  const searchRef=React.useRef<HTMLInputElement>(null);
  const menuRef=React.useRef<HTMLDivElement>(null);
  const current=history[index]||"";
  const currentFile=files[current];
  const rootName=folderName||root?.replace(/[\\/]+$/g,"").split(/[\\/]/).pop()||"Explorer";

  const loadDirectory=React.useCallback(async(path:string)=>{
    if(!root)return;
    setLoading(prev=>new Set(prev).add(path));
    try{const entries=await invoke<WorkspaceEntry[]>("list_workspace_directory",{workspaceRoot:root,path});if(liveRoot.current!==root)return;setDirs(prev=>({...prev,[path]:entries}));setError("");}
    finally{setLoading(prev=>{const next=new Set(prev);next.delete(path);return next;});}
  },[root]);

  React.useEffect(()=>{
    setDirs({});setFiles({});setExpanded(new Set());setHistory([""]);setIndex(0);setTabs([]);setSearchOpen(false);setQuery("");setError("");
    if(root)void loadDirectory("").catch(e=>setError(String(e)));
  },[root,loadDirectory]);

  const refresh=React.useCallback(async()=>{
    if(!root)return;
    const paths=["",...expanded];
    await Promise.all(paths.map(path=>loadDirectory(path).catch(e=>{if(liveRoot.current!==root)return;if(path)setExpanded(previous=>{const next=new Set(previous);next.delete(path);return next;});else setError(String(e));})));
    if(current)await invoke<WorkspaceFile>("read_workspace_file",{workspaceRoot:root,path:current}).then(file=>{if(liveRoot.current===root)setFiles(prev=>({...prev,[current]:file}));}).catch(e=>{if(liveRoot.current===root){setError(String(e));setFiles(prev=>{const next={...prev};delete next[current];return next;});}});
    if(liveRoot.current===root)setRevision(value=>value+1);
  },[root,expanded,current,loadDirectory]);
  const watchPaths=[...new Set([...expanded,...(searchOpen?results.map(result=>result.path.split("/").slice(0,-1).join("/")):[])])];
  useWorkspaceWatch(root,watchPaths,refresh,setError);

  React.useEffect(()=>{const listener=()=>{void refresh();};window.addEventListener("taro:workspace-changed",listener);return()=>window.removeEventListener("taro:workspace-changed",listener);},[refresh]);
  React.useEffect(()=>{if(!menuOpen)return;const close=(event:MouseEvent)=>{if(!menuRef.current?.contains(event.target as Node))setMenuOpen(false);};const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setMenuOpen(false);};document.addEventListener("mousedown",close);document.addEventListener("keydown",escape);return()=>{document.removeEventListener("mousedown",close);document.removeEventListener("keydown",escape);};},[menuOpen]);
  React.useEffect(()=>{if(searchOpen)searchRef.current?.focus();},[searchOpen]);
  React.useEffect(()=>{
    if(!root||!searchOpen||!query.trim()){setResults([]);setSearching(false);return;}
    let stale=false;setSearching(true);
    const timer=window.setTimeout(()=>{void invoke<WorkspaceMatch[]>("search_workspace",{workspaceRoot:root,query}).then(items=>{if(!stale){setResults(items);setError("");}}).catch(e=>{if(!stale)setError(String(e));}).finally(()=>{if(!stale)setSearching(false);});},220);
    return()=>{stale=true;window.clearTimeout(timer);};
  },[root,searchOpen,query,revision]);

  const navigate=(path:string)=>{
    setView("explorer");
    if(path===current)return;
    setHistory(previous=>[...previous.slice(0,index+1),path]);
    setIndex(index+1);
  };
  const openFile=async(entry:WorkspaceEntry)=>{
    if(!root)return;
    setTabs(previous=>previous.includes(entry.path)?previous:[...previous,entry.path]);
    const parts=entry.path.split("/");
    const ancestors=parts.slice(1).map((_,i)=>parts.slice(0,i+1).join("/"));
    setExpanded(previous=>new Set([...previous,...ancestors]));
    for(const path of ancestors)if(!dirs[path])void loadDirectory(path).catch(e=>setError(String(e)));
    navigate(entry.path);setSearchOpen(false);setHighlight(query.trim());setMenuOpen(false);
    try{const file=await invoke<WorkspaceFile>("read_workspace_file",{workspaceRoot:root,path:entry.path});setFiles(previous=>({...previous,[entry.path]:file}));setError("");}
    catch(e){setError(String(e));}
  };
  const toggle=(path:string)=>{setExpanded(previous=>{const next=new Set(previous);if(next.has(path))next.delete(path);else next.add(path);return next;});if(!dirs[path])void loadDirectory(path).catch(e=>setError(String(e)));};
  const step=(direction:-1|1)=>{const next=index+direction;if(next>=0&&next<history.length){setIndex(next);setMenuOpen(false);}};
  const closeTab=(path:string)=>{const remaining=tabs.filter(item=>item!==path);setTabs(remaining);if(current===path)navigate(remaining.at(-1)||"");setMenuOpen(false);};
  const closeAll=()=>{setTabs([]);navigate("");setMenuOpen(false);};
  const absolutePath=current?`${root?.replace(/[\\/]+$/g,"")}${root?.includes("\\")?"\\":"/"}${current.replace(/\//g,root?.includes("\\")?"\\":"/")}`:root||"";
  const copyPath=async()=>{try{if(!navigator.clipboard)throw Error("Clipboard is unavailable");await navigator.clipboard.writeText(absolutePath);setCopied(true);window.setTimeout(()=>setCopied(false),1200);}catch(e){setError(String(e));}};
  const reveal=async()=>{if(!root)return;try{await invoke("reveal_workspace_entry",{workspaceRoot:root,path:current});setMenuOpen(false);}catch(e){setError(String(e));}};
  const revealInTree=(path:string)=>{navigate("");const segments=path.split("/");for(let i=1;i<=segments.length;i++){const prefix=segments.slice(0,i).join("/");setExpanded(previous=>new Set(previous).add(prefix));if(!dirs[prefix])void loadDirectory(prefix).catch(e=>setError(String(e)));}};
  const onPanelKeyDown=(event:React.KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="f"){event.preventDefault();setSearchOpen(true);}if(event.altKey&&event.key==="ArrowLeft"){event.preventDefault();step(-1);}if(event.altKey&&event.key==="ArrowRight"){event.preventDefault();step(1);}};

  return <aside onKeyDown={onPanelKeyDown} className="flex min-w-0 flex-1 flex-col bg-[#0b0b0b]">
    <div className="flex h-10 shrink-0 items-stretch border-b border-border">
      <div className="flex shrink-0 items-center gap-0.5 px-2" role="group" aria-label="Panel view">
        <IconButton label="Show explorer" onClick={()=>navigate("")} pressed={view==="explorer"}><Folder/></IconButton>
        <IconButton label="Show terminal" onClick={()=>{setView("terminal");setTerminalVisited(true);setMenuOpen(false);setSearchOpen(false);}} pressed={view==="terminal"}><TerminalSquare/></IconButton>
      </div>
      <div className="scrollbar-none flex min-w-0 flex-1 items-stretch overflow-x-auto" role="tablist">
        {tabs.map(path=>{const name=path.split("/").pop()||path;return <div key={path} role="tab" aria-selected={path===current} className={cn("group relative flex shrink-0 items-center gap-2 border-r border-border pr-1.5 pl-3 text-[13px] transition-colors",path===current?"bg-[#141414] text-foreground":"text-muted-foreground hover:text-foreground")}>
          {path===current&&<span className="absolute inset-x-0 top-0 h-px bg-taro"/>}<button type="button" onClick={()=>navigate(path)} title={path} className="flex items-center gap-2"><FileIcon name={name}/>{name}</button><button type="button" aria-label={`Close ${name}`} onClick={()=>closeTab(path)} className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-white/[0.08] hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"><X className="size-3"/></button>
        </div>;})}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 px-2"><IconButton label={maximized?"Restore panel":"Maximize panel"} onClick={onToggleMaximize}>{maximized?<Minimize2/>:<Maximize2/>}</IconButton><IconButton label="Close panel" onClick={onClose}><PanelRightClose/></IconButton></div>
    </div>
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
      <IconButton label="Back (Alt+←)" onClick={()=>step(-1)} disabled={index===0}><ArrowLeft/></IconButton><IconButton label="Forward (Alt+→)" onClick={()=>step(1)} disabled={index>=history.length-1}><ArrowRight/></IconButton>
      <nav aria-label="Breadcrumb" className="ml-1 flex min-w-0 items-center gap-0.5 overflow-hidden text-[13px]"><button type="button" onClick={()=>navigate("")} className="truncate rounded px-1.5 py-0.5 text-foreground hover:bg-white/[0.06]">{rootName}</button>{current.split("/").filter(Boolean).map((segment,i,all)=>{const prefix=all.slice(0,i+1).join("/");return <React.Fragment key={prefix}><ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60"/><button type="button" onClick={()=>i===all.length-1?undefined:revealInTree(prefix)} className="truncate rounded px-1.5 py-0.5 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground">{segment}</button></React.Fragment>;})}</nav>
      <div ref={menuRef} className="relative ml-auto flex shrink-0 items-center gap-0.5"><IconButton label="More actions" onClick={()=>setMenuOpen(value=>!value)} disabled={!root} pressed={menuOpen}><Ellipsis/></IconButton><IconButton label="Search files (⌘F)" onClick={()=>{setView("explorer");setSearchOpen(value=>!value);}} disabled={!root} pressed={view==="explorer"&&searchOpen}><Search/></IconButton>
        {menuOpen&&root&&<div className="animate-pop absolute top-full right-0 z-40 mt-1 w-48 rounded-xl border border-border bg-popover p-1 shadow-2xl shadow-black/70">
          <MenuItem onClick={()=>{void refresh();setMenuOpen(false);}}>Refresh files</MenuItem><MenuItem onClick={()=>{void reveal();}}>Reveal in file manager</MenuItem><MenuItem onClick={()=>{void copyPath();}}>{copied?"Copied!":"Copy path"}</MenuItem>
          {tabs.length>0&&<><div className="my-1 h-px bg-border"/>{current&&<MenuItem onClick={()=>closeTab(current)}>Close tab</MenuItem>}<MenuItem onClick={closeAll}>Close all tabs</MenuItem></>}
        </div>}
      </div>
    </div>
    {searchOpen&&root&&<div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-[#0f0f0f] px-3"><Search className="size-3.5 text-muted-foreground"/><input ref={searchRef} value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==="Escape"){setSearchOpen(false);setQuery("");}}} placeholder="Search files and contents" aria-label="Search files" className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/70"/><IconButton label="Close search" onClick={()=>{setSearchOpen(false);setQuery("");}}><X/></IconButton></div>}
    {error&&<div role="alert" className="border-b border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-300">{error}</div>}
    {terminalVisited&&<div className={cn("min-h-0 flex-1 flex-col",view==="terminal"?"flex":"hidden")}><React.Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Opening terminals…</p>}><TerminalPanel key={root||"no-workspace"} root={root} visible={view==="terminal"}/></React.Suspense></div>}
    <div className={cn("scrollbar-thin min-h-0 flex-1 overflow-auto",view==="terminal"&&"hidden")}>
      {!root?<div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"><Folder className="size-8 text-muted-foreground/60"/><p className="text-sm font-medium text-foreground">Choose a folder</p><p className="max-w-56 text-xs leading-5 text-muted-foreground">Open a folder to see its real files here.</p><button type="button" onClick={()=>{void Promise.resolve().then(onChooseFolder).catch(e=>setError(String(e)));}} className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-white/[0.06]">Open folder</button></div>:
      searchOpen&&query.trim()?<div className="p-2"><p className="px-2.5 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">{searching?"Searching…":`${results.length} result${results.length===1?"":"s"}`}</p>{results.map(result=><button key={`${result.path}:${result.line||0}`} type="button" onClick={()=>{void openFile({name:result.path.split("/").pop()||result.path,path:result.path,kind:"file"});}} className="flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left hover:bg-white/[0.05]"><span className="flex items-center gap-2 text-xs text-foreground"><FileIcon name={result.path}/><span className="truncate">{result.path}</span>{result.line&&<span className="text-muted-foreground">:{result.line}</span>}</span>{result.snippet&&<span className="truncate pl-5 text-xs text-muted-foreground">{result.snippet}</span>}</button>)}</div>:
      !current?<div className="p-2"><p className="px-2.5 pt-1 pb-2 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{rootName}</p>{loading.has("")&&!dirs[""]?<p className="px-2.5 text-xs text-muted-foreground">Loading files…</p>:dirs[""]?.length?<TreeList path="" depth={0} dirs={dirs} expanded={expanded} loading={loading} onToggle={toggle} onOpen={entry=>{void openFile(entry);}}/>:<p className="px-2.5 text-xs text-muted-foreground">This folder is empty.</p>}</div>:
      !currentFile?<p className="p-4 text-xs text-muted-foreground">Opening {current}…</p>:
      currentFile.kind==="text"?<CodeView key={current} source={currentFile.content||""} lang={language(current)} query={highlight} className="bg-[#0b0b0b] py-2"/>:
      currentFile.kind==="image"?<div className="flex min-h-full items-center justify-center p-6"><img src={currentFile.dataUrl} alt={current.split("/").pop()||current} className="max-h-full max-w-full object-contain"/></div>:
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center"><FileIcon name={current} className="size-6"/><p className="text-[13px] text-foreground">{current.split("/").pop()}</p><p className="text-xs text-muted-foreground">Binary file — preview not available.</p></div>}
    </div>
  </aside>;
}

function MenuItem({onClick,children}:{onClick:()=>void;children:React.ReactNode}) {return <button type="button" onClick={onClick} className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">{children}</button>;}
