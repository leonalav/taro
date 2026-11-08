import {
  Frame,
  MessageSquare,
  GitBranch,
  Layers,
  Plug,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

/* ------------------------------------------------------------------
 * Inline chips: files & MCP servers for "@", skills for "/"
 * ------------------------------------------------------------------ */

export type ChipKind = "file" | "mcp" | "skill" | "artifact" | "comment";

export interface CommentReference {
  /** "single" chips read "Comment · L11-17"; groups read "Comments · Design Plan". */
  mode: "single" | "group";
  lines: string;
  count: number;
  docId: string;
  comments: {
    id: string;
    body: string;
    quote: string;
    startLine: number;
    endLine: number;
  }[];
}

export interface ArtifactReference {
  id: string;
  source: "design" | "media";
  type: "design" | "skeleton" | "prototype" | "video";
  folderId?: string;
  frames?: number;
  background?: string;
  poster?: string;
  url?: string;
}

export interface ChipRef {
  id: string;
  kind: ChipKind;
  label: string;
  description?: string;
  artifact?: ArtifactReference;
  comment?: CommentReference;
}

export interface ChipInsertion {
  requestId: string;
  threadId: string;
  chip: ChipRef;
}

export const chipIcon: Record<ChipKind, LucideIcon> = {
  file: GitBranch,
  mcp: Plug,
  skill: Layers,
  artifact: Layers,
  comment: MessageSquare,
};

export const mcpIcon: Record<string, LucideIcon> = {
  "mcp:figma": Frame,
  "mcp:linear": Layers,
  "mcp:github": GitBranch,
  "mcp:sentry": TriangleAlert,
};

/* ---- Skills (slash commands) -------------------------------------- */

export const skills: ChipRef[] = [
  {
    id: "skill:visual-qa",
    kind: "skill",
    label: "visual-qa",
    description: "Contrast, spacing & a11y pass on the live frame",
  },
  {
    id: "skill:design-tokens",
    kind: "skill",
    label: "design-tokens",
    description: "Edit, diff and export the token set",
  },
  {
    id: "skill:generate-variants",
    kind: "skill",
    label: "generate-variants",
    description: "Create hero variants from the current selection",
  },
  {
    id: "skill:refine-type-scale",
    kind: "skill",
    label: "refine-type-scale",
    description: "Tune the type ramp for optical balance",
  },
  {
    id: "skill:create-tasks",
    kind: "skill",
    label: "create-tasks",
    description: "Turn annotations into tasks on the board",
  },
  {
    id: "skill:prototype-flow",
    kind: "skill",
    label: "prototype-flow",
    description: "Wire frames into a clickable flow",
  },
  {
    id: "skill:explain-diff",
    kind: "skill",
    label: "explain-diff",
    description: "Summarise what changed since the last approval",
  },
];

/* ------------------------------------------------------------------
 * Thinking effort
 * ------------------------------------------------------------------ */

export interface EffortLevel {
  label: string;
  hint: string;
  /** Lite+ gated. */
  pro?: boolean;
}

export const effortLevels: EffortLevel[] = [
  { label: "Low", hint: "Fast replies, light planning" },
  { label: "Medium", hint: "Balanced depth for everyday work" },
  { label: "High", hint: "Deeper analysis, slower turns" },
  { label: "Max", hint: "Full reasoning budget, no shortcuts", pro: true },
];

export const effortModes = [
  { id: "thinking", label: "Thinking effort", hint: "Depth of internal reasoning" },
  { id: "budget", label: "Token budget", hint: "Cap the output length" },
  { id: "off", label: "Off", hint: "Reply without extra reasoning" },
] as const;

export type EffortMode = (typeof effortModes)[number]["id"];
