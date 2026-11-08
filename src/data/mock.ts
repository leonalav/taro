import {
  BookOpen,
  ChartColumn,
  Film,
  Megaphone,
  Package,
  Plug,
  Store,
  type LucideIcon,
} from "lucide-react";
import type { ChipRef } from "./mentions";
import type { ThoughtMessage } from "@/lib/agent-progress";
import { upgradeFoundationPreviews } from "./foundation-previews";
import { migrateProfessionalMessage, nikePhaseTwoArtifacts, type ProfessionalToolMessage, type PlanMessage, type ToolResultMessage } from "./phase-two";

/* ------------------------------------------------------------------
 * Domain types
 * ------------------------------------------------------------------ */

export type Priority = "High" | "Medium" | "Low";
export type Severity = "Critical" | "High" | "Medium" | "Low";
export type TaskStatus = "Backlog" | "To Do" | "In Progress" | "Done";

export const TASK_STATUSES: TaskStatus[] = ["Backlog", "To Do", "In Progress", "Done"];

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  severity: Severity;
  details: string;
  solution: string[];
  status: TaskStatus;
  tags: string[];
}

export interface Agent {
  id: string;
  name: string;
  status: "running" | "idle";
}

export interface DiffLine {
  kind: "add" | "remove" | "context";
  text: string;
}

export interface TokenSwatch {
  name: string;
  hex: string;
}

/** Serializable layer state for a skeletal design artifact. */
export interface SkeletalLayerData {
  id: string;
  kind: "rect" | "circle" | "triangle" | "text" | "line" | "background";
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  label?: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  rotation: number;
  opacity: number;
  dashed: boolean;
  noFill: boolean;
  showLabel: boolean;
  hidden: boolean;
  radius: number;
  preset: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  mediaId?: string;
  mediaUrl?: string;
  mediaPoster?: string;
}

/** A permission grant for an MCP tool call. */
export interface PermissionChoice {
  label: string;
  allowed: boolean;
  /** "tool" grants this one tool, "mcp" grants the whole server. */
  target: "tool" | "mcp";
  /** How long the grant lasts. */
  duration: "once" | "session" | "always";
}

export const permissionAllow: PermissionChoice[] = [
  { label: "Allow tool once", allowed: true, target: "tool", duration: "once" },
  { label: "Always allow tool, this session", allowed: true, target: "tool", duration: "session" },
  { label: "Always allow tool", allowed: true, target: "tool", duration: "always" },
  { label: "Always allow using this MCP, this session", allowed: true, target: "mcp", duration: "session" },
  { label: "Always allow using this MCP", allowed: true, target: "mcp", duration: "always" },
];

export const permissionDeny: PermissionChoice[] = [
  { label: "Deny tool once", allowed: false, target: "tool", duration: "once" },
  { label: "Always deny tool, this session", allowed: false, target: "tool", duration: "session" },
  { label: "Always deny tool", allowed: false, target: "tool", duration: "always" },
  { label: "Always deny using this MCP, this session", allowed: false, target: "mcp", duration: "session" },
  { label: "Always deny using this MCP", allowed: false, target: "mcp", duration: "always" },
];

export interface Segment {
  type: "text" | "chip" | "attachment";
  text?: string;
  chip?: ChipRef;
  attachment?: { id: string; name: string; mime: string; size: number; dataUrl?: string; text?: string };
}

export type ActivityKind = "file-read" | "file-list" | "file-edit" | "terminal" | "search" | "skill" | "mcp" | "plugin" | "browser" | "foundation";
export type ActivityStatus = "done" | import("./foundation").FoundationState;

export interface ToolActivity {
  foundation?: import("./foundation").Operation;
  id: string;
  kind: ActivityKind;
  label: string;
  status: ActivityStatus;
  durationMs?: number;
  detail?: string;
  output?: string;
  imageDataUrl?: string;
  errorTrace?: string;
  /** For file-edit rows: an expandable inline diff, like the Edited artifact. */
  edit?: { file: string; added: number; removed: number; diff: DiffLine[] };
}

