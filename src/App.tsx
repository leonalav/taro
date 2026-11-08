import * as React from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { ChatPanel, type RightPanel } from "@/components/chat-panel";
import { GalleryPage } from "@/components/gallery-page";
import { ArtifactsPage } from "@/components/artifacts-page";
import { StatisticsPage } from "@/components/statistics-page";
import { CommandPalette } from "@/components/command-palette";
import { GitPanel } from "@/components/git-panel";
import { SkeletalEditor, type CanvasLayer, type EditorMedia } from "@/components/skeletal-editor";
import { useLibrary } from "@/lib/media-store";
import { ExplorerPanel } from "@/components/explorer-panel";
import { ReviewCanvas, EmptyReviewCanvas } from "@/components/review-canvas";
import { TasksBoard } from "@/components/tasks-board";
import { TitleBar } from "@/components/title-bar";
import {
  TASK_STATUSES,
  agents,
  seedFolders,
  seedTasks,
  seedThreads,
  ensureNikeSubagentArtifact,
  type ChatMessage,
  type ActivityKind,
  type DocComment,
  type Folder,
  type Segment,
  type PermissionChoice,
  type Task,
  type TaskStatus,
  type ToolActivity,
  type SkeletalLayerData,
  type Thread,
} from "@/data/mock";
import type { Artifact } from "@/data/artifacts";
import { mediaItems, type MediaItem } from "@/data/media";
import type { ChipInsertion, ChipRef, CommentReference } from "@/data/mentions";
import { artifactToChip, mediaToChip } from "@/lib/reuse";
import { Composer,plainText } from "@/components/composer";
import {ReceptionPage} from "@/components/reception-page";
import {ReceptionActions,type ReceptionAction} from "@/components/reception-actions";
import {githubImportTarget,recentReceptionProjects} from "@/lib/reception-projects";
import { DocsPanel, type DocSelection } from "@/components/markdown-doc";
import { SEED_DESIGN_DOC } from "@/data/design-doc";
import { artifactDocument } from "@/lib/artifact-documents";
import { advanceThought, recoverThoughts, settleThought, startThought } from "@/lib/agent-progress";
import { loadChat, persistChat, persistModels, persistPermissionRules, persistWorkspaceRules } from "@/lib/chat-db";
import {compileWorkspaceRules} from "@/lib/workspace-rules";
import {restoreWorkspaceRuleSets,workspaceRuleKey,type WorkspaceRuleSets} from "@/lib/workspace-preferences";
import {recordAiMessage,recordAiCodeChange} from "@/lib/usage-metrics";
import { permissionRuleFromChoice, removePermissionRule, resolvePermissionRule, upsertPermissionRule, type PermissionRule } from "@/lib/permission-rules";
import { streamModel, stopModel, type ModelContent } from "@/lib/model-stream";
import { createWordReveal } from "@/lib/word-reveal";
import { beginToolRound } from "@/lib/tool-transcript";
import {historyBeforeMessage,retryFromMessage,revertToEdit} from "@/lib/chat-history";
import {canApplyAiTitle,generateChatTitle} from "@/lib/chat-title";
import { executeAgentTool, activityFromTool, toolKind, toolLabel, listMcpTools } from "@/lib/agent-tools";
import { ProfessionalToolRuntime } from "@/lib/professional-runtime";
import {runToolCallsInBatches} from "@/lib/tool-orchestration";
import {boundedModelContext} from "@/lib/model-context";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open as openDirectory } from "@tauri-apps/plugin-dialog";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { SettingsContext } from "@/components/settings/settings-context";
import { accents, defaultSettings, type Settings, type SettingsSectionId } from "@/data/settings";
import { cn } from "@/utils/cn";

const REPLIES = [
  "On it. I'll break that down and keep the board in sync as I go.",
  "Got it. I'll draft a short spec first, then propose a plan for review.",
  "Understood. I can look through the affected files and summarize the changes.",
];

const CHAT_DEFAULT_WIDTH = 440;
const CHAT_MIN_WIDTH = 320;
const PANEL_MIN_WIDTH = 360;

