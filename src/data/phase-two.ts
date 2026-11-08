/** Reference-only presentations, informed by refs/claude-code/src/tools. */
import type { ChatMessage, ToolActivity } from "./mock";

export type PlanMessage = { id: string; role: "plan"; agentId: string; kind: "Design Plan" | "Plan"; name: string; path: string; markdown: string; workspaceRoot?:string; sessionId?:string };
export type ToolResultMessage = { id: string; role: "tool-result"; tool: "LSP" | "TaskOutput" | "TaskStop" | "Worktree" | "ToolSearch"; action: string; subject: string; status: string; failed?: boolean; output: string };
type Base = { id: string; role: "professional-tool"; title: string; description: string };
export type SourceLocation = { file: string; line: number; character: number; preview: string };
export type ProfessionalToolMessage = Base & (
  | { tool: "LSP"; operation: string; symbol: string; source: SourceLocation; locations: SourceLocation[]; error?: string }
  | { tool: "PowerShell"; command: string; taskId: string; outputPath: string; stdout: string; stderr: string; interrupted: boolean }
  | { tool: "TaskOutput"; taskId: string; taskType: string; taskStatus: "running" | "completed" | "failed"; retrievalStatus: "success" | "timeout" | "not_ready"; block: boolean; timeout: number; output: string }
  | { tool: "TaskStop"; taskId: string; taskType: string; command: string; output: string }
  | { tool: "PlanMode"; file: string; steps: string[]; permissions: string[] }
  | { tool: "Worktree"; path: string; branch: string; originalPath: string; action: "keep" | "remove" }
  | { tool: "Skill"; skill: string; args: string; context: "inline" | "forked"; allowedTools: string[]; result: string }
  | { tool: "ToolSearch"; query: string; maxResults: number; totalDeferredTools: number; matches: { name: string; description: string }[] }
);

const legacyPhaseTwoArtifacts: ProfessionalToolMessage[] = [
  {
    id: "nike-phase-two-lsp", role: "professional-tool", tool: "LSP",
    title: "Find symbol references", description: "Locate every use of the hero's primary action before changing its props.",
    operation: "findReferences", symbol: "HeroAction",
    source: { file: "src/components/hero-action.tsx", line: 12, character: 17, preview: "export function HeroAction({ label, href }: HeroActionProps) {" },
    locations: [
      { file: "src/components/discovery-hero.tsx", line: 48, character: 9, preview: '<HeroAction label="Explore the collection" href="/collection" />' },
      { file: "src/components/mobile-hero.tsx", line: 31, character: 7, preview: '<HeroAction label="Find your next move" href="/collection" />' },
      { file: "src/components/hero-action.test.tsx", line: 18, character: 12, preview: 'render(<HeroAction label="Explore" href="/collection" />);' },
    ],
  },
  {
    id: "nike-phase-two-lsp-unavailable", role: "professional-tool", tool: "LSP",
    title: "Language server unavailable", description: "Symbol navigation needs a language server for this file type.",
    operation: "hover", symbol: "$heroTokens",
    source: { file: "scripts/export-tokens.ps1", line: 8, character: 1, preview: "$heroTokens = Get-Content -LiteralPath $tokenPath" },
    locations: [], error: "No language server is configured for .ps1 files. Configure a PowerShell language server, or use Read and Grep to inspect this symbol.",
  },
  {
    id: "nike-phase-two-powershell", role: "professional-tool", tool: "PowerShell",
    title: "Run responsive checks", description: "Start the Variant B layout checks as a background command.",
    command: "pnpm test -- --run src/components/discovery-hero.test.tsx",
    taskId: "shell-nike-layout-02", outputPath: "tasks/shell-nike-layout-02.output",
    stdout: "RUN  Variant B responsive layout\n✓ desktop · hero action stays in view\n✓ tablet · product cards wrap to two columns\nChecking mobile spacing…",
    stderr: "", interrupted: false,
  },
  {
    id: "nike-phase-two-task-output", role: "professional-tool", tool: "TaskOutput",
    title: "Read background progress", description: "Check the layout task without waiting for it to finish.",
    taskId: "shell-nike-layout-02", taskType: "local_bash", taskStatus: "running", retrievalStatus: "not_ready", block: false, timeout: 30000,
    output: "✓ desktop · hero action stays in view\n✓ tablet · product cards wrap to two columns\nMobile check is still running. Partial output is available.",
  },
  {
    id: "nike-phase-two-task-stop", role: "professional-tool", tool: "TaskStop",
    title: "Stop background task", description: "The layout check was stopped before the next review. Its partial output is retained.",
    taskId: "shell-nike-layout-02", taskType: "local_bash", command: "pnpm test -- --run src/components/discovery-hero.test.tsx",
    output: "2 checks completed before interruption.\nMobile check did not finish; no result was recorded.",
  },
  {
    id: "nike-phase-two-plan", role: "professional-tool", tool: "PlanMode",
    title: "Variant B implementation plan", description: "Exploration is complete. Review the proposed changes before leaving plan mode.",
    file: "plans/nike-variant-b.md",
    steps: ["Update the ember action tokens and keep the approved paper and ink colors.", "Use the shared HeroAction in the desktop and mobile hero.", "Resolve the narrow-screen spacing found by the accessibility audit.", "Run contrast and responsive checks, then review the final diff."],
    permissions: ["Run component tests", "Run the production build"],
  },
  {
    id: "nike-phase-two-worktree", role: "professional-tool", tool: "Worktree",
    title: "Isolated worktree", description: "The session returned to the original workspace. The review branch and its files were kept.",
    path: ".claude/worktrees/nike-variant-b", branch: "worktree-nike-variant-b", originalPath: "nike-discovery", action: "keep",
  },
  {
    id: "nike-phase-two-skill", role: "professional-tool", tool: "Skill",
    title: "Invoke visual QA", description: "Load the project's visual review instructions into the current conversation.",
    skill: "visual-qa", args: "Variant B · hero and primary action", context: "inline", allowedTools: ["Read", "Grep", "LSP"],
    result: "Skill loaded. Review the approved paper/ink/ember tokens, check action contrast, and inspect hero spacing at desktop and mobile widths. Loading the skill does not mean the review has passed.",
  },
  {
    id: "nike-phase-two-tool-search", role: "professional-tool", tool: "ToolSearch",
    title: "Discover available tools", description: "Find the deferred tools needed for the next code review.",
    query: "select:LSP,Skill", maxResults: 5, totalDeferredTools: 24,
    matches: [
      { name: "LSP", description: "Navigate definitions, references, symbols, and call hierarchies." },
      { name: "Skill", description: "Load a skill by name, with optional arguments." },
    ],
  },
];