/** A comment the user left on a selection in a design doc. */
export interface DocComment {
  id: string;
  /** The doc (tokens message id) this comment belongs to. */
  docId: string;
  /** 1-based line range in the Markdown source. */
  startLine: number;
  endLine: number;
  /** The exact selected text. */
  quote: string;
  body: string;
  createdAt: number;
}

export type ChatMessage =
  | ThoughtMessage
  | ProfessionalToolMessage
  | PlanMessage
  | ToolResultMessage
  | { id: string; role: "user"; segments: Segment[] }
  | { id: string; role: "agent"; agentId: string; text: string; trace?: string[]; durationMs?: number }
  | { id: string; role: "event"; text: string }
  | {
      id: string;
      role: "permission";
      agentId: string;
      mcp: string;
      tool: string;
      live?: boolean;
      onceOnly?: boolean;
      decision?: PermissionChoice;
    }
  | { id: string; role: "activity-group"; summary: string; activities: ToolActivity[]; startedAt?: number; foundationGallery?: ToolActivity[] }
  | {
      id: string;
      role: "subagent";
      agentId: string;
      childId: string;
      subagentType: string;
      description: string;
      prompt: string;
      model?: string;
      runInBackground: boolean;
      isolation?: "worktree";
      status: "running" | "completed" | "failed" | "stopped";
      activities: ToolActivity[];
      result?: string;
    }
  | {
      id: string;
      role: "tokens";
      agentId: string;
      tokens: TokenSwatch[];
      contrastFrom: string;
      contrastTo: string;
    }
  | {
      id: string;
      role: "tool";
      action: string;
      file: string;
      added: number;
      removed: number;
      diff: DiffLine[];
    }
  | { id: string; role: "comment"; docId: string; comments: DocComment[]; sent?: boolean }
  | {
      id: string;
      role: "questions";
      agentId: string;
      topic: string;
      questions: { id: string; prompt: string; options: string[]; answer?: number | null }[];
    }
  | {
      id: string;
      role: "skeletal";
      agentId: string;
      title: string;
      variant: "hero" | "cards" | "dashboard";
      status: "loading" | "ready";
      frames?: number;
      accepted?: boolean;
      layers?: SkeletalLayerData[];
      width?: number;
      height?: number;
    };

/** A chat session. Sessions live inside folders (directories). */
export interface Thread {
  id: string;
  name: string;
  titleSource?: "manual" | "ai" | "fallback";
  folderId: string;
  /** Relative "last active" label, e.g. "4m", "1d". */
  updated: string;
  archived?: boolean;
  messages: ChatMessage[];
}

/** A directory in the left Explorer. Holds chat sessions. */
export interface Folder {
  id: string;
  name: string;
  /** Absolute filesystem directory linked to this Explorer group. */
  path?: string;
  /** Timestamp of when the folder was pinned; pinned folders sort first. */
  pinnedAt?: number;
}

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/* ------------------------------------------------------------------
 * Navigation
 * ------------------------------------------------------------------ */

export const navSections: NavSection[] = [
  {
    label: "Creations",
    items: [
      { id: "artifacts", label: "My artifacts", icon: Package },
      { id: "marketplace", label: "Marketplace", icon: Store },
    ],
  },
  {
    label: "Misc",
    items: [
      { id: "statistics", label: "Statistics", icon: ChartColumn },
      { id: "media", label: "Browse media", icon: Film },
      { id: "integrations", label: "Integrations", icon: Plug },
      { id: "docs", label: "Docs", icon: BookOpen },
      { id: "changelogs", label: "Changelogs", icon: Megaphone },
    ],
  },
];

/** Sections whose entries are coming soon (rendered greyed out). */
export const disabledNavSections = new Set(["marketplace"]);

export const currentUser = {
  name: "Maya Chen",
  email: "maya@taro.dev",
  initials: "MC",
};

export const agents: Agent[] = [
  { id: "planner", name: "Planner agent", status: "running" },
  { id: "coder", name: "Coder agent", status: "idle" },
];

export const agentName = (id: string): string =>
  agents.find((a) => a.id === id)?.name ?? "Agent";