let idCounter = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${idCounter++}`;

const toTitle = (text: string, max: number) => {
  const clean = text.replace(/\s+/g, " ").trim();
  const trimmed = clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

function modelContent(segments: Segment[]): ModelContent {
  if(!segments.some(s=>s.type==="attachment")) return segments.map(s=>s.type==="chip"?s.chip?.label??"":s.text??"").join("");
  const parts: Exclude<ModelContent,string> = [];
  for(const segment of segments) {
    if(segment.type==="text" && segment.text) parts.push({type:"text",text:segment.text});
    if(segment.type==="chip" && segment.chip) parts.push({type:"text",text:segment.chip.label});
    const file=segment.attachment;
    if(segment.type!=="attachment" || !file) continue;
    if(file.mime.startsWith("image/") && file.dataUrl) parts.push({type:"image_url",image_url:{url:file.dataUrl}});
    else if(file.text!==undefined) parts.push({type:"text",text:`Attached file: ${file.name}\n\n${file.text}`});
    else if(file.dataUrl) parts.push({type:"file",file:{filename:file.name,file_data:file.dataUrl}});
  }
  return parts;
}

const singular = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

function summarizeActivities(items: ToolActivity[]) {
  const countKind = (kind: ActivityKind) => items.filter((item) => item.kind === kind).length;
  const fileReads = items.filter((item) => item.kind === "file-read").reduce((n, item) => {
    const match = item.label.match(/\b(\d+) files?\b/i);
    return n + (match ? Number(match[1]) : 1);
  }, 0);
  const edits = items.filter((item) => item.kind === "file-edit").reduce((n, item) => {
    const match = item.label.match(/\b(\d+) files?\b/i);
    return n + (match ? Number(match[1]) : 1);
  }, 0);
  const parts: string[] = [];
  if (fileReads) parts.push(`Read ${singular(fileReads, "file")}`);
  if (countKind("search")) parts.push(`searched ${singular(countKind("search"), "query")}`);
  if (edits) parts.push(`edited ${singular(edits, "file")}`);
  if (countKind("terminal")) parts.push(`ran ${singular(countKind("terminal"), "command")}`);
  const special = items.find((item) => item.kind === "skill" || item.kind === "mcp" || item.kind === "plugin");
  if (parts.length) return parts.join(", ");
  return special?.label ?? `${items.length} tool calls`;
}

/** Which tool an agent would call on a given MCP server. */
function mcpToolName(server: string) {
  const name = server.toLowerCase();
  if (name.includes("figma")) return "get_frame";
  if (name.includes("linear")) return "create_issue";
  if (name.includes("sentry")) return "search_issues";
  return "get_content";
}

function planActivities(text: string, segments: Segment[]): ToolActivity[] {
  const items: ToolActivity[] = [];
  const push = (kind: ActivityKind, label: string, detail?: string, errorTrace?: string) => {
    const failed = Boolean(errorTrace);
    items.push({
      id: uid("tool"),
      kind,
      label,
      status: failed ? "failed" : "running",
      detail,
      errorTrace,
    });
  };

  const files = segments.filter((s) => s.type === "chip" && s.chip?.kind === "file").map((s) => s.chip!.label);
  const skill = segments.find((s) => s.chip?.kind === "skill")?.chip;
  const mcp = segments.find((s) => s.chip?.kind === "mcp")?.chip;
  const wantsEdit = /\b(edit|fix|update|change|implement|write|build|style|refactor|remove|add|create)\b/i.test(text);
  const wantsSearch = /\b(search|find|look|audit|review|check|where)\b/i.test(text);
  const wantsRead = files.length > 0 || wantsSearch || wantsEdit || /\b(read|inspect|explain|open)\b/i.test(text);
  const wantsCommand = /\b(run|test|build|install|terminal|command|lint)\b/i.test(text);

  if (skill) push("skill", `Invoked skill: /${skill.label}`, "Skill request queued for the active agent.");

  if (mcp) {
    const server = mcp.label;
    const tool = mcpToolName(server);
    const failed = /\b(fail|error|broken|unavailable|denied)\b/i.test(text);
    push(
      "mcp",
      failed ? `${server}: Attempted to use '${tool}'` : `${server}: Used MCP tool '${tool}'`,
      failed ? "The server did not return a usable response." : "Returned context for the agent.",
      failed ? `console.error("${tool} failed:", error);\nError: MCP server request failed\n    at ${tool} (mcp-${server.toLowerCase()}/client.ts:42:13)\n    at invokeMcpTool (agent/tools.ts:88:9)` : undefined
    );
    if (server.toLowerCase() === "figma" && !failed) push("plugin", "Plugin used: Figma · read selected frame");
  }

  if (wantsRead) {
    if (files.length) files.slice(0, 4).forEach((file) => push("file-read", `Read ${file}`));
    else push("file-read", "Read 2 relevant workspace files");
  }
  if (wantsSearch) push("search", `Searched workspace for “${toTitle(text, 32)}”`);
  if (wantsEdit) push("file-edit", `Edited ${files.length > 1 ? files.length : 3} files`, "Changes are presented as a reviewable diff.");
  if (wantsCommand) {
    const command = /test/i.test(text) ? "pnpm test" : /build/i.test(text) ? "pnpm build" : /lint/i.test(text) ? "pnpm lint" : "workspace check";
    push("terminal", `Ran ${command}`);
  }
  if (!mcp && /\b(plugin|figma|linear|sentry)\b/i.test(text)) {
    const failed = /\b(fail|error|broken|unavailable|denied)\b/i.test(text);
    push(
      "plugin",
      failed ? "Figma: Attempted to use 'read_frame'" : "Plugin used: Figma · read selected frame",
      failed ? "The plugin action did not complete." : undefined,
      failed ? `console.error("read_frame failed:", error);\nError: Plugin request failed\n    at read_frame (plugins/figma.ts:38:11)` : undefined
    );
  }

  return items;
}

export default function App() {
  const savedChat = React.useMemo(() => {
    try { const saved=JSON.parse(localStorage.getItem("taro-chat-v1") || "null");if(saved?.threads) saved.threads=saved.threads.map((thread:Thread)=>({...thread,messages:recoverThoughts(thread.messages)}));return saved; } catch { return null; }
  }, []);
  const [folders, setFolders] = React.useState<Folder[]>(() => {
    const kept=(savedChat?.folders as Folder[] | undefined)?.filter(f=>f.id==="taro"||f.id.startsWith("folder-"));
    return kept?.length ? kept : seedFolders;
  });
  const [threads, setThreads] = React.useState<Thread[]>(() => {
    const kept=(savedChat?.threads as Thread[] | undefined)?.filter(t=>(t.folderId==="taro"||t.folderId.startsWith("folder-")) && !["scaffold","tokens"].includes(t.id));
    if(kept?.length) { const reference=kept.find(t=>t.id==="brand");if(reference){reference.name="Nike/Brand Discovery";reference.folderId="taro";reference.archived=false;reference.messages=ensureNikeSubagentArtifact(reference).messages;}else kept.push(seedThreads[0]);return kept; }
    return seedThreads.filter(t=>t.id==="brand");
  });
  const [activeThreadId, setActiveThreadId] = React.useState<string>(()=>threads.some(t=>t.id===savedChat?.activeThreadId&&!t.archived)?savedChat.activeThreadId:"brand");
  const [chatLoaded, setChatLoaded] = React.useState(false);
  const [receptionOpen,setReceptionOpen]=React.useState(true);
  const [receptionAction,setReceptionAction]=React.useState<ReceptionAction|null>(null);
  const [receptionError,setReceptionError]=React.useState("");
  const [receptionDraft,setReceptionDraft]=React.useState<{requestId:string;text:string}>();
  const [receptionTurn,setReceptionTurn]=React.useState<{threadId:string;segments:Segment[]}|null>(null);
  const importRequest=React.useRef<string|undefined>(undefined);
  React.useEffect(() => {
    if (!isTauri()) { setChatLoaded(true); return; }
    void loadChat().then(data => {
      if(data.threads.length) { setThreads(data.threads); setFolders(data.folders ?? seedFolders); setActiveThreadId(data.threads.some(t=>t.id===data.activeThreadId&&!t.archived)?data.activeThreadId!:"brand"); }
      if(data.models) setSettings(s=>({...s,models:{...s.models,...data.models}}));
      if(data.plugins || data.workspaceRoot) setSettings(s=>({...s,plugins:(data.plugins??s.plugins).filter((p:Settings["plugins"][number])=>p.kind!=="MCP"||Boolean(p.transport)),workspaceRoot:data.workspaceRoot??s.workspaceRoot}));
      if(data.workspaceRules)setWorkspaceRuleSets(restoreWorkspaceRuleSets(data.workspaceRules));
      persistentPermissions.current=data.permissionRules;
      setPermissionRevision(value=>value+1);
    }).catch(console.error).finally(()=>setChatLoaded(true));
  }, []);
  React.useEffect(() => { if(!isTauri()) try { localStorage.setItem("taro-chat-v1", JSON.stringify({ folders, threads, activeThreadId })); } catch(consoleError) { console.error(consoleError); } }, [folders, threads, activeThreadId]);
  React.useEffect(() => { if(!chatLoaded || !isTauri()) return; const timer=window.setTimeout(()=>{void persistChat(folders, threads, activeThreadId).catch(console.error);},200); return ()=>window.clearTimeout(timer); }, [chatLoaded, folders, threads, activeThreadId]);
  const [tasks, setTasks] = React.useState<Task[]>(seedTasks);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState<boolean>(
    () => typeof window !== "undefined" && window.innerWidth < 1180
  );
  const [panel, setPanel] = React.useState<RightPanel>("tasks");
  const [chatWidth, setChatWidth] = React.useState(CHAT_DEFAULT_WIDTH);
  const [maximized, setMaximized] = React.useState(false);
  const [activeNav, setActiveNav] = React.useState("overview");
  const [galleryOpen, setGalleryOpen] = React.useState(false);
  const [artifactsOpen, setArtifactsOpen] = React.useState(false);
  const [statisticsOpen, setStatisticsOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [chipInsertion, setChipInsertion] = React.useState<ChipInsertion | null>(null);
  const [tokenDocs, setTokenDocs] = React.useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const t of seedThreads) for (const m of t.messages) if (m.role === "tokens") map[m.id] = SEED_DESIGN_DOC;
    return map;
  });
  const [openDocId, setOpenDocId] = React.useState<string | null>(null);
  const documentWrites=React.useRef(new Map<string,Promise<void>>());
  const [documentSaveError,setDocumentSaveError]=React.useState("");
  const [comments, setComments] = React.useState<DocComment[]>([]);
  const [focusComment, setFocusComment] = React.useState<DocComment | null>(null);
  const [editingSkeletal, setEditingSkeletal] = React.useState<Extract<ChatMessage, { role: "skeletal" }> | null>(null);
  const library = useLibrary();
  const [activeAgentId, setActiveAgentId] = React.useState(agents[0].id);
  const [thinking, setThinking] = React.useState(false);
  const [runningThreadId,setRunningThreadId] = React.useState<string|null>(null);
  const activeGeneration = React.useRef<{requestId:string;toolRequestIds:Set<string>;stopRequested:boolean;stopLocal?:()=>void;cancelPending?:()=>void}|null>(null);
  const titleRequestVersion = React.useRef(new Map<string,number>());
  const persistentPermissions = React.useRef<PermissionRule[]>([]);
  const sessionPermissions = React.useRef<PermissionRule[]>([]);
  const [permissionRevision,setPermissionRevision] = React.useState(0);
  const pendingApprovals = React.useRef(new Map<string,{threadId:string;server?:string;tool?:string;resolve:(allowed:boolean)=>void}>());
  const [settings, setSettings] = React.useState<Settings>(defaultSettings);
  const [workspaceRuleSets,setWorkspaceRuleSets]=React.useState<WorkspaceRuleSets>(()=>{try{return restoreWorkspaceRuleSets(JSON.parse(localStorage.getItem("taro-workspace-rules-v1")||"null"));}catch{return {};}});
  React.useEffect(()=>{if(!chatLoaded)return;try{localStorage.setItem("taro-workspace-rules-v1",JSON.stringify(workspaceRuleSets));}catch(e){console.error(e);}if(isTauri())void persistWorkspaceRules(workspaceRuleSets).catch(console.error);},[chatLoaded,workspaceRuleSets]);
  React.useEffect(() => { if(chatLoaded && isTauri()) void persistModels({...settings.models,customModels:settings.models.customModels.map(({apiKey: _apiKey,...model})=>model)},settings.plugins,settings.workspaceRoot).catch(console.error); }, [chatLoaded,settings.models,settings.plugins,settings.workspaceRoot]);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [settingsSection, setSettingsSection] = React.useState<SettingsSectionId>("account");
  const mainRef = React.useRef<HTMLElement>(null);

  const openSettings = React.useCallback((section?: SettingsSectionId) => {
    if (section) setSettingsSection(section);
    setSettingsOpen(true);
  }, []);

  // Apply appearance settings to the document.
  const { accent, density, reduceMotion } = settings.appearance;
  React.useEffect(() => {
    const root = document.documentElement;
    const hex = accents.find((a) => a.id === accent)?.hex ?? accents[0].hex;
    root.style.setProperty("--taro", hex);
    root.style.setProperty("--ring", hex);
    root.dataset.density = density;
    root.dataset.motion = reduceMotion ? "reduced" : "full";
  }, [accent, density, reduceMotion]);

  const user = React.useMemo(() => {
    const { name, email } = settings.account;
    const initials =
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || "?";
    return { name: name || "Unnamed", email, initials };
  }, [settings.account]);

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? threads[0];
  const activePermissionRules = React.useMemo(()=>[...persistentPermissions.current,...sessionPermissions.current],[permissionRevision]);
  const activeFolder = folders.find((f) => f.id === activeThread.folderId) ?? folders[0];
  const workspaceRoot = activeFolder.path || (activeFolder.id === "taro" ? settings.workspaceRoot : undefined);
  const rulesKey=workspaceRuleKey(workspaceRoot,activeFolder.id);
  const workspaceRules=workspaceRuleSets[rulesKey]??settings.rules;
  const workspaceSettings={...settings,workspaceRoot,rules:workspaceRules};
  const updateWorkspaceSettings=(next:Settings)=>{
    if(next.rules!==workspaceRules)setWorkspaceRuleSets(previous=>({...previous,[rulesKey]:next.rules}));
    if(next.workspaceRoot!==workspaceRoot)setFolders(previous=>previous.map(folder=>folder.id===activeFolder.id?{...folder,path:next.workspaceRoot}:folder));
    setSettings({...next,rules:settings.rules,workspaceRoot:next.workspaceRoot===workspaceRoot?settings.workspaceRoot:next.workspaceRoot});
  };
  const folderThreads = threads.filter((t) => t.folderId === activeFolder.id && !t.archived);
  const activeAgent = agents.find((a) => a.id === activeAgentId) ?? agents[0];

  // ⌘B toggles the sidebar, ⌘, opens Settings — like a native desktop app.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarCollapsed((c) => !c);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
      // ⌘K / Ctrl+K opens the search palette.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---- threads & folders ----------------------------------------- */

  const pushMessages = (threadId: string, ...messages: ChatMessage[]) =>
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, updated: "now", messages: [...t.messages, ...messages] } : t))
    );

  const handleNewThread = (folderId: string = activeFolder.id) => {
    // Reuse an untouched "New thread" in that folder instead of stacking duplicates.
    const blank = threads.find((t) => t.folderId === folderId && !t.archived && t.messages.length === 0 && t.name === "New thread");
    if (blank) {
      setActiveThreadId(blank.id);
      return;
    }
    const id = uid("th");
    setThreads((prev) => [{ id, name: "New thread", folderId, updated: "now", messages: [] }, ...prev]);
    setActiveThreadId(id);
  };

  const enterEditor=()=>{setReceptionOpen(false);setReceptionError("");closePages();};
  const startReceptionTurn=(segments:Segment[])=>{
    if(thinking||!chatLoaded)return;
    const compiled=compileWorkspaceRules(workspaceRules);if(!compiled.valid){openSettings("rules");return;}
    const threadId=uid("th");
    setThreads(previous=>[{id:threadId,name:"New thread",folderId:activeFolder.id,updated:"now",messages:[]},...previous]);
    setActiveThreadId(threadId);setReceptionTurn({threadId,segments});setReceptionDraft(undefined);setPanel(null);enterEditor();
  };
  const receptionPrompt=(text:string)=>setReceptionDraft({requestId:uid("welcome-draft"),text});
  const openReceptionProject=async()=>{setReceptionError("");try{if(!isTauri())throw Error("Open a project in the Taro desktop app.");const path=await openDirectory({directory:true,multiple:false,title:"Open project"});if(typeof path==="string"){addFilesystemFolder(path);setPanel("explorer");enterEditor();}}catch(error){setReceptionError(String(error).replace(/^Error: /,""));}};
  const createReceptionProject=async(name:string)=>{
    if(!isTauri())throw Error("Create projects in the Taro desktop app.");
    const parent=await openDirectory({directory:true,multiple:false,title:"Choose a location for your new project"});if(typeof parent!=="string")return false;
    const path=await invoke<string>("create_explorer_folder",{parentPath:parent,name});addFilesystemFolder(path);setPanel("explorer");enterEditor();return true;
  };
  const importReceptionProject=async(value:string)=>{
    const target=githubImportTarget(value);if(!isTauri())throw Error("Import repositories in the Taro desktop app.");
    const parent=await openDirectory({directory:true,multiple:false,title:"Choose where to clone the repository"});if(typeof parent!=="string")return false;
    const requestId=uid("import");importRequest.current=requestId;
    const quote=(text:string)=>`'${text.replace(/'/g,"''")}'`;
    try{const output=await executeAgentTool({id:requestId,name:"PowerShell",arguments:"{}"},{command:`git clone -- ${quote(target.url)} ${quote(target.name)}`,timeout:600000},parent,true,undefined,requestId,{sessionId:requestId});
      if(importRequest.current!==requestId)return false;
      if(output.artifact.exitCode!==0||output.artifact.status!=="completed")throw Error(output.text||"The repository could not be cloned.");
      const path=`${parent.replace(/[\\/]+$/,"")}${parent.includes("\\")?"\\":"/"}${target.name}`;addFilesystemFolder(path);setPanel("explorer");enterEditor();return true;
    }finally{if(importRequest.current===requestId)importRequest.current=undefined;}
  };
  const closeReceptionAction=React.useCallback(()=>{if(importRequest.current){void stopModel(importRequest.current).catch(console.error);importRequest.current=undefined;}setReceptionAction(null);},[]);
  React.useEffect(()=>{
    const shortcuts=(event:KeyboardEvent)=>{
      if(!receptionOpen||!(event.ctrlKey||event.metaKey))return;
      if(event.key.toLowerCase()==="o"){event.preventDefault();void openReceptionProject();}
      if(event.shiftKey&&event.key.toLowerCase()==="p"){event.preventDefault();setSearchOpen(true);}
    };
    window.addEventListener("keydown",shortcuts);return()=>window.removeEventListener("keydown",shortcuts);
  },[receptionOpen,folders,threads]);

  const handleArchive = (id: string) => {
    const target = threads.find((t) => t.id === id);
    if (!target) return;
    let next = threads.map((t) => (t.id === id ? { ...t, archived: true } : t));

    if (id === "brand") return;
    if (id === activeThreadId) {
      const sibling =
        next.find((t) => !t.archived && t.folderId === target.folderId) ?? next.find((t) => !t.archived);
      if (sibling) {
        setActiveThreadId(sibling.id);
      } else {
        const fresh: Thread = { id: uid("th"), name: "New thread", folderId: target.folderId, updated: "now", messages: [] };
        next = [fresh, ...next];
        setActiveThreadId(fresh.id);
      }
    }
    setThreads(next);
  };

  const handleTogglePin = (folderId: string) =>
    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, pinnedAt: f.pinnedAt ? undefined : Date.now() } : f))
    );

  const addFilesystemFolder = (path: string) => {
    const normalized=(value:string)=>value.replace(/[\\/]+$/g,"").replace(/\\/g,"/").toLowerCase();
    const existing=folders.find(folder=>folder.path && normalized(folder.path)===normalized(path));
    if(existing){handleSelectFolder(existing.id);return;}
    const name=path.replace(/[\\/]+$/g,"").split(/[\\/]/).pop() || path;
    const id=uid("folder");
    setFolders(prev=>[...prev,{id,name,path}]);
    handleNewThread(id);
  };
  const handleOpenFolder = async () => {
    if(!isTauri()) throw Error("Folder picking is available in the desktop app");
    const path=await openDirectory({directory:true,multiple:false,title:"Open folder"});
    if(typeof path==="string")addFilesystemFolder(path);
  };
  const handleChooseExplorerFolder = async () => {
    if(!isTauri()) throw Error("Folder picking is available in the desktop app");
    const path=await openDirectory({directory:true,multiple:false,title:"Choose folder for Explorer"});
    if(typeof path!=="string")return;
    if(activeFolder.id==="taro")setSettings(previous=>({...previous,workspaceRoot:path}));
    else setFolders(previous=>previous.map(folder=>folder.id===activeFolder.id?{...folder,path}:folder));
  };
  const handleNewFolder = async (name: string) => {
    const clean=name.trim();
    if(!clean) throw Error("Enter a folder name");
    if(!isTauri()) throw Error("Folder creation is available in the desktop app");
    const parent=await openDirectory({directory:true,multiple:false,title:"Choose where to create the folder"});
    if(typeof parent!=="string")return;
    const path=await invoke<string>("create_explorer_folder",{parentPath:parent,name:clean});
    addFilesystemFolder(path);
  };
  const handleRenameFolder = (id:string,name:string) => {
    const clean=name.trim(); if(!clean || id==="taro") return;
    setFolders(prev=>prev.map(f=>f.id===id?{...f,name:clean}:f));
  };
  const handleDeleteFolder = (id:string) => {
    if(id==="taro") return;
    setThreads(prev=>prev.map(t=>t.folderId===id?{...t,folderId:"taro"}:t));
    setFolders(prev=>prev.filter(f=>f.id!==id));
  };
  const handleRenameThread = (id:string,name:string) => {
    const clean=name.trim(); if(!clean || id==="brand") return;
    setThreads(prev=>prev.map(t=>t.id===id?{...t,name:clean,titleSource:"manual"}:t));
  };
  const handleMoveThread = (id:string,folderId:string) => {
    if(id==="brand" || !folders.some(f=>f.id===folderId)) return;
    setThreads(prev=>prev.map(t=>t.id===id?{...t,folderId}:t));
  };
  const handleRestoreThread = (id:string) => setThreads(prev=>prev.map(t=>t.id===id?{...t,archived:false}:t));
  const handleSelectFolder = (id:string) => {
    const session=threads.find(t=>t.folderId===id&&!t.archived);
    if(session) setActiveThreadId(session.id); else handleNewThread(id);
  };

  /* ---- chat ------------------------------------------------------- */

  const handleSetPermissionRule = (rule: PermissionRule) => {
    if (rule.duration === "session") sessionPermissions.current = upsertPermissionRule(sessionPermissions.current, rule);
    else {
      persistentPermissions.current = upsertPermissionRule(persistentPermissions.current, rule);
      void persistPermissionRules(persistentPermissions.current).catch(console.error);
    }
    setPermissionRevision(value => value + 1);
    for (const [id,pending] of pendingApprovals.current) {
      if (pending.server!==rule.server || !pending.tool || (rule.target==="tool" && pending.tool!==rule.tool)) continue;
      pendingApprovals.current.delete(id);
      const decision:PermissionChoice={label:`${rule.allowed?"Always allow":"Always deny"} ${rule.target==="mcp"?"using this MCP":"tool"}${rule.duration==="session"?", this session":""}`,allowed:rule.allowed,target:rule.target,duration:rule.duration};
      setThreads(prev=>prev.map(thread=>thread.id===pending.threadId?{...thread,messages:thread.messages.map(message=>message.id===id&&message.role==="permission"?{...message,decision}:message)}:thread));
      pending.resolve(rule.allowed);
    }
  };

  const handleRemovePermissionRule = (rule: PermissionRule) => {
    if (rule.duration === "session") sessionPermissions.current = removePermissionRule(sessionPermissions.current, rule);
    else {
      persistentPermissions.current = removePermissionRule(persistentPermissions.current, rule);
      void persistPermissionRules(persistentPermissions.current).catch(console.error);
    }
    setPermissionRevision(value => value + 1);
  };

  const handleSend = (segments: Segment[], history?: ChatMessage[]) => {
    const compiledRules=compileWorkspaceRules(workspaceRules);
    if(!compiledRules.valid){openSettings("rules");return;}
    const threadId = activeThread.id;
    const agent = activeAgent;
    const contextMessages=history??activeThread.messages;
    const replyIndex = contextMessages.length;
    const startTurn=(...messages:ChatMessage[])=>{
      if(!history){pushMessages(threadId,...messages);return;}
      setThreads(prev=>prev.map(thread=>thread.id===threadId?{...thread,updated:"now",messages:[...history,...messages]}:thread));
    };
    const text = plainText(segments);
    const chosen = settings.models.customModels.find(m => m.id === settings.models.defaultModel);
    const firstTurn=contextMessages.length===0 && threadId!=="brand";
    const titleInput=text || segments.find(segment=>segment.attachment)?.attachment?.name || "";
    const fallbackTitle=toTitle(titleInput,40);
    if(firstTurn && titleInput && activeThread.titleSource!=="manual") {
      setThreads(prev=>prev.map(thread=>thread.id===threadId&&thread.titleSource!=="manual"?{...thread,name:fallbackTitle,titleSource:"fallback"}:thread));
      if(chosen && isTauri()) {
        const version=(titleRequestVersion.current.get(threadId)??0)+1;
        titleRequestVersion.current.set(threadId,version);
        const titleRequestId=uid("title");
        const timer=window.setTimeout(()=>{void stopModel(titleRequestId).catch(console.error);},15_000);
        void generateChatTitle(chosen,titleInput,titleRequestId).then(title=>{
          if(!title || titleRequestVersion.current.get(threadId)!==version)return;
          setThreads(prev=>prev.map(thread=>thread.id===threadId&&canApplyAiTitle(thread,fallbackTitle)?{...thread,name:title,titleSource:"ai"}:thread));
        }).finally(()=>window.clearTimeout(timer));
      }
    }
    if (chosen && isTauri()) {
      let responseId=uid("a");
      const run:{requestId:string;toolRequestIds:Set<string>;stopRequested:boolean;stopLocal?:()=>void;cancelPending?:()=>void}={requestId:uid("request"),toolRequestIds:new Set(),stopRequested:false};
      activeGeneration.current=run;
      const context=contextMessages.flatMap(m=>m.role==="user"?[{role:"user",content:modelContent(m.segments)}]:m.role==="agent"&&m.text?[{role:"assistant",content:m.text}]:[]);
      const thoughtId=uid("thought");
      startTurn({id:uid("u"),role:"user",segments},startThought(thoughtId,agent.id),{id:responseId,role:"agent",agentId:agent.id,text:""});
      const progress=(label:string,step?:string)=>setThreads(previous=>previous.map(thread=>thread.id===threadId?{...thread,messages:thread.messages.map(message=>message.id===thoughtId&&message.role==="thought"?advanceThought(message,label,step):message)}:thread));
      let completionStatus:"completed"|"failed"="completed";
      setThinking(true);
      setRunningThreadId(threadId);
      let received="";
      const show=(id:string,value:string)=>setThreads(prev=>prev.map(t=>t.id===threadId?{...t,messages:t.messages.map(m=>m.id===id&&m.role==="agent"?{...m,text:value,trace:undefined}:m)}:t));
      let reveal=createWordReveal(value=>show(responseId,value));
      run.stopLocal=()=>reveal.stop();
      const mentionedFiles=segments.filter(segment=>segment.type==="chip"&&segment.chip?.kind==="file").map(segment=>segment.chip!.label);
      const messages:unknown[]=[{role:"system",content:`You are Taro, a coding agent. Use available tools to inspect and change the selected workspace. Never claim a tool ran unless you received its result. Workspace: ${workspaceRoot || "not selected"}. Use ListFiles to inspect directories, Glob to find paths, Grep to search contents, and Read to inspect files; do not use Bash for file listing or searching. File paths mentioned with @ are relative to this workspace: ${mentionedFiles.join(", ") || "none"}. Read relevant mentioned files before answering. If no workspace is selected, ask the user to open a folder in Explorer or choose one in Settings → Plugins before using coding tools.`},...context,{role:"user",content:modelContent(segments)}];
      const updateActivity=(groupId:string,activity:ToolActivity)=>setThreads(prev=>prev.map(t=>t.id===threadId?{...t,messages:t.messages.map(m=>m.id===groupId&&m.role==="activity-group"?{...m,summary:`${m.activities.some(a=>a.id===activity.id)?m.activities.length:m.activities.length+1} tool call(s)`,activities:m.activities.some(a=>a.id===activity.id)?m.activities.map(a=>a.id===activity.id?activity:a):[...m.activities,activity]}:m)}:t));
      const configured=settings.plugins.filter(p=>p.kind==="MCP"&&p.enabled&&p.transport&&(p.command||p.url));
      const runtime=new ProfessionalToolRuntime({sessionId:threadId,workspaceRoot:workspaceRoot||"",agentId:agent.id,model:chosen,models:settings.models.customModels,plugins:configured,rules:compiledRules.text,
        native:async(call,input,owner,approved,requestId)=>{const result=await executeAgentTool(call,input,owner.workspaceRoot,approved,call.name==="MCP"?configured.find(plugin=>plugin.id===input.server):undefined,requestId,{sessionId:owner.sessionId,readOnly:owner.readOnly,planningAncestors:owner.ancestors});recordAiCodeChange({eventId:`${threadId}:${requestId}`,workspaceId:rulesKey,toolName:call.name,result});return result;},
        stream:streamModel,stopRequest:stopModel,
        emit:message=>pushMessages(threadId,message),
        updateChild:(childId,patch)=>setThreads(previous=>previous.map(thread=>thread.id===threadId?{...thread,messages:thread.messages.map(message=>message.role==="subagent"&&message.childId===childId?{...message,...patch}:message)}:thread)),
        approve:async(call,input,{owner,force,plan})=>{
          const server=call.name==="MCP"?String(input.server??""):"workspace";
          const permissionTool=call.name==="MCP"?String(input.tool??""):call.name;
          if(!force){const rule=resolvePermissionRule([...persistentPermissions.current,...sessionPermissions.current],server,permissionTool);if(rule!==undefined)return rule;}
          if(owner.signal.aborted)return false;
          progress("Waiting for approval…",`Waiting for permission: ${toolLabel(call.name,input)}`);
          const permissionId=uid("permission");
          const approved=await new Promise<boolean>(resolve=>{
            const finish=(allowed:boolean)=>{owner.signal.removeEventListener("abort",cancel);pendingApprovals.current.delete(permissionId);resolve(allowed);};
            const cancel=()=>{setThreads(previous=>previous.map(thread=>thread.id===threadId?{...thread,messages:thread.messages.map(message=>message.id===permissionId&&message.role==="permission"?{...message,decision:{label:"Stopped",allowed:false,target:"tool",duration:"once"}}:message)}:thread));finish(false);};
            owner.signal.addEventListener("abort",cancel,{once:true});
            pendingApprovals.current.set(permissionId,{threadId,server,tool:permissionTool,resolve:finish});
            setThreads(previous=>previous.map(thread=>{
              if(thread.id!==threadId)return thread;
              const list=[...thread.messages];
              // Plans are already emitted immediately above their approval request.
              const at=plan?-1:list.findIndex(message=>message.id===owner.groupId);
              list.splice(at<0?list.length:at,0,{id:permissionId,role:"permission",agentId:agent.id,mcp:server==="workspace"?"workspace tool":configured.find(plugin=>plugin.id===server)?.name??server,tool:plan?`Approve ${plan.name} (${plan.path})`:server==="workspace"?toolLabel(call.name,input):permissionTool,live:true,onceOnly:force});
              return {...thread,messages:list};
            }));
          });
          progress("Using tools…",`${approved?"Permission granted":"Permission denied"}: ${toolLabel(call.name,input)}`);
          if(approved&&plan)await Promise.all(documentWrites.current.values());
          return approved;
        },
      });
      run.stopLocal=()=>{reveal.stop();runtime.stop();};
      void (async()=>{
        let messageLogged=false;
        if(workspaceRoot && configured.length){
          progress("Connecting tools…","Connecting configured MCP tools");
          const cancelled=new Promise<null>(resolve=>{run.cancelPending=()=>resolve(null);});
          const listed=await Promise.race([Promise.allSettled(configured.map(async p=>({plugin:p,tools:(await listMcpTools(p,workspaceRoot)).tools}))),cancelled]);
          run.cancelPending=undefined;
          if(!listed||run.stopRequested)return;
          const catalog=listed.flatMap(r=>r.status==="fulfilled"?r.value.tools.map(t=>`${r.value.plugin.id}/${t.name}: ${t.description??""} Arguments: ${JSON.stringify(t.inputSchema??{})}`):[]);
          runtime.setMcpCatalog(catalog);
          const failures=listed.flatMap((r,i)=>r.status==="rejected"?[{plugin:configured[i],error:String(r.reason)}]:[]);
          if(failures.length){const failureGroupId=uid("activity");const firstResponseId=responseId;const group:ChatMessage={id:failureGroupId,role:"activity-group",summary:"MCP connection failed",activities:[],startedAt:Date.now()};setThreads(prev=>prev.map(t=>{if(t.id!==threadId)return t;const at=t.messages.findIndex(m=>m.id===firstResponseId);const list=[...t.messages];list.splice(at<0?list.length:at,0,group);return {...t,messages:list};}));for(const failure of failures)updateActivity(failureGroupId,{id:uid("mcp"),kind:"mcp",label:`Connect ${failure.plugin.name}`,status:"failed",errorTrace:failure.error});}
        }
        while(!run.stopRequested){
          progress("Thinking…","Waiting for the model");
          run.requestId=uid("request");
          received="";
          if(!messageLogged){recordAiMessage({eventId:`${threadId}:${thoughtId}`,workspaceId:rulesKey});messageLogged=true;}
          const calls=await streamModel({requestId:run.requestId,endpoint:chosen.endpoint,model:chosen.label,credentialId:chosen.id,messages:boundedModelContext([...messages,{role:"system",content:runtime.instructions()}]),tools:workspaceRoot?runtime.definitions():undefined},delta=>{if(run.stopRequested)return;if(!received)progress("Writing response…","Receiving model response");received+=delta;if(settings.models.streamResponses)reveal.push(delta);});
          if(run.stopRequested || !calls.length) break;
          if(settings.models.streamResponses)await reveal.finish();else if(received)show(responseId,received);
          messages.push({role:"assistant",content:received||null,tool_calls:calls.map(c=>({id:c.id,type:"function",function:{name:c.name,arguments:c.arguments}}))});
          const groupId=uid("activity");const roundResponseId=responseId;const group:ChatMessage={id:groupId,role:"activity-group",summary:"Using tools",activities:[],startedAt:Date.now()};setThreads(prev=>prev.map(t=>t.id===threadId?{...t,messages:beginToolRound(t.messages,roundResponseId,group)}:t));
          progress("Using tools…",`Processing ${calls.length} tool call${calls.length===1?"":"s"}`);
          const outcomes=await runToolCallsInBatches(calls,async call=>{
            let input:Record<string,unknown>={};let error:unknown;let result:Awaited<ReturnType<typeof executeAgentTool>>|undefined;
            try{input=JSON.parse(call.arguments||"{}");if(!input||Array.isArray(input)||typeof input!=="object")throw Error("Tool arguments must be an object");}catch(e){error=e;}
            const started=Date.now();
            updateActivity(groupId,{id:call.id,kind:toolKind(call.name),label:toolLabel(call.name,input),status:"running"});
            if(!error&&!run.stopRequested)progress("Using tools…",toolLabel(call.name,input));
            if(!error && !run.stopRequested){const toolRequestId=uid("tool");run.toolRequestIds.add(toolRequestId);try{result=await runtime.execute(call,input,groupId,toolRequestId);}catch(e){error=e;}finally{run.toolRequestIds.delete(toolRequestId);}}
            if(run.stopRequested)error="Stopped";
            updateActivity(groupId,activityFromTool(call,input,result,error,Date.now()-started));
            if(!run.stopRequested)progress("Using tools…",`${error?"Failed":"Completed"}: ${toolLabel(call.name,input)}`);
            if(result && !error && ["Write","Edit","NotebookEdit","Bash","PowerShell","MCP","EnterWorktree","ExitWorktree"].includes(call.name))window.dispatchEvent(new Event("taro:workspace-changed"));
            return {call,result,error};
          },()=>run.stopRequested);
          const imageResults:{path:string;dataUrl:string}[]=[];
          for(const {call,result,error} of outcomes){
            messages.push({role:"tool",tool_call_id:call.id,content:error?String(error):result?.text.slice(0,20000)||"Completed"});
            if(result?.artifact.kind==="image" && result.artifact.dataUrl)imageResults.push({path:String(result.artifact.path),dataUrl:result.artifact.dataUrl});
          }
          for(const image of imageResults)messages.push({role:"user",content:[{type:"text",text:`Image read from ${image.path}`},{type:"image_url",image_url:{url:image.dataUrl}}]});
          const nextResponseId=uid("a");responseId=nextResponseId;
          pushMessages(threadId,{id:nextResponseId,role:"agent",agentId:agent.id,text:""});
          reveal=createWordReveal(value=>show(nextResponseId,value));
          run.stopLocal=()=>{reveal.stop();runtime.stop();};
        }
        if(run.stopRequested){reveal.stop();const partial=settings.models.streamResponses?reveal.shown():received;show(responseId,partial?`${partial}\n\n*Stopped*`:"Response stopped.");return;}
        if(settings.models.streamResponses){await reveal.finish();if(!received)show(responseId,"The model returned an empty response.");}else show(responseId,received||"The model returned an empty response.");
        if(run.stopRequested){const partial=settings.models.streamResponses?reveal.shown():received;show(responseId,partial?`${partial}\n\n*Stopped*`:"Response stopped.");}
      })().catch(error=>{
        completionStatus="failed";
        if(!run.stopRequested)progress("Response interrupted…","The response could not complete");
        reveal.stop();
        const partial=settings.models.streamResponses?reveal.shown():received;
        show(responseId,run.stopRequested ? (partial ? `${partial}\n\n*Stopped*` : "Response stopped.") : received ? `${received}\n\n*Response interrupted: ${String(error)}*` : `The model could not respond. ${String(error)}`);
      }).finally(()=>{setThreads(previous=>previous.map(thread=>thread.id===threadId?{...thread,messages:thread.messages.map(message=>message.id===thoughtId&&message.role==="thought"?settleThought(message,run.stopRequested?"stopped":completionStatus):message)}:thread));if(activeGeneration.current===run){activeGeneration.current=null;setThinking(false);setRunningThreadId(null);}});
      return;
    }
    if (!chosen) {
      startTurn({id:uid("u"),role:"user",segments},{id:uid("a"),role:"agent",agentId:agent.id,text:"Choose a custom model in Settings → Models to connect an OpenAI-compatible endpoint."});
      return;
    }
    const mcp = segments.find((s) => s.chip?.kind === "mcp")?.chip;
    const skill = segments.find((s) => s.chip?.kind === "skill")?.chip;
    const plannedActivities = planActivities(text, segments);
    // An MCP call needs explicit permission first — hold that row back.
    const needsPermission = Boolean(mcp);
    const activities = needsPermission
      ? plannedActivities.filter((a) => a.kind !== "mcp" && a.kind !== "plugin")
      : plannedActivities;
    const groupId = activities.length ? uid("activity") : undefined;
    const permissionId = needsPermission ? uid("perm") : undefined;
    const startedAt = Date.now();
    const thoughtId=uid("thought");
    const previewRun={requestId:"preview",toolRequestIds:new Set<string>(),stopRequested:false,stopLocal:undefined as (()=>void)|undefined};
    activeGeneration.current=previewRun;

    startTurn(
      { id: uid("u"), role: "user", segments },
      {...startThought(thoughtId,agent.id,startedAt),label:activities.length?"Using tools…":"Thinking…",steps:activities.length?activities.map(activity=>activity.label):["Preparing response"]},
      ...(permissionId && mcp
        ? [{
            id: permissionId,
            role: "permission" as const,
            agentId: agent.id,
            mcp: mcp.label,
            tool: mcpToolName(mcp.label),
          }]
        : []),
      ...(groupId
        ? [{
            id: groupId,
            role: "activity-group" as const,
            summary: summarizeActivities(activities),
            activities,
            startedAt,
          }]
        : [])
    );
    setThinking(true);
    setRunningThreadId(threadId);

    const previewTimer=window.setTimeout(() => {
      const wantsTask = /task|ticket|bug|backlog|issue/i.test(text);
      const carriesPlan = /\b(plan|fix|change|implement|design|build|update|create|refactor|audit|review)\b/i.test(text);
      const logPlan = wantsTask || carriesPlan;
      const mcpFailed = plannedActivities.some((activity) => activity.kind === "mcp" && activity.status === "failed");

      if (groupId) {
        setThreads((prev) =>
          prev.map((thread) =>
            thread.id !== threadId
              ? thread
              : {
                  ...thread,
                  messages: thread.messages.map((message) =>
                    message.id !== groupId || message.role !== "activity-group"
                      ? message
                      : {
                          ...message,
                          activities: message.activities.map((activity) =>
                            activity.status === "failed"
                              ? { ...activity, durationMs: 624 }
                              : { ...activity, status: "done", durationMs: activity.kind === "terminal" ? 850 : activity.kind === "mcp" ? 326 : 72 }
                          ),
                        }
                  ),
                }
          )
        );
      }

      pushMessages(threadId, {
        id: uid("a"),
        role: "agent",
        agentId: agent.id,
        text: mcpFailed
          ? `I couldn't reach ${mcp?.label ?? "the MCP server"}. The failed call and error trace are available above.`
          : needsPermission
            ? `I need your permission before I can use ${mcp?.label} : ${mcp ? mcpToolName(mcp.label) : ""}.`
            : logPlan
          ? "I've added a clear task summary and solution plan to the Tasks panel for review."
          : skill
            ? `Invoked /${skill.label}. I'll report back with the result and any diffs.`
            : mcp
              ? `Connected to ${mcp.label}. I used the available tool and pulled the latest context.`
              : REPLIES[replyIndex % REPLIES.length],
        durationMs: Date.now() - startedAt,
      });
      setThreads(previous=>previous.map(thread=>thread.id===threadId?{...thread,messages:thread.messages.map(message=>message.id===thoughtId&&message.role==="thought"?settleThought(advanceThought(message,"Writing response…","Prepared response"),mcpFailed?"failed":"completed"):message)}:thread));

      if (logPlan) {
        setTasks((prev) => [
          {
            id: uid("t"),
            title: toTitle(text, 56),
            description: `Created by ${agent.name} from this thread.`,
            priority: "Medium",
            severity: /payment|checkout|charge|security/i.test(text) ? "Critical" : /bug|error|broken|issue/i.test(text) ? "High" : "Medium",
            details: `The request is to ${text.replace(/\s+/g, " ").trim()}. The agent has recorded what this means in plain language and will keep the changes reviewable.`,
            solution: [
              "Confirm the problem in the current workspace and identify who is affected.",
              "Make the smallest change that addresses the cause without changing unrelated behavior.",
              "Verify the fix, then summarize what changed before marking the task done.",
            ],
            status: "Backlog",
            tags: ["chat"],
          },
          ...prev,
        ]);
        setPanel("tasks");
      }

      setThinking(false);
      setRunningThreadId(null);
      if(activeGeneration.current===previewRun)activeGeneration.current=null;
    }, 900);
    previewRun.stopLocal=()=>{
      window.clearTimeout(previewTimer);
      setThreads(previous=>previous.map(thread=>thread.id===threadId?{...thread,messages:thread.messages.map(message=>message.id===thoughtId&&message.role==="thought"?settleThought(message,"stopped"):message.id===groupId&&message.role==="activity-group"?{...message,activities:message.activities.map(activity=>activity.status==="running"?{...activity,status:"failed",errorTrace:"Stopped"}:activity)}:message)}:thread));
    };
  };

  React.useEffect(()=>{if(receptionTurn&&chatLoaded&&activeThread.id===receptionTurn.threadId){setReceptionTurn(null);handleSend(receptionTurn.segments);}},[receptionTurn,chatLoaded,activeThread.id]);

  const handleStop = () => {
    const run=activeGeneration.current;
    if(!run || run.stopRequested) return;
    run.stopRequested=true;
    run.cancelPending?.();
    run.stopLocal?.();
    if(!isTauri()){activeGeneration.current=null;setThinking(false);setRunningThreadId(null);return;}
    for(const [id,pending] of pendingApprovals.current){pendingApprovals.current.delete(id);setThreads(prev=>prev.map(t=>t.id===pending.threadId?{...t,messages:t.messages.map(message=>message.id===id&&message.role==="permission"?{...message,decision:{label:"Stopped",allowed:false,target:"tool",duration:"once"}}:message)}:t));pending.resolve(false);}
    for(const requestId of [run.requestId,...run.toolRequestIds])void stopModel(requestId).catch(console.error);
  };

  const handleRevert = (messageId: string) => {
    if(thinking)return;
    setThreads((prev) =>
      prev.map((thread) => {
        if (thread.id !== activeThread.id) return thread;
        const target=revertToEdit(thread.messages,messageId);
        return target===null ? thread : { ...thread, updated:"now", messages:target.history };
      })
    );
  };

  const handleRetry = (messageId:string) => {
    if(thinking)return;
    const branch=retryFromMessage(activeThread.messages,messageId);
    if(branch)handleSend(branch.segments,branch.history);
  };

  const handleEditMessage = (messageId:string,segments:Segment[]) => {
    if(thinking || !activeThread.messages.some(message=>message.id===messageId&&message.role==="user"))return;
    const history=historyBeforeMessage(activeThread.messages,messageId);
    if(history)handleSend(segments,history);
  };

  /** Record a permission choice, then run (or skip) the requested MCP call. */
  const handlePermissionDecision = (messageId: string, choice: PermissionChoice | null) => {
    const pending=pendingApprovals.current.get(messageId);
    if(pending){if(!choice)return;pendingApprovals.current.delete(messageId);setThreads(prev=>prev.map(t=>t.id===pending.threadId?{...t,messages:t.messages.map(m=>m.id===messageId&&m.role==="permission"?{...m,decision:choice}:m)}:t));if(pending.server&&pending.tool){const rule=permissionRuleFromChoice(choice,pending.server,pending.tool);if(rule)handleSetPermissionRule(rule);}pending.resolve(choice.allowed);return;}
    const threadId = activeThread.id;
    const target = activeThread.messages.find((m) => m.id === messageId && m.role === "permission");
    if (!target || target.role !== "permission") return;
    if(target.live) return;
    if(target.mcp==="workspace tool") return;
    const { agentId, mcp, tool } = target;

    setThreads((prev) =>
      prev.map((thread) =>
        thread.id !== threadId
          ? thread
          : {
              ...thread,
              messages: thread.messages.map((message) =>
                message.id === messageId && message.role === "permission"
                  ? { ...message, decision: choice ?? undefined }
                  : message
              ),
            }
      )
    );

    if (!choice) return;

    if (choice.allowed) {
      pushMessages(
        threadId,
        {
          id: uid("activity"),
          role: "activity-group",
          summary: `${mcp}: Used MCP tool '${tool}'`,
          activities: [
            {
              id: uid("tool"),
              kind: "mcp",
              label: `${mcp}: Used MCP tool '${tool}'`,
              detail: `Allowed by “${choice.label}”.`,
              status: "done",
              durationMs: 284,
            },
          ],
        },
        {
          id: uid("a"),
          role: "agent",
          agentId,
          text: `Done — I called ${mcp} : ${tool} and pulled the result back into this thread.`,
          durationMs: 380,
          trace: [
            "Recorded your permission choice.",
            `Called ${tool} through ${mcp}.`,
            "Returned the result to this thread.",
          ],
        }
      );
    } else {
      pushMessages(threadId, {
        id: uid("a"),
        role: "agent",
        agentId,
        text: `Understood — I won't call ${mcp} : ${tool}.`,
        durationMs: 210,
        trace: ["Recorded your permission choice.", "Skipped the external tool call."],
      });
    }
  };

  const handleCycleStatus = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const next: TaskStatus = TASK_STATUSES[(TASK_STATUSES.indexOf(t.status) + 1) % TASK_STATUSES.length];
        return { ...t, status: next };
      })
    );
  };

  /* ---- right panel ------------------------------------------------ */

  const openDoc = (messageId: string) => {
    if(!artifactDocument(activeThread.messages.find(message=>message.id===messageId)))return;
    setOpenDocId(messageId);
    setDocumentSaveError("");
    setPanel("docs");
    setMaximized(false);
  };

  const closeDoc = () => {
    setPanel(null);
    setOpenDocId(null);
  };

  const documentMessage = (id: string) => threads.flatMap(thread=>thread.messages).find(message=>message.id===id);
  const docForMessage = (id: string) => tokenDocs[id] ?? artifactDocument(documentMessage(id))?.text ?? "";
  const openDocument = openDocId ? artifactDocument(documentMessage(openDocId)) : undefined;
  const changeDocument = (text: string) => {
    if(!openDocId)return;
    const id=openDocId;
    const source=documentMessage(id);
    if(source?.role==="plan"){
      setThreads(previous=>previous.map(thread=>({...thread,messages:thread.messages.map(message=>message.id===id&&message.role==="plan"?{...message,markdown:text}:message)})));
      if(source.workspaceRoot&&source.sessionId){
        const key=`${source.sessionId}:${source.path}`;
        const save=(documentWrites.current.get(key)??Promise.resolve()).catch(()=>{}).then(async()=>{await executeAgentTool({id:uid("plan-save"),name:"Write",arguments:"{}"},{file_path:source.path,content:text},source.workspaceRoot!,true,undefined,uid("plan-save"),{sessionId:source.sessionId!});setDocumentSaveError("");});
        documentWrites.current.set(key,save);
        void save.catch(error=>setDocumentSaveError(`Plan could not be saved: ${String(error)}`));
      }
    }
    else setTokenDocs(previous=>({...previous,[id]:text}));
  };

  /* ---- doc comments & send-to-agent ------------------------------- */

  const docComments = openDocId ? comments.filter((c) => c.docId === openDocId) : [];

  const handleAddComment = (sel: DocSelection, body: string) => {
    if (!openDocId) return;
    const comment: DocComment = {
      id: uid("c"),
      docId: openDocId,
      startLine: sel.startLine,
      endLine: sel.endLine,
      quote: sel.quote,
      body,
      createdAt: Date.now(),
    };
    // Logged in the comments list only; it becomes a composer chip when sent.
    setComments((prev) => [...prev, comment]);
  };

  /** Queue comment chips into the chat composer instead of posting messages. */
  const queueCommentChip = (list: DocComment[], docId: string) => {
    if (list.length === 0) return;
    const lines = list.map((c) => (c.startLine === c.endLine ? `L${c.startLine}` : `L${c.startLine}-${c.endLine}`));
    const single = list.length === 1;
    const sourceMessage=documentMessage(docId);
    const documentKind=sourceMessage?.role==="plan"?sourceMessage.kind:"Design Plan";
    const ref: CommentReference = {
      mode: single ? "single" : "group",
      lines: single ? lines[0] : documentKind,
      count: list.length,
      docId,
      comments: list.map((c) => ({ id: c.id, body: c.body, quote: c.quote, startLine: c.startLine, endLine: c.endLine })),
    };
    const chip: ChipRef = {
      id: `comment:${ref.mode}:${list.map((c) => c.id).join(",")}`,
      kind: "comment",
      label: single ? `Comment · ${lines[0]}` : `Comments · ${documentKind}`,
      description: list.map((c) => `${c.body} (${c.startLine === c.endLine ? `L${c.startLine}` : `L${c.startLine}-${c.endLine}`})`).join("\n"),
      comment: ref,
    };
    setChipInsertion({ requestId: uid("comment-chip"), threadId: activeThread.id, chip });
    closeDoc();
    setArtifactsOpen(false);
    setGalleryOpen(false);
    setStatisticsOpen(false);
    setMaximized(false);
  };

  const handleSendToAgent = (payload: { quote?: string; range?: { startLine: number; endLine: number } }) => {
    if (!openDocId) return;
    const doc = docForMessage(openDocId);
    const sourceMessage=documentMessage(openDocId);
    const plan=sourceMessage?.role==="plan"?sourceMessage:undefined;
    const documentLabel=plan ? plan.kind.toLowerCase() : "design doc";
    const range = payload.range
      ? payload.range.startLine === payload.range.endLine
        ? `L${payload.range.startLine}`
        : `L${payload.range.startLine}-${payload.range.endLine}`
      : undefined;
    const text = payload.quote
      ? `Review this part of the ${documentLabel} (${range}):\n\n“${payload.quote}”`
      : plan ? `Review the full ${documentLabel}: ${plan.name}.` : "Review the full design doc and keep the tokens consistent.";
    const lines = payload.quote ? payload.quote.split("\n").length : doc.split("\n").length;

    pushMessages(
      activeThread.id,
      { id: uid("u"), role: "user", segments: [{ type: "text", text }] },
      {
        id: uid("activity"),
        role: "activity-group",
        summary: payload.quote ? `Read ${documentLabel} selection (${range})` : `Read full ${documentLabel}`,
        activities: [
          {
            id: uid("tool"),
            kind: "file-read",
            label: payload.quote ? `Read ${documentLabel} ${range}` : `Read ${plan?.path ?? "design-tokens.md"}`,
            detail: `${lines} line${lines === 1 ? "" : "s"} sent to the agent.`,
            status: "done",
            durationMs: 36,
          },
        ],
      }
    );
    setThinking(true);
    window.setTimeout(() => {
      pushMessages(activeThread.id, {
        id: uid("a"),
        role: "agent",
        agentId: activeAgent.id,
        text: plan ? `I've read ${payload.quote ? range : plan.name}. Tell me which part of the ${documentLabel} you'd like to revise.` : payload.quote
          ? `Got it — I've read ${range}. The tokens referenced there stay AA-compliant; I'll flag anything that drifts when you edit the swatches.`
          : "I've read the whole design doc. The five token colors are in sync with the artifact; tell me which section you'd like me to iterate on.",
        durationMs: 640,
        trace: plan ? ["Read the referenced plan.", "Prepared a short confirmation."] : ["Read the referenced section of the doc.", "Cross-checked the color tokens against the artifact.", "Prepared a short confirmation."],
      });
      setThinking(false);
    }, 700);
  };

  /** Send one, several, or all comments — as an inline chip in the composer. */
  const handleSendComments = (list: DocComment[]) => {
    if (!openDocId) return;
    queueCommentChip(list, openDocId);
  };

  const handleAnswerQuestion = (
    messageId: string,
    questionId: string,
    answer: number | null,
    action: "answer" | "skip" | "decline"
  ) => {
    setThreads((prev) =>
      prev.map((thread) => ({
        ...thread,
        messages: thread.messages.map((m) => {
          if (m.id !== messageId || m.role !== "questions") return m;
          if (action === "decline") {
            return {
              ...m,
              questions: m.questions.map((q) => ({ ...q, answer: null })),
            };
          }
          return {
            ...m,
            questions: m.questions.map((q) => (q.id === questionId ? { ...q, answer: action === "answer" ? answer : null } : q)),
          };
        }),
      }))
    );
    if (action === "decline") {
      pushMessages(activeThread.id, {
        id: uid("a"),
        role: "agent",
        agentId: activeAgent.id,
        text: "No problem — I'll continue with sensible defaults and flag the assumptions in the plan.",
        durationMs: 300,
        trace: ["Noted that you declined to answer.", "Chose conservative defaults."],
      });
    }
  };

  const handleEditSkeletal = (message: Extract<ChatMessage, { role: "skeletal" }>) => {
    setEditingSkeletal(message);
  };

  const handleSendSkeletalChanges = (payload: {
    messageId?: string;
    title: string;
    variant: "hero" | "cards" | "dashboard";
    layers: CanvasLayer[];
    width: number;
    height: number;
    instruction: string;
  }) => {
    const layers: SkeletalLayerData[] = payload.layers.map((layer) => ({ ...layer }));
    setEditingSkeletal(null);
    const loadingId = payload.messageId ?? uid("skeletal");
    const humanText = payload.instruction.trim()
      ? `Update “${payload.title}”: ${payload.instruction.trim()}`
      : `Apply the ${layers.length} layers from the skeletal editor to “${payload.title}”.`;

    if (payload.messageId) {
      setThreads((prev) => prev.map((thread) => ({
        ...thread,
        messages: thread.messages.map((message) =>
          message.id === payload.messageId && message.role === "skeletal"
            ? { ...message, title: payload.title, status: "loading", layers, width: payload.width, height: payload.height }
            : message
        ),
      })));
      pushMessages(activeThread.id, { id: uid("u"), role: "user", segments: [{ type: "text", text: humanText }] });
    } else {
      pushMessages(activeThread.id,
        { id: uid("u"), role: "user", segments: [{ type: "text", text: humanText }] },
        { id: loadingId, role: "skeletal", agentId: activeAgent.id, title: payload.title, variant: payload.variant, status: "loading", layers, width: payload.width, height: payload.height }
      );
    }

    const changedLayers = layers.filter((layer) => layer.kind !== "background");
    const diffLines = changedLayers.slice(0, 8).map((layer) => ({ kind: "add" as const, text: `${layer.kind} ${layer.name} · ${Math.round(layer.w)} × ${Math.round(layer.h)}` }));
    pushMessages(activeThread.id, {
      id: uid("activity"),
      role: "activity-group",
      summary: `Edited skeletal layout · ${layers.length} layers, ${payload.width} × ${payload.height}`,
      activities: [{
        id: uid("tool"),
        kind: "file-edit",
        label: `Edited ${payload.title}`,
        edit: { file: "Plan", added: changedLayers.length, removed: 0, diff: diffLines },
        status: "done",
        durationMs: 320,
      }],
    });

    setThinking(true);
    window.setTimeout(() => {
      setThreads((prev) => prev.map((thread) => ({
        ...thread,
        messages: thread.messages.map((message) =>
          message.id === loadingId && message.role === "skeletal"
            ? { ...message, status: "ready", title: payload.title, layers, width: payload.width, height: payload.height }
            : message
        ),
      })));
      pushMessages(activeThread.id, {
        id: uid("a"), role: "agent", agentId: activeAgent.id,
        text: `Updated “${payload.title}” with ${changedLayers.length} layout blocks and queued the requested changes.`,
        durationMs: 810,
        trace: ["Read the edited canvas layers.", "Applied the layout and typography settings.", "Rebuilt the skeletal preview."],
      });
      setThinking(false);
    }, 900);
  };

  const handleAcceptSkeletal = (messageId: string) => {
    setThreads((prev) =>
      prev.map((thread) => ({
        ...thread,
        messages: thread.messages.map((m) =>
          m.id === messageId && m.role === "skeletal" ? { ...m, accepted: true } : m
        ),
      }))
    );
    pushMessages(activeThread.id, {
      id: uid("a"),
      role: "agent",
      agentId: activeAgent.id,
      text: "Skeleton accepted. I'll fill in the real content and keep the spacing from the design doc.",
      durationMs: 260,
      trace: ["Marked the skeleton as the chosen structure.", "Queued content fill."],
    });
  };

  const handleTogglePanel = (next: Exclude<RightPanel, null>) => {
    closePages();
    setOpenDocId(null);
    if (next === "review" && panel !== "review" && activeThread.id === "brand") {
      const announced = activeThread.messages.some(
        (m) => m.role === "activity-group" && m.activities.some((activity) => activity.kind === "browser")
      );
      if (!announced) {
        pushMessages(activeThread.id, {
          id: uid("activity"),
          role: "activity-group",
          summary: "Browser preview activated. Click the desktop icon at your top right to see preview",
          activities: [
            {
              id: uid("browser"),
              kind: "browser",
              label: "Browser preview activated",
              detail: "Click the desktop icon at your top right to see preview.",
              status: "done",
              durationMs: 38,
            },
          ],
        });
      }
    }
    setMaximized(false);
    setPanel((current) => (current === next ? null : next));
  };

  const closePanel = () => {
    setMaximized(false);
    setPanel(null);
  };

  const closePages = () => {
    setGalleryOpen(false);
    setArtifactsOpen(false);
    setStatisticsOpen(false);
  };

  const handleNavChange = (id: string) => {
    if (id === "settings") {
      openSettings();
      return;
    }
    if (id === "integrations") {
      openSettings("plugins");
      return;
    }
    setActiveNav(id);
    closePages();
    if (id === "media") setGalleryOpen(true);
    else if (id === "artifacts") setArtifactsOpen(true);
    else if (id === "statistics") setStatisticsOpen(true);
    else if (id === "tasks") setPanel("tasks");
  };

  const reuseInChat = (chip: ChipRef) => {
    setChipInsertion({ requestId: uid("reuse"), threadId: activeThread.id, chip });
    closePages();
    setMaximized(false);
    setActiveNav("chat");
  };

  const handleReuseArtifact = (artifact: Artifact) => reuseInChat(artifactToChip(artifact));
  const handleReuseMedia = (media: MediaItem) => reuseInChat(mediaToChip(media));
  const consumeChipInsertion = React.useCallback((requestId: string) => {
    setChipInsertion((pending) => pending?.requestId === requestId ? null : pending);
  }, []);

  const chatHidden = maximized && panel !== null;

  return (
    <SettingsContext.Provider value={workspaceSettings}>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
        <TitleBar
          welcome={receptionOpen}
          onHome={()=>setReceptionOpen(true)}
          onAccount={()=>openSettings("account")}
          crumbs={
            galleryOpen
              ? ["Gallery"]
              : artifactsOpen
                ? ["My artifacts"]
                : statisticsOpen
                  ? ["Statistics"]
                  : [activeFolder.name, activeThread.name]
          }
        />

        <div data-reception-surface className={cn("min-h-0 flex-1 flex-col",receptionOpen?"flex":"hidden")}><ReceptionPage reduceMotion={settings.appearance.reduceMotion||!receptionOpen} error={receptionError} recent={recentReceptionProjects(folders,threads)} onOpenRecent={id=>{setActiveThreadId(id);enterEditor();}} onViewAll={()=>setSearchOpen(true)} onNewProject={()=>setReceptionAction("new")} onOpenProject={()=>{void openReceptionProject();}} onTemplates={()=>setReceptionAction("templates")} onImportGithub={()=>setReceptionAction("github")} onSearch={()=>setSearchOpen(true)} onCommands={()=>setSearchOpen(true)} onSettings={()=>openSettings()} onDocs={()=>setReceptionAction("docs")} onWhatsNew={()=>setReceptionAction("updates")} onPrompt={receptionPrompt}
          composer={<Composer conversationId="reception" workspaceRoot={workspaceRoot} draftInsertion={receptionDraft} onInsertionConsumed={()=>{}} placeholderTarget="your next build…" effort={settings.models.effort} onEffortChange={effort=>setSettings(previous=>({...previous,models:{...previous.models,effort}}))} onSend={startReceptionTurn} disabled={!chatLoaded||thinking||!receptionOpen} permissionRules={activePermissionRules} onSetPermissionRule={handleSetPermissionRule} onRemovePermissionRule={handleRemovePermissionRule}/>}/></div>
        <div className={cn("min-h-0 flex-1",receptionOpen?"hidden":"flex")}>
          <AppSidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((c) => !c)}
            activeNav={activeNav}
            onNavChange={handleNavChange}
            onOpenSearch={() => setSearchOpen(true)}
            activeAgentId={activeAgent.id}
            onAgentChange={setActiveAgentId}
            folders={folders}
            threads={threads}
            activeThreadId={activeThread.id}
            runningThreadId={runningThreadId}
            onSelectThread={id=>{setActiveThreadId(id);setReceptionOpen(false);}}
            onTogglePin={handleTogglePin}
            onArchive={handleArchive}
            onNewThread={handleNewThread}
            onNewFolder={handleNewFolder}
            onOpenFolder={handleOpenFolder}
            onSelectFolder={handleSelectFolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            onRenameThread={handleRenameThread}
            onMoveThread={handleMoveThread}
            onRestoreThread={handleRestoreThread}
            user={user}
            onOpenAccount={() => openSettings("account")}
            onUpgradePlan={() => openSettings("account")}
          />

          <main ref={mainRef} className="flex min-w-0 flex-1">
            {(galleryOpen || artifactsOpen || statisticsOpen) && (
              <>
                {galleryOpen && <GalleryPage onBack={closePages} library={library} onReuse={handleReuseMedia} />}
                {artifactsOpen && <ArtifactsPage onBack={closePages} onReuse={handleReuseArtifact} />}
                {statisticsOpen && <StatisticsPage onBack={closePages} />}
              </>
            )}
            <div className={galleryOpen || artifactsOpen || statisticsOpen ? "hidden" : "contents"}>
            <div className={chatHidden ? "hidden" : "contents"}>
              <ChatPanel
                threads={folderThreads}
                folderName={activeFolder.name}
                workspaceRoot={workspaceRoot}
                thread={activeThread}
                agent={activeAgent}
                thinking={thinking}
                panel={panel}
                onTogglePanel={handleTogglePanel}
                width={panel ? chatWidth : undefined}
                onSelectThread={setActiveThreadId}
                onRenameThread={handleRenameThread}
                onNewThread={() => handleNewThread()}
                onRevert={handleRevert}
                onRetry={handleRetry}
                onEditMessage={handleEditMessage}
                onDecide={handlePermissionDecision}
                onOpenDoc={openDoc}
                docForMessage={docForMessage}
                onAnswerQuestion={handleAnswerQuestion}
                onAcceptSkeletal={handleAcceptSkeletal}
                onEditSkeletal={handleEditSkeletal}
                insertion={chipInsertion}
                onInsertionConsumed={consumeChipInsertion}
                onSend={handleSend}
                onStop={handleStop}
                permissionRules={activePermissionRules}
                onSetPermissionRule={handleSetPermissionRule}
                onRemovePermissionRule={handleRemovePermissionRule}
                effort={settings.models.effort}
                onEffortChange={(effort) => setSettings((s) => ({ ...s, models: { ...s.models, effort } }))}
              />
            </div>

            {panel && !chatHidden && <Resizer containerRef={mainRef} width={chatWidth} onChange={setChatWidth} />}

            {panel === "explorer" && (
              <ExplorerPanel key={activeFolder.id} root={workspaceRoot} folderName={activeFolder.name} onChooseFolder={handleChooseExplorerFolder} maximized={maximized} onToggleMaximize={() => setMaximized((m) => !m)} onClose={closePanel} />
            )}
            {panel === "review" && (activeThread.id === "brand" ? <ReviewCanvas /> : <EmptyReviewCanvas />)}
            {panel === "tasks" && <TasksBoard tasks={tasks} onCycleStatus={handleCycleStatus} onClose={closePanel} />}
            {panel === "git" && <GitPanel onClose={closePanel} />}
            {panel === "docs" && openDocId && (
              <DocsPanel
                key={openDocId}
                title={openDocument?.title ?? "Document"}
                saveError={documentSaveError}
                docText={docForMessage(openDocId)}
                onDocChange={changeDocument}
                onClose={closeDoc}
                comments={docComments}
                onAddComment={handleAddComment}
                onSendToAgent={handleSendToAgent}
                onSendComments={handleSendComments}
                focusComment={focusComment}
                onFocusHandled={() => setFocusComment(null)}
              />
            )}
            </div>
          </main>

        </div>
          <CommandPalette
            folders={folders}
            threads={threads}
            open={searchOpen}
            onOpenChange={setSearchOpen}
            onSelectFolder={(folderId) => {
              handleSelectFolder(folderId);
              setReceptionOpen(false);
              closePages();
            }}
            onSelectThread={(threadId) => {
              setActiveThreadId(threadId);
              setReceptionOpen(false);
              closePages();
            }}
            onSelectArtifact={() => {
              setReceptionOpen(false);
              closePages();
              setArtifactsOpen(true);
            }}
            onSelectFeature={(featureId) => {setReceptionOpen(false);handleNavChange(featureId);}}
            onNewThread={() => {
              handleNewThread();
              setReceptionOpen(false);
              closePages();
            }}
          />

        <ReceptionActions mode={receptionAction} onClose={closeReceptionAction} onCreate={createReceptionProject} onImport={importReceptionProject} onPrompt={receptionPrompt} onSettings={()=>openSettings("models")}/>

        <SkeletalEditor
          open={editingSkeletal !== null}
          title={editingSkeletal?.title ?? "Discovery · skeletal hero"}
          variant={editingSkeletal?.variant ?? "hero"}
          messageId={editingSkeletal?.id}
          initialLayers={editingSkeletal?.layers}
          initialWidth={editingSkeletal?.width}
          initialHeight={editingSkeletal?.height}
          backgrounds={[
            ...mediaItems,
            ...library.downloads.map((item) => ({ ...item, libraryOrigin: "downloaded" as const })),
            ...library.uploads.map((item) => ({ ...item, libraryOrigin: "uploaded" as const })),
          ] satisfies EditorMedia[]}
          onClose={() => setEditingSkeletal(null)}
          onSend={handleSendSkeletalChanges}
        />

        <SettingsDialog
          key={rulesKey}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          section={settingsSection}
          onSectionChange={setSettingsSection}
          settings={workspaceSettings}
          onSettingsChange={updateWorkspaceSettings}
        />
      </div>
    </SettingsContext.Provider>
  );
}

