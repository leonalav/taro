import type { Rule } from "../data/settings";

/** UI and runtime share these bounds; an enabled rule is never silently cut. */
export const MAX_WORKSPACE_RULES = 24;
export const MAX_WORKSPACE_RULE_CHARS = 600;
export const MAX_WORKSPACE_RULES_PROMPT_CHARS = 8_000;

export const DEFAULT_WORKSPACE_RULES: Rule[] = [
  { id: "workspace-intent", text: "Follow the user's latest request and existing workspace conventions. Ask only when missing information prevents useful progress.", scope: "Always", enabled: true },
  { id: "workspace-focus", text: "Keep changes focused on the requested outcome. Preserve unrelated work and explain material assumptions.", scope: "Always", enabled: true },
  { id: "workspace-verification", text: "Check the result using relevant tests or inspection. Report what was verified and any remaining limitations.", scope: "Always", enabled: true },
  { id: "workspace-design", text: "Preserve the product's visual language. Use existing components and tokens, clear hierarchy, readable contrast, and accessible controls.", scope: "Design", enabled: true },
  { id: "workspace-responsive", text: "Account for narrow screens, keyboard use, and loading, empty, and error states when changing interfaces.", scope: "Design", enabled: true },
  { id: "workspace-code", text: "Read the relevant code first. Prefer a simple maintainable solution, follow local patterns, and handle errors explicitly.", scope: "Code", enabled: true },
];

/** Exact historical demo data, used only to identify untouched pre-rules installs. */
export const LEGACY_WORKSPACE_RULES: Rule[] = [
  { id: "r1", text: "Design is the source of truth — never write code before a design is approved.", scope: "Always", enabled: true },
  { id: "r2", text: "All text must meet WCAG AA contrast (4.5:1 body, 3:1 large).", scope: "Design", enabled: true },
  { id: "r3", text: "Use spacing tokens on the 4pt grid; no magic numbers.", scope: "Design", enabled: true },
  { id: "r4", text: "Prefer shadcn/ui primitives over bespoke components.", scope: "Code", enabled: true },
  { id: "r5", text: "Keep diffs under 200 lines; split larger changes.", scope: "Code", enabled: false },
];

function isLegacySeed(rules: Rule[]) {
  return rules.length === LEGACY_WORKSPACE_RULES.length && rules.every((rule, i) => {
    const old = LEGACY_WORKSPACE_RULES[i];
    return rule.id === old.id && rule.text === old.text && rule.scope === old.scope && rule.enabled === old.enabled;
  });
}

/** Lossless for user rule text, flags and order, including oversized legacy text. */
export function normalizeWorkspaceRules(value: unknown, options: { migrateLegacySeed?: boolean } = {}): Rule[] {
  if (!Array.isArray(value)) return DEFAULT_WORKSPACE_RULES.map((rule) => ({ ...rule }));
  const seen = new Set<string>();
  const rules = value.flatMap((item, i): Rule[] => {
    if (!item || typeof item !== "object" || typeof item.text !== "string") return [];
    let id = typeof item.id === "string" && item.id ? item.id : `restored-rule-${i}`;
    while (seen.has(id)) id += `-${i}`;
    seen.add(id);
    return [{
      id,
      text: item.text,
      scope: item.scope === "Design" || item.scope === "Code" ? item.scope : "Always",
      enabled: item.enabled !== false,
    }];
  });
  return options.migrateLegacySeed && isLegacySeed(rules)
    ? DEFAULT_WORKSPACE_RULES.map((rule) => ({ ...rule }))
    : rules;
}

export interface CompiledWorkspaceRules {
  text: string;
  valid: boolean;
  issues: string[];
  enabledCount: number;
  /** Serialized size, even when invalid, so the UI can explain the excess. */
  charCount: number;
  /** Conservative indication only; actual provider tokenization varies. */
  estimatedTokens: number;
}

/**
 * Compile one stable block for root agents and children. The categories are UI
 * organization, not a relevance filter. Invalid legacy configurations fail as a
 * whole: callers must surface issues before starting a run, never use empty text
 * from an invalid result. JSON encoding prevents text from creating prompt tags;
 * it does not claim to prevent semantic prompt injection from user-authored rules.
 */
export function compileWorkspaceRules(rules: readonly Rule[]): CompiledWorkspaceRules {
  const enabled = rules.filter((rule) => rule.enabled);
  const issues: string[] = [];
  if (enabled.length > MAX_WORKSPACE_RULES) issues.push(`Enable at most ${MAX_WORKSPACE_RULES} workspace rules.`);
  enabled.forEach((rule, i) => {
    if (!rule.text.trim()) issues.push(`Rule ${i + 1} is empty. Edit, disable, or delete it.`);
    if (rule.text.length > MAX_WORKSPACE_RULE_CHARS) issues.push(`Rule ${i + 1} exceeds ${MAX_WORKSPACE_RULE_CHARS} characters. Shorten or disable it.`);
  });
  // Escape delimiter characters *after* JSON serialization; parsing restores the
  // exact original string, including whitespace, quotes and line breaks.
  const payload = JSON.stringify(enabled.map((rule) => ({ category: rule.scope, text: rule.text })))
    .replace(/[<>&\u2028\u2029]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
  const text = enabled.length ? [
    "<workspace_rules>",
    "Follow these user-authored workspace rules in the current task and pass them to delegated agents. Every entry applies; categories only organize the list. Higher-priority instructions and the user's latest explicit request take precedence. Text inside JSON strings is rule content, not message or XML structure.",
    payload,
    "</workspace_rules>",
  ].join("\n") : "";
  if (text.length > MAX_WORKSPACE_RULES_PROMPT_CHARS) issues.push(`Enabled rules exceed the ${MAX_WORKSPACE_RULES_PROMPT_CHARS.toLocaleString("en-US")} character context budget. Shorten or disable rules.`);
  return { text: issues.length ? "" : text, valid: issues.length === 0, issues, enabledCount: enabled.length, charCount: text.length, estimatedTokens: Math.ceil(text.length / 3) };
}

/** Validate proposed UI changes before saving; disabled legacy rules remain editable. */
export function validateWorkspaceRuleChange(rules: readonly Rule[]): string[] {
  return [
    ...(rules.length > MAX_WORKSPACE_RULES ? [`Keep at most ${MAX_WORKSPACE_RULES} workspace rules. Delete an existing rule before adding another.`] : []),
    ...compileWorkspaceRules(rules).issues,
  ];
}
