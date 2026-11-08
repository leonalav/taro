import {
  Bot,
  CircleUser,
  Cpu,
  GitBranch,
  Globe,
  Palette,
  Puzzle,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import { skills as builtinSkills } from "./mentions";
import { DEFAULT_WORKSPACE_RULES } from "../lib/workspace-rules";

/* ------------------------------------------------------------------
 * Sections
 * ------------------------------------------------------------------ */

export type SettingsSectionId =
  | "account"
  | "appearance"
  | "plugins"
  | "rules"
  | "models"
  | "agents"
  | "source-control"
  | "browser";

export const settingsSections: {
  id: SettingsSectionId;
  label: string;
  description: string;
  icon: LucideIcon;
  group: "Personal" | "Workspace";
}[] = [
  { id: "account", label: "My account", description: "Profile, sign-in and sessions.", icon: CircleUser, group: "Personal" },
  { id: "appearance", label: "Appearance", description: "Theme, accent, density and motion.", icon: Palette, group: "Personal" },
  { id: "plugins", label: "Plugins", description: "Extend Taro with MCP servers and integrations.", icon: Puzzle, group: "Workspace" },
  { id: "rules", label: "Rules", description: "Guidance every agent follows in this workspace.", icon: ScrollText, group: "Workspace" },
  { id: "models", label: "Models", description: "Providers, defaults and reasoning effort.", icon: Cpu, group: "Workspace" },
  { id: "agents", label: "Agents", description: "Who does what, and how much they can touch.", icon: Bot, group: "Workspace" },
  { id: "source-control", label: "Source Control", description: "Repository, branches and commit behaviour.", icon: GitBranch, group: "Workspace" },
  { id: "browser", label: "Browser", description: "Live preview, viewports and visual QA.", icon: Globe, group: "Workspace" },
];

/* ------------------------------------------------------------------
 * Settings model
 * ------------------------------------------------------------------ */

export type Theme = "dark" | "light" | "system";
export type Density = "compact" | "comfortable" | "spacious";
export type Accent = "taro" | "blue" | "green" | "amber" | "pink" | "mono";

export const accents: { id: Accent; label: string; hex: string }[] = [
  { id: "taro", label: "Taro", hex: "#a78bfa" },
  { id: "blue", label: "Blue", hex: "#3b9eff" },
  { id: "green", label: "Green", hex: "#3dd68c" },
  { id: "amber", label: "Amber", hex: "#ffb224" },
  { id: "pink", label: "Pink", hex: "#f76eb2" },
  { id: "mono", label: "Mono", hex: "#ededed" },
];

export interface Plugin {
  id: string;
  name: string;
  description: string;
  kind: "MCP" | "Integration";
  enabled: boolean;
  status: "connected" | "needs-auth" | "off";
  transport?: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  url?: string;
}

export interface Rule {
  id: string;
  text: string;
  scope: "Always" | "Design" | "Code";
  enabled: boolean;
}

export interface Provider {
  id: string;
  name: string;
  connected: boolean;
  keyHint?: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  model: string;
  enabled: boolean;
  autonomy: "ask" | "suggest" | "auto";
  canWriteCode: boolean;
}

export interface SkillConfig {
  id: string;
  label: string;
  description?: string;
  source: "builtin" | "custom";
  path?: string;
  enabled: boolean;
}

export interface Settings {
  workspaceRoot?: string;
  account: { name: string; email: string; handle: string; notifyMentions: boolean; notifyDigest: boolean };
  appearance: {
    theme: Theme;
    accent: Accent;
    density: Density;
    reduceMotion: boolean;
    showCodeByDefault: boolean;
    canvasGrid: boolean;
  };
  plugins: Plugin[];
  skills: SkillConfig[];
  rules: Rule[];
  models: {
    defaultModel: string;
    reviewModel: string;
    effort: number;
    providers: Provider[];
    streamResponses: boolean;
    /** Custom models via an OpenAI-compatible endpoint — Lite plans are limited. */
    customModels: CustomModel[];
  };
  agents: AgentConfig[];
  sourceControl: {
    provider: string;
    repo: string;
    defaultBranch: string;
    branchPrefix: string;
    autoCommit: boolean;
    requireApproval: boolean;
    signCommits: boolean;
    commitStyle: "conventional" | "descriptive";
    signedIn: boolean;
    repos: string[];
    branches: string[];
  };
  browser: {
    engine: string;
    viewport: "desktop" | "tablet" | "mobile";
    devUrl: string;
    hotReload: boolean;
    visualQaOnSave: boolean;
    captureScreenshots: boolean;
    blockTrackers: boolean;
  };
}

export interface CustomModel {
  id: string;
  label: string;
  /** Base URL of the OpenAI-compatible endpoint. */
  endpoint: string;
  /** API key for that endpoint, stored per model on this device. */
  apiKey?: string;
}

/** Lite plans may add at most two custom models; more requires Lite+. */
export const MAX_CUSTOM_MODELS = 2;

/** Free effort levels stop at High; Max is a Lite+ feature. */
export const MAX_FREE_EFFORT = 2;

/** Built-in model catalog for the chat and review model pickers. */
export const builtinModelOptions = [
  { value: "gpt-6-luna", label: "GPT-6 Luna" },
  { value: "gpt-6-terra", label: "GPT-6 Terra" },
  { value: "deepseek-v4.1-flash", label: "DeepSeek v4.1 Flash" },
  { value: "grok-4.7", label: "Grok 4.7" },
] as const;

/** Full model list: built-ins plus any custom endpoint models. */
export function modelOptions(customModels: CustomModel[] = []) {
  return [
    ...builtinModelOptions.map((m) => ({ ...m })),
    ...customModels.slice(0, MAX_CUSTOM_MODELS).map((m) => ({ value: m.id, label: m.label })),
  ];
}

export const defaultSettings: Settings = {
  account: {
    name: "Maya Chen",
    email: "maya@taro.dev",
    handle: "maya",
    notifyMentions: true,
    notifyDigest: false,
  },
  appearance: {
    theme: "dark",
    accent: "taro",
    density: "comfortable",
    reduceMotion: false,
    showCodeByDefault: false,
    canvasGrid: true,
  },
  plugins: [
    { id: "storybook", name: "Storybook", description: "Preview components in isolation.", kind: "Integration", enabled: false, status: "off" },
  ],
  skills: builtinSkills.map((s) => ({
    id: s.id,
    label: s.label,
    description: s.description,
    source: "builtin" as const,
    enabled: true,
  })),
  rules: DEFAULT_WORKSPACE_RULES.map((rule) => ({ ...rule })),
  models: {
    defaultModel: "gpt-6-luna",
    reviewModel: "grok-4.7",
    effort: 1,
    providers: [
      { id: "anthropic", name: "Anthropic", connected: true, keyHint: "sk-ant-…4f2a" },
      { id: "openai", name: "OpenAI", connected: false },
      { id: "google", name: "Google", connected: false },
      { id: "local", name: "Local (Ollama)", connected: true, keyHint: "localhost:11434" },
    ],
    streamResponses: true,
    customModels: [],
  },
  agents: [
    { id: "aria", name: "Aria", role: "Designer agent", model: "gpt-6-luna", enabled: true, autonomy: "suggest", canWriteCode: false },
    { id: "theo", name: "Theo", role: "Type & QA", model: "grok-4.7", enabled: true, autonomy: "suggest", canWriteCode: false },
    { id: "rin", name: "Rin", role: "Code agent", model: "deepseek-v4.1-flash", enabled: true, autonomy: "ask", canWriteCode: true },
  ],
  sourceControl: {
    provider: "github",
    repo: "taro-labs/discovery",
    defaultBranch: "main",
    branchPrefix: "taro/",
    autoCommit: false,
    requireApproval: true,
    signCommits: true,
    commitStyle: "conventional",
    signedIn: false,
    repos: ["taro-labs/discovery", "maya/aria-studio", "maya/tokens", "taro-labs/checkout"],
    branches: ["main", "develop", "design-next"],
  },
  browser: {
    engine: "chromium",
    viewport: "desktop",
    devUrl: "http://localhost:3000",
    hotReload: true,
    visualQaOnSave: true,
    captureScreenshots: true,
    blockTrackers: true,
  },
};