/* ------------------------------------------------------------------
 * Draggable divider between the chat column and the right panel.
 * Drag, use ←/→ when focused, or double-click to reset.
 * ------------------------------------------------------------------ */

function Resizer({
  containerRef,
  width,
  onChange,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  width: number;
  onChange: (width: number) => void;
}) {
  const [dragging, setDragging] = React.useState(false);

  const clamp = (value: number) => {
    const total = containerRef.current?.getBoundingClientRect().width ?? 1200;
    return Math.round(Math.min(Math.max(value, CHAT_MIN_WIDTH), Math.max(CHAT_MIN_WIDTH, total - PANEL_MIN_WIDTH)));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const left = containerRef.current?.getBoundingClientRect().left ?? 0;
    setDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const move = (ev: PointerEvent) => onChange(clamp(ev.clientX - left));
    const up = () => {
      setDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize chat panel"
      aria-valuenow={width}
      aria-valuemin={CHAT_MIN_WIDTH}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={() => onChange(CHAT_DEFAULT_WIDTH)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onChange(clamp(width - 16));
        if (e.key === "ArrowRight") onChange(clamp(width + 16));
      }}
      title="Drag to resize · double-click to reset"
      className="group relative z-20 w-px shrink-0 cursor-col-resize bg-border outline-none"
    >
      {/* Wider invisible hit area */}
      <span className="absolute inset-y-0 -left-[3px] w-[7px]" />
      <span
        className={cn(
          "absolute inset-y-0 -left-px w-[3px] bg-taro opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-80",
          dragging && "opacity-100"
        )}
      />
    </div>
  );
}