/** Convert the retired large previews to the incumbent artifact formats. */
export function migrateProfessionalMessage(message: ProfessionalToolMessage): ChatMessage[] {
  const row = (action: string, subject: string, status: string, output: string, failed = false): ChatMessage[] => [{ id: message.id, role: "tool-result", tool: message.tool as ToolResultMessage["tool"], action, subject, status, output, failed }];
  switch (message.tool) {
    case "Skill": return []; // The original /visual-qa invocation already lives in m2a.
    case "PowerShell": {
      const activity: ToolActivity = { id: `${message.id}-command`, kind: "terminal", label: `Ran ${message.command}`, status: message.interrupted ? "failed" : "done", durationMs:1360, output: [message.stdout, message.stderr, `Task: ${message.taskId}`, `Output: ${message.outputPath}`].filter(Boolean).join("\n") };
      return [{ id: message.id, role: "activity-group", summary: "Ran 1 PowerShell command", activities: [activity] }];
    }
    case "PlanMode": return [
      { id: "nike-phase-two-enter-plan", role: "event", text: "Enter plan mode" },
      { id: message.id, role: "plan", agentId: "planner", kind: "Plan", name: message.title, path: message.file, markdown: `# ${message.title}\n\n## Implementation\n\n${message.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}\n\n## Validation\n\n${message.permissions.map(permission => `- ${permission}`).join("\n")}\n` },
    ];
    case "LSP": return row(message.error ? "Unavailable" : "Found references", message.symbol, message.error ? "Failed" : `${message.locations.length} references`, [message.operation, `${message.source.file}:${message.source.line}:${message.source.character}`, message.error ?? message.locations.map(location => `${location.file}:${location.line}:${location.character}\n${location.preview}`).join("\n\n")].join("\n\n"), Boolean(message.error));
    case "TaskOutput": return row("Read output", message.taskId, message.retrievalStatus === "success" ? "Done" : "Not ready", `Task status: ${message.taskStatus}\nRetrieval: ${message.retrievalStatus}\n${message.block ? `Wait: up to ${message.timeout}ms` : "Non-blocking"}\n\n${message.output}\n\nLegacy TaskOutput: prefer Read on the task output file.`);
    case "TaskStop": return row("Stopped", message.taskId, "Done", `${message.command}\n\n${message.output}`);
    case "Worktree": return row(message.action === "keep" ? "Kept worktree" : "Removed worktree", message.branch, "Done", `Worktree: ${message.path}\nBranch: ${message.branch}\nReturned to: ${message.originalPath}\nExit action: ${message.action}`);
    case "ToolSearch": return row("Searched tools", message.query, `${message.matches.length} found`, message.matches.map(match => `${match.name}\n${match.description}`).join("\n\n"));
  }
}

export const nikePhaseTwoArtifacts: ChatMessage[] = [
  ...legacyPhaseTwoArtifacts.flatMap(migrateProfessionalMessage),
  {
    id: "nike-phase-two-design-plan", role: "plan", agentId: "planner", kind: "Design Plan",
    name: "Discovery · Variant B", path: "plans/nike-variant-b-design.md",
    markdown: "# Discovery · Variant B\n\n## Direction\n\nPair a bold sans display with a serif italic accent. Keep the hero focused on the collection and a single primary action.\n\n## Layout\n\n- Use the approved skeletal hero as the starting point.\n- Keep the action visible at desktop, tablet, and mobile widths.\n- Use a static product grid with a single column on narrow screens.\n\n## Design tokens\n\n- Paper: #FAFAF8\n- Ink: #0A0A0A\n- Ember: #FF4D00, reserved for the primary action.\n\n## Review\n\n- [ ] Confirm the hero direction.\n- [ ] Check action contrast against paper.\n- [ ] Review spacing at the narrow mobile breakpoint.\n",
  },
];