/* ------------------------------------------------------------------
 * Threads & conversation seeds
 * ------------------------------------------------------------------ */

export const nikeSubagentArtifact:Extract<ChatMessage,{role:"subagent"}>={
  id:"nike-subagent-deployment",
  role:"subagent",
  agentId:"planner",
  childId:"agent-visual-audit-01",
  subagentType:"Explore",
  description:"Audit Variant B accessibility",
  prompt:"Inspect the Nike/Brand Discovery Variant B hero and token files. Check contrast and responsive layout, then report exact findings. Do not modify files.",
  model:"Inherited",
  runInBackground:true,
  isolation:"worktree",
  status:"completed",
  activities:[
    {id:"sub-read",kind:"file-read",label:"Read src/index.css",status:"done",durationMs:24},
    {id:"sub-search",kind:"search",label:"Grep contrast and spacing tokens",status:"done",durationMs:42},
    {id:"sub-review",kind:"file-read",label:"Read Variant B hero component",status:"done",durationMs:31},
  ],
  result:"Contrast reached 4.8:1 on paper. Review hero spacing at the narrow mobile breakpoint before shipping.",
};

export const seedThreads: Thread[] = [
  {
    id: "brand",
    name: "Nike/Brand Discovery",
    folderId: "taro",
    updated: "4m",
    messages: [
      {
        id: "m1",
        role: "agent",
        agentId: "planner",
        text: "I don't have access to that functionality. You may need to do this through your task management system.",
      },
      {
        id: "m2",
        role: "user",
        segments: [{ type: "text", text: "What tools do you have access to?" }],
      },
      {
        id: "m2a",
        role: "activity-group",
        summary: "Invoked /visual-qa, read 3 files, searched design tokens",
        activities: [
          { id: "s1", kind: "skill", label: "Invoked skill: /visual-qa", status: "done", durationMs: 840 },
          { id: "s2", kind: "mcp", label: "GitHub: Used MCP tool 'get_content'", status: "done", durationMs: 312 },
          { id: "s3", kind: "plugin", label: "Plugin used: Figma · read selected frame", status: "done", durationMs: 490 },
          { id: "s4", kind: "file-read", label: "Read src/index.css", status: "done", durationMs: 26 },
          { id: "s5", kind: "file-read", label: "Read src/components/ui/button.tsx", status: "done", durationMs: 18 },
          { id: "s6", kind: "search", label: "Searched 4 files for contrast tokens", status: "done", durationMs: 56 },
        ],
      },
      {
        id: "m3",
        role: "agent",
        agentId: "planner",
        text: "I can generate layouts, edit design tokens, prototype flows, run visual QA and create tasks. I only write code once you approve a design — design is the source of truth here, code stays in the background.",
      },
      {
        id: "m3b",
        role: "tokens",
        agentId: "planner",
        tokens: [
          { name: "paper", hex: "#FAFAF8" },
          { name: "ink", hex: "#0A0A0A" },
          { name: "ember", hex: "#FF4D00" },
          { name: "moss", hex: "#1A2E1F" },
          { name: "sand", hex: "#E8E1D5" },
        ],
        contrastFrom: "3.1:1",
        contrastTo: "4.8:1",
      },
      {
        id: "m4",
        role: "tool",
        action: "Edited",
        file: "styles.css",
        added: 3,
        removed: 1,
        diff: [
          { kind: "context", text: ":root {" },
          { kind: "remove", text: "  --radius: 6px;" },
          { kind: "add", text: "  --radius: 0.625rem;" },
          { kind: "add", text: "  --taro: #a78bfa;" },
          { kind: "add", text: "  --success: #46a758;" },
          { kind: "context", text: "}" },
        ],
      },
      {
        id: "m4p",
        role: "tool",
        action: "Edited",
        file: "Plan",
        added: 4,
        removed: 2,
        diff: [
          { kind: "context", text: "## Rollout" },
          { kind: "remove", text: "- Ship hero + tokens together" },
          { kind: "remove", text: "- QA after launch" },
          { kind: "add", text: "- Ship tokens first, hero second" },
          { kind: "add", text: "- Visual QA gate before each ship" },
          { kind: "add", text: "- Contrast must clear AA on paper" },
          { kind: "add", text: "- Export tokens to Figma on approval" },
        ],
      },
      {
        id: "m4a",
        role: "activity-group",
        summary: "Read 2 files, searched 1 query, edited 4 files, ran 2 commands",
        activities: [
          { id: "a1", kind: "file-read", label: "Read src/index.css", status: "done", durationMs: 22 },
          { id: "a2", kind: "file-read", label: "Read src/components/ui/button.tsx", status: "done", durationMs: 18 },
          { id: "a3", kind: "search", label: "Searched for --radius and --taro", status: "done", durationMs: 43 },
          {
            id: "a4",
            kind: "file-edit",
            label: "Edited src/index.css",
            status: "done",
            durationMs: 64,
            edit: {
              file: "src/index.css",
              added: 2,
              removed: 1,
              diff: [
                { kind: "context", text: ":root {" },
                { kind: "remove", text: "  --ember: #ff7a1a;" },
                { kind: "add", text: "  --ember: #ff4d00;" },
                { kind: "add", text: "  --ember-ink: #431407;" },
                { kind: "context", text: "}" },
              ],
            },
          },
          {
            id: "a4b",
            kind: "file-edit",
            label: "Edited src/components/ui/button.tsx",
            status: "done",
            durationMs: 60,
            edit: {
              file: "src/components/ui/button.tsx",
              added: 1,
              removed: 1,
              diff: [
                { kind: "context", text: "const buttonVariants = cva(" },
                { kind: "remove", text: '  "bg-orange-500 text-white",' },
                { kind: "add", text: '  "bg-[var(--ember)] text-[var(--ember-ink)]",' },
                { kind: "context", text: ")" },
              ],
            },
          },
          { id: "a5", kind: "terminal", label: "Ran pnpm build", status: "done", durationMs: 2490 },
          { id: "a6", kind: "terminal", label: "Ran pnpm test", status: "done", durationMs: 1360 },
        ],
      },
      { id: "m5", role: "event", text: "Chat context summarized" },
      {
        id: "m5q",
        role: "questions",
        agentId: "planner",
        topic: "Discovery hero",
        questions: [
          {
            id: "q1",
            prompt: "Which hero direction should anchor Variant B?",
            options: ["Bold sans with serif italic", "All-sans, tighter tracking", "Editorial serif throughout", "Type on image"],
          },
          {
            id: "q2",
            prompt: "How should the product cards behave on scroll?",
            options: ["Static grid", "Horizontal carousel", "Staggered reveal", "Stacked on mobile only"],
          },
          {
            id: "q3",
            prompt: "What should the ember accent be reserved for?",
            options: ["Primary CTA only", "CTAs and links", "All interactive states", "Nothing — go monochrome"],
          },
        ],
      },
      {
        id: "m5s",
        role: "skeletal",
        agentId: "planner",
        title: "Discovery · skeletal hero",
        variant: "hero",
        status: "loading",
      },
      {
        id: "m5r",
        role: "skeletal",
        agentId: "planner",
        title: "Discovery · skeletal hero",
        variant: "hero",
        status: "ready",
        frames: 3,
      },
      {
        id: "m6",
        role: "permission",
        agentId: "planner",
        mcp: "GitHub",
        tool: "get_content",
      },
      nikeSubagentArtifact,
      { id: "nike-phase-two-intro", role: "agent", agentId: "planner", text: "Here are the Phase 2 tool artifacts for review. The examples below use the same compact rows and document cards as the rest of this conversation." },
      ...nikePhaseTwoArtifacts,
    ],
  },
  
];

export function ensureNikeSubagentArtifact(thread:Thread):Thread {
  if(thread.id!=="brand")return thread;
  let migrated=false;
  const messages=thread.messages.flatMap(message=>{
    if(message.role!=="professional-tool")return [message];
    migrated=true;
    return migrateProfessionalMessage(message);
  });
  const existing=new Set(messages.map(message=>message.id));
  const referenceMessages=seedThreads[0].messages.filter(message=>message.id===nikeSubagentArtifact.id||message.id.startsWith("nike-phase-two-"));
  const missing=referenceMessages.filter(message=>!existing.has(message.id));
  return upgradeFoundationPreviews(migrated||missing.length?{...thread,messages:[...messages,...missing]}:thread);
}

seedThreads[0]=upgradeFoundationPreviews(seedThreads[0]);

export const seedFolders: Folder[] = [
  { id: "taro", name: "taro" },
];

export const starterPrompts: string[] = [
  "Break the checkout redesign into tasks",
  "Audit design tokens for contrast",
  "Review styles.css for dark mode",
];

/* ------------------------------------------------------------------
 * Tasks
 * ------------------------------------------------------------------ */

export const seedTasks: Task[] = [
  {
    id: "t1",
    title: "Refactor Data Models",
    description: "Improve data model efficiency for faster query times.",
    priority: "Medium",
    severity: "Medium",
    details: "The current data models repeat information in several places. This can make everyday searches slower and makes updates more fragile.",
    solution: ["Review the existing model relationships.", "Remove duplicated fields and add the missing indexes.", "Verify that common searches return the same results faster."],
    status: "Backlog",
    tags: ["data", "models"],
  },
  {
    id: "t2",
    title: "Implement API Rate Limiting",
    description: "Protect API from abuse by implementing rate limits.",
    priority: "Medium",
    severity: "High",
    details: "A single client can currently send too many requests, which may slow the service for everyone or exhaust the API budget.",
    solution: ["Measure normal request volume first.", "Add a per-user request limit with a clear retry message.", "Test both normal use and bursts before enabling it."],
    status: "Backlog",
    tags: ["api", "security"],
  },
  {
    id: "t3",
    title: "Optimize Image Loading",
    description: "Reduce page load times by optimizing image loading.",
    priority: "High",
    severity: "High",
    details: "Large images delay the first screen and make the page feel unresponsive, especially on slower connections.",
    solution: ["Identify the largest images in the first viewport.", "Serve responsive sizes and modern formats.", "Lazy-load images below the fold and compare load time."],
    status: "Backlog",
    tags: ["performance", "ux"],
  },
  {
    id: "t4",
    title: "Fix Checkout Total",
    description: "Resolve discounts that are not applied correctly during checkout.",
    priority: "High",
    severity: "Critical",
    details: "Some customers see the wrong order total when a discount is applied. This can lead to incorrect charges.",
    solution: ["Reproduce with the affected discount codes.", "Fix the total calculation at the source.", "Add regression tests for single and stacked discounts."],
    status: "To Do",
    tags: ["bug", "checkout"],
  },
  {
    id: "t5",
    title: "Onboarding empty states",
    description: "Design calm, instructive empty states for first-run threads.",
    priority: "Low",
    severity: "Low",
    details: "A new workspace currently gives people little guidance when there are no threads yet.",
    solution: ["Write a concise first-run message.", "Show one useful starter action.", "Check that the layout stays quiet and accessible."],
    status: "To Do",
    tags: ["design", "ux"],
  },
  {
    id: "t6",
    title: "Brand color ramp",
    description: "Generate accessible neutrals and accent steps for dark surfaces.",
    priority: "Medium",
    severity: "Medium",
    details: "The current color ramp has uneven contrast between neighboring surfaces and some accent states.",
    solution: ["Build consistent neutral steps.", "Check text and interactive contrast at each step.", "Update tokens and review the live frame."],
    status: "In Progress",
    tags: ["design-system"],
  },
  {
    id: "t7",
    title: "Scaffold desktop shell",
    description: "Window chrome, collapsible sidebar, and composer layout.",
    priority: "Low",
    severity: "Low",
    details: "The desktop shell now has a window title bar, navigation, chat composer, and resizable side panel.",
    solution: ["Keep the window chrome consistent.", "Verify keyboard access to the sidebar and panels.", "Check the composer at narrow widths."],
    status: "Done",
    tags: ["app"],
  },
];
