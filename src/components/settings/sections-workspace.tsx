import * as React from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open as openDirectory } from "@tauri-apps/plugin-dialog";
import {
  Check,
  Crown,
  Folder,
  Frame,
  KeyRound,
  Laptop,
  Layers,
  Monitor,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Smartphone,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { SettingsGroup, SettingsRow, StatusDot } from "@/components/settings/primitives";
import type { SectionProps } from "@/components/settings/sections-personal";
import { effortLevels } from "@/data/mentions";
import { MAX_CUSTOM_MODELS, modelOptions, type AgentConfig, type Plugin, type Rule } from "@/data/settings";
import { compileWorkspaceRules, MAX_WORKSPACE_RULES, MAX_WORKSPACE_RULE_CHARS, MAX_WORKSPACE_RULES_PROMPT_CHARS, validateWorkspaceRuleChange } from "@/lib/workspace-rules";
import { cn } from "@/utils/cn";

let seq = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${seq++}`;

/* ------------------------------------------------------------------
 * Plugins
 * ------------------------------------------------------------------ */

/* GitHub mark (brand icon, not in Lucide) */
function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={cn("shrink-0", className)}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

type PluginIconType = React.ComponentType<{ className?: string }>;

const pluginIcons: Record<string, PluginIconType> = {
  figma: Frame,
  linear: Layers,
  github: GitHubMark,
  sentry: TriangleAlert,
  storybook: Layers,
};

const mcpCatalog = [
  { id: "figma", name: "Figma", description: "Read frames, tokens and comments." },
  { id: "linear", name: "Linear", description: "Sync visual QA findings to issues." },
  { id: "github", name: "GitHub", description: "Open PRs for approved designs." },
  { id: "sentry", name: "Sentry", description: "Attach runtime errors to tasks." },
  { id: "notion", name: "Notion", description: "Ground agents in your docs." },
  { id: "slack", name: "Slack", description: "Post reviews to channels." },
  { id: "playwright", name: "Playwright", description: "Drive a real browser for QA." },
  { id: "brave", name: "Brave Search", description: "Web search for research tasks." },
];

const transportLabels = { stdio: "stdio", http: "Streamable HTTP" } as const;
type Transport = keyof typeof transportLabels;

const sampleFolders = [
  { name: "design-system", path: "~/Projects/design-system", files: 14 },
  { name: "taro-skills", path: "~/Documents/taro-skills", files: 3 },
  { name: "skills", path: "~/.taro/skills", files: 7 },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block px-0.5 text-[11px] font-medium tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function PluginsSection({ settings, update }: SectionProps) {
  const plugins = settings.plugins;
  const skills = settings.skills;
  const [query, setQuery] = React.useState("");
  const [addOpen, setAddOpen] = React.useState(false);
  const [addTab, setAddTab] = React.useState<"catalog" | "custom">("catalog");

  /* custom MCP draft */
  const [cName, setCName] = React.useState("");
  const [cTransport, setCTransport] = React.useState<Transport>("stdio");
  const [cCommand, setCCommand] = React.useState("");
  const [cUrl, setCUrl] = React.useState("");
  const [cKey, setCKey] = React.useState("");
  const [mcpError,setMcpError]=React.useState("");

  /* skill folder picker */
  const folderInputRef = React.useRef<HTMLInputElement>(null);
  const [explorerOpen, setExplorerOpen] = React.useState(false);

  const setPlugin = (id: string, value: Partial<Plugin>) =>
    update("plugins", plugins.map((p) => (p.id === id ? { ...p, ...value } : p)));

  const setSkill = (id: string, value: Partial<(typeof skills)[number]>) =>
    update("skills", skills.map((sk) => (sk.id === id ? { ...sk, ...value } : sk)));

  const q = query.trim().toLowerCase();
  const matches = (name: string, desc: string) => !q || name.toLowerCase().includes(q) || desc.toLowerCase().includes(q);

  const mcps = plugins.filter((p) => p.kind === "MCP" && matches(p.name, p.description));
  const integrations = plugins.filter((p) => p.kind === "Integration" && matches(p.name, p.description));
  const allSkills = skills.filter((sk) => matches(sk.label, sk.description ?? ""));

  const installed = (id: string) => plugins.some((p) => p.id === id || (p.name === mcpCatalog.find(c=>c.id===id)?.name && Boolean(p.transport)));
  const isCustom = (id: string) => !mcpCatalog.some((c) => c.id === id);

  const addCatalog = (item: { id: string; name: string; description: string }) => {setCName(item.name);setAddTab("custom");};

  const addCustom = async () => {
    if (!cName.trim() || (cTransport==="stdio"?!cCommand.trim():!cUrl.trim())) return;
    const id=newId("mcp");
    if(cKey.trim() && isTauri()) {try{await invoke("store_model_key",{modelId:`mcp:${id}`,secret:cKey.trim()});}catch(error){setMcpError(String(error));return;}}
    setMcpError("");
    const parts=cCommand.trim().split(/\s+/).filter(Boolean);
    update("plugins", [
      ...plugins,
      {
        id,
        name: cName.trim(),
        description: `Custom · ${transportLabels[cTransport]}`,
        kind: "MCP" as const,
        enabled: true,
        status: "connected" as const,
        transport:cTransport,
        command:cTransport==="stdio"?parts[0]:undefined,
        args:cTransport==="stdio"?parts.slice(1):undefined,
        url:cTransport!=="stdio"?cUrl.trim():undefined,
      },
    ]);
    setCName("");
    setCCommand("");
    setCUrl("");
    setCKey("");
    setAddOpen(false);
  };

  const addSkill = (label: string, path: string, description: string) => {
    if (skills.some((sk) => sk.label === label)) return;
    update("skills", [...skills, { id: newId("sk"), label, path, description, source: "custom", enabled: true }]);
    setExplorerOpen(false);
  };

  const pickFolder = () => {
    const input = folderInputRef.current;
    if (input && "webkitdirectory" in input) input.click();
    else setExplorerOpen(true);
  };

  const onFolderPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (list && list.length > 0) {
      const first = list[0] as File & { webkitRelativePath?: string };
      const rel = first.webkitRelativePath || first.name;
      const folder = rel.split("/")[0];
      addSkill(folder, `~/${folder}`, `${list.length} files detected`);
    }
    e.target.value = "";
  };

  /* live mcp.json preview for the custom form */
  const slug = cName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const serverSpec: Record<string, unknown> = {};
  if (cTransport === "stdio") {
    const parts = cCommand.trim().split(/\s+/).filter(Boolean);
    serverSpec.command = parts[0] ?? "npx";
    if (parts.length > 1) serverSpec.args = parts.slice(1);
  } else {
    if (cTransport === "http") serverSpec.type = "streamableHttp";
    if (cUrl.trim()) serverSpec.url = cUrl.trim();
  }
  if (cKey.trim()) serverSpec.headers = { Authorization: `Bearer ${cKey.trim()}` };
  const mcpJson = JSON.stringify({ mcpServers: { [slug || "my-server"]: serverSpec } }, null, 2);

  const pluginRow = (plugin: Plugin, removable: boolean) => {
    const Icon = pluginIcons[plugin.id] ?? Plug;
    return (
      <div key={plugin.id} className="group flex items-center gap-3 px-4 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground/80">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-foreground">{plugin.name}</span>
            {plugin.kind === "MCP" && isCustom(plugin.id) && <Badge variant="taro">custom</Badge>}
          </div>
          <p className="truncate text-xs text-muted-foreground">{plugin.description}</p>
        </div>
        {plugin.enabled && plugin.status === "needs-auth" ? (
          <Button variant="secondary" size="sm" onClick={() => setPlugin(plugin.id, { status: "connected" })}>
            Connect
          </Button>
        ) : (
          <StatusDot tone={plugin.enabled && plugin.transport ? "success" : "muted"}>{plugin.enabled ? (plugin.transport ? "Configured" : "Needs setup") : "Off"}</StatusDot>
        )}
        {removable && (
          <button
            type="button"
            aria-label={`Remove ${plugin.name}`}
            onClick={() => {if(isTauri())void invoke("delete_model_key",{modelId:`mcp:${plugin.id}`}).catch(console.error);update("plugins", plugins.filter((p) => p.id !== plugin.id));}}
            className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
        <Switch
          aria-label={`Enable ${plugin.name}`}
          checked={plugin.enabled}
          onCheckedChange={(enabled) =>
            setPlugin(plugin.id, {
              enabled,
              status: enabled ? (plugin.id === "github" ? "needs-auth" : "connected") : "off",
            })
          }
        />
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <SettingsGroup title="Coding workspace" description="File tools stay inside this folder. Bash and MCP require approval before they run.">
        <SettingsRow label="Workspace folder" description={settings.workspaceRoot || "Choose the folder the agent may work in."}>
          <Button size="sm" variant="secondary" onClick={async()=>{const selected=await openDirectory({directory:true,multiple:false});if(typeof selected==="string")update("workspaceRoot",selected);}}>Choose folder</Button>
        </SettingsRow>
      </SettingsGroup>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search plugins"
          aria-label="Search plugins"
          className="pl-8"
        />
      </div>

      {/* Native folder picker — opens the OS file explorer on desktop */}
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        multiple
        {...({ webkitdirectory: "true" } as Record<string, string>)}
        onChange={onFolderPicked}
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* ---- MCPs ---- */}
      <SettingsGroup
        title="MCPs"
        description="Tools agents can call to read, write and act."
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setAddOpen((o) => !o);
              setAddTab("catalog");
            }}
            aria-expanded={addOpen}
          >
            <Plus />
            Add MCP server
          </Button>
        }
      >
        {mcps.length === 0 && (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">No MCP servers match.</p>
        )}
        {mcps.map((plugin) => pluginRow(plugin, isCustom(plugin.id)))}
      </SettingsGroup>

      {addOpen && (
        <div className="animate-pop rounded-xl border border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <Segmented
              ariaLabel="Add MCP server"
              value={addTab}
              onValueChange={setAddTab}
              options={[
                { value: "catalog", label: "Catalog" },
                { value: "custom", label: "Custom (mcp.json)" },
              ]}
            />
            <button
              type="button"
              aria-label="Close"
              onClick={() => setAddOpen(false)}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {addTab === "catalog" ? (
            <div className="grid grid-cols-2 gap-2">
              {mcpCatalog.map((item) => {
                const isInstalled = installed(item.id);
                const Icon = pluginIcons[item.id] ?? Plug;
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5"
                  >
                    <Icon className="size-4 shrink-0 text-foreground/80" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-foreground">{item.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{item.description}</p>
                    </div>
                    {isInstalled ? (
                      <span className="flex shrink-0 items-center gap-1 text-[11px] text-success">
                        <Check className="size-3" />
                        Added
                      </span>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => addCatalog(item)}>
                        Add
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-[250px_1fr] gap-5">
              <div className="space-y-3">
                <Field label="Name">
                  <Input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="e.g. Notion" />
                </Field>
                <Field label="Transport">
                  <Segmented
                    ariaLabel="Transport"
                    value={cTransport}
                    onValueChange={setCTransport}
                    options={[
                      { value: "stdio", label: "stdio" },
                      { value: "http", label: "Streamable HTTP" },
                    ]}
                  />
                </Field>
                {cTransport === "stdio" ? (
                  <Field label="Command">
                    <Input
                      value={cCommand}
                      onChange={(e) => setCCommand(e.target.value)}
                      placeholder="npx @my/mcp-server"
                      className="font-mono text-xs"
                    />
                  </Field>
                ) : (
                  <Field label="URL">
                    <Input
                      value={cUrl}
                      onChange={(e) => setCUrl(e.target.value)}
                      placeholder="https://mcp.example.com/mcp"
                      className="font-mono text-xs"
                    />
                  </Field>
                )}
                <Field label="API key (if available)">
                  <Input
                    type="password"
                    value={cKey}
                    onChange={(e) => setCKey(e.target.value)}
                    placeholder="ntok_…"
                    className="font-mono text-xs"
                  />
                </Field>
                <Button size="sm" onClick={addCustom} disabled={!cName.trim() || (cTransport==="stdio"?!cCommand.trim():!cUrl.trim())} className="w-full">
                  Add MCP server
                </Button>
                {mcpError && <p role="alert" className="text-xs text-red-400">{mcpError}</p>}
              </div>
              <div className="min-w-0">
                <p className="mb-1.5 px-0.5 text-[11px] tracking-wide text-muted-foreground">mcp.json</p>
                <pre className="scrollbar-thin max-h-56 overflow-auto rounded-lg border border-border bg-[#060606] px-3 py-2.5 font-mono text-[11px] leading-5 whitespace-pre text-foreground/70">
                  {mcpJson}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- Skills ---- */}
      <SettingsGroup
        title="Skills"
        description="Reusable commands invoked with / in chat."
        action={
          <Button variant="secondary" size="sm" onClick={pickFolder}>
            <Plus />
            Add skill
          </Button>
        }
      >
        {allSkills.length === 0 && (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">No skills match.</p>
        )}
        {allSkills.map((skill) => (
          <div key={skill.id} className="group flex items-center gap-3 px-4 py-2.5">
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background",
                skill.source === "custom" ? "text-taro" : "text-foreground/80"
              )}
            >
              {skill.source === "custom" ? <Folder className="size-4" /> : <Layers className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-mono text-[13px] text-foreground">/{skill.label}</span>
                {skill.source === "custom" && skill.path && (
                  <Badge variant="default" className="max-w-[140px] truncate">
                    {skill.path}
                  </Badge>
                )}
              </div>
              {skill.description && <p className="truncate text-xs text-muted-foreground">{skill.description}</p>}
            </div>
            {skill.source === "custom" && (
              <button
                type="button"
                aria-label={`Remove ${skill.label}`}
                onClick={() => update("skills", skills.filter((sk) => sk.id !== skill.id))}
                className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
            <Switch
              aria-label={`Enable /${skill.label}`}
              checked={skill.enabled}
              onCheckedChange={(enabled) => setSkill(skill.id, { enabled })}
            />
          </div>
        ))}
      </SettingsGroup>

      {/* ---- Integrations ---- */}
      <SettingsGroup title="Integrations" description="One-way syncs and embeds.">
        {integrations.length === 0 && (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">No integrations match.</p>
        )}
        {integrations.map((plugin) => pluginRow(plugin, true))}
      </SettingsGroup>

      {/* ---- Folder picker fallback (browsers without native dir picker) ---- */}
      <Dialog open={explorerOpen} onOpenChange={setExplorerOpen} labelledBy="folder-dialog-title" className="w-[440px]">
        <div className="p-5">
          <h3 id="folder-dialog-title" className="text-sm font-medium text-foreground">
            Choose a skills folder
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">Taro reads any SKILL.md or prompt files it contains.</p>
          <div className="mt-4 space-y-1">
            {sampleFolders.map((f) => (
              <button
                key={f.path}
                type="button"
                onClick={() => addSkill(f.name, f.path, `${f.files} files`)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent"
              >
                <Folder className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{f.path}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{f.files} files</span>
              </button>
            ))}
          </div>
        </div>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------
 * Rules
 * ------------------------------------------------------------------ */

const scopeVariant: Record<Rule["scope"], "taro" | "default" | "subtle"> = {
  Always: "taro",
  Design: "default",
  Code: "subtle",
};

export function RulesSection({ settings, update }: SectionProps) {
  const rules = settings.rules;
  const [draft, setDraft] = React.useState("");
  const [scope, setScope] = React.useState<Rule["scope"]>("Always");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");
  const editorRef = React.useRef<HTMLTextAreaElement>(null);
  const compiled = compileWorkspaceRules(rules);
  const hasWorkspace = Boolean(settings.workspaceRoot?.trim());

  const resetDraft = () => {
    setDraft("");
    setEditingId(null);
    setError("");
  };
  React.useEffect(() => {
    resetDraft();
  }, [settings.workspaceRoot]);

  const saveRule = () => {
    if (!draft.trim()) return;
    if (draft.trim().length > MAX_WORKSPACE_RULE_CHARS) {
      setError(`Shorten this rule to ${MAX_WORKSPACE_RULE_CHARS} characters.`);
      return;
    }
    const next = editingId
      ? rules.map((rule) => rule.id === editingId ? { ...rule, text: draft.trim(), scope } : rule)
      : [...rules, { id: newId("r"), text: draft.trim(), scope, enabled: true }];
    const issues = editingId ? compileWorkspaceRules(next).issues : validateWorkspaceRuleChange(next);
    // Allow an old oversized configuration to be repaired one rule at a time.
    const repairsLegacy = editingId && !compiled.valid && compileWorkspaceRules(next).charCount < compiled.charCount;
    if (issues.length && !repairsLegacy) {
      setError(issues.join(" "));
      return;
    }
    update("rules", next);
    resetDraft();
  };

  const toggleRule = (id: string, enabled: boolean) => {
    const next = rules.map((rule) => rule.id === id ? { ...rule, enabled } : rule);
    const result = compileWorkspaceRules(next);
    if (enabled && !result.valid) {
      setError(result.issues.join(" "));
      return;
    }
    setError("");
    update("rules", next);
  };

  return (
    <div className="space-y-6">
      {hasWorkspace&&<p title={settings.workspaceRoot} className="truncate text-xs text-muted-foreground">{settings.workspaceRoot}</p>}
      <div className="rounded-xl border border-border bg-card p-3 focus-within:border-taro/40">
        <textarea
          ref={editorRef}
          rows={2}
          value={draft}
          maxLength={MAX_WORKSPACE_RULE_CHARS}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              saveRule();
            }
          }}
          placeholder="Add a rule, e.g. “Buttons use the ember accent only for primary actions.”"
          aria-label={editingId ? "Edit rule" : "New rule"}
          aria-describedby="workspace-rule-limit"
          className="w-full resize-none bg-transparent px-1 text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Segmented<Rule["scope"]>
            ariaLabel="Rule category"
            value={scope}
            onValueChange={setScope}
            options={[
              { value: "Always", label: "Always" },
              { value: "Design", label: "Design" },
              { value: "Code", label: "Code" },
            ]}
          />
          <span id="workspace-rule-limit" className="ml-auto text-[11px] tabular-nums text-muted-foreground">{draft.length}/{MAX_WORKSPACE_RULE_CHARS}</span>
          {editingId && <Button variant="ghost" size="sm" onClick={resetDraft}>Cancel</Button>}
          <Button size="sm" onClick={saveRule} disabled={!draft.trim() || (!editingId && rules.length >= MAX_WORKSPACE_RULES)}>
            {editingId ? "Save rule" : "Add rule"}
          </Button>
        </div>
      </div>
      {(error || !compiled.valid) && (
        <p role="alert" className="text-xs leading-relaxed text-destructive">
          {error || `Shorten or disable the affected rules before starting a task. ${compiled.issues.join(" ")}`}
        </p>
      )}

      <SettingsGroup
        title="Workspace rules"
        description={`${compiled.enabledCount} of ${rules.length} active · ${compiled.charCount.toLocaleString("en-US")}/${MAX_WORKSPACE_RULES_PROMPT_CHARS.toLocaleString("en-US")} context characters · applies to every agent`}
      >
        {rules.length === 0 && (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">No rules yet.</p>
        )}
        {rules.map((rule) => (
          <div key={rule.id} className="group flex flex-wrap items-start gap-3 px-4 py-3 sm:flex-nowrap">
            <Badge variant={scopeVariant[rule.scope]} className="mt-0.5 w-[52px] justify-center">
              {rule.scope}
            </Badge>
            <p
              className={cn(
                "order-last min-w-0 flex-1 basis-full whitespace-pre-wrap break-words text-[13px] leading-relaxed sm:order-none sm:basis-auto",
                rule.enabled ? "text-foreground" : "text-muted-foreground line-through decoration-white/20"
              )}
            >
              {rule.text}
            </p>
            <button
              type="button"
              aria-label={`Edit ${rule.scope.toLowerCase()} rule`}
              onClick={() => {
                setEditingId(rule.id);
                setDraft(rule.text);
                setScope(rule.scope);
                setError("");
                editorRef.current?.focus();
              }}
              className="mt-0.5 ml-auto rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-taro/30 disabled:opacity-40 sm:ml-0"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Delete rule"
              onClick={() => {
                update("rules", rules.filter((r) => r.id !== rule.id));
                if (editingId === rule.id) resetDraft();
                else setError("");
              }}
              className="mt-0.5 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
            <Switch
              aria-label="Enable rule"
              checked={rule.enabled}
              onCheckedChange={(enabled) => toggleRule(rule.id, enabled)}
            />
          </div>
        ))}
      </SettingsGroup>
    </div>
  );
}

/* ------------------------------------------------------------------
 * Models
 * ------------------------------------------------------------------ */

export function ModelsSection({ settings, update }: SectionProps) {
  const models = settings.models;
  const patch = (value: Partial<typeof models>) => update("models", { ...models, ...value });

  const [adding, setAdding] = React.useState(false);
  const [draftName, setDraftName] = React.useState("");
  const [draftEndpoint, setDraftEndpoint] = React.useState("");
  const [draftKey, setDraftKey] = React.useState("");

  const customCount = models.customModels.length;
  const atLimit = customCount >= MAX_CUSTOM_MODELS;
  const options = modelOptions(models.customModels);

  const [modelError,setModelError]=React.useState("");
  const addCustomModel = async () => {
    if (!draftName.trim() || !draftEndpoint.trim() || atLimit) return;
    const slug = draftName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "custom";
    const id=`custom-${slug}-${Date.now().toString(36)}`;
    if(draftKey.trim() && isTauri()) {
      try { await invoke("store_model_key",{modelId:id,secret:draftKey.trim()}); } catch(e) { setModelError(String(e)); return; }
    }
    setModelError("");
    patch({
      defaultModel:id,
      customModels: [
        ...models.customModels,
        {
          id,
          label: draftName.trim(),
          endpoint: draftEndpoint.trim(),
        },
      ],
    });
    setDraftName("");
    setDraftEndpoint("");
    setDraftKey("");
    setAdding(false);
  };

  const removeCustomModel = (id: string) => {
    const removed = models.customModels.find((m) => m.id === id);
    if (!removed) return;
    if(isTauri()) void invoke("delete_model_key",{modelId:id}).catch(console.error);
    patch({
      customModels: models.customModels.filter((m) => m.id !== id),
      defaultModel: models.defaultModel === id ? options[0].value : models.defaultModel,
      reviewModel: models.reviewModel === id ? options[0].value : models.reviewModel,
    });
  };

  return (
    <div className="space-y-8">
      <SettingsGroup title="Model catalog" description="Chat and review pickers use the built-in catalog plus your custom endpoint models.">
        <SettingsRow label="Chat model" description="Used for new threads and design work.">
          <DropdownMenu
            align="end"
            ariaLabel="Chat model"
            value={models.defaultModel}
            options={options}
            onValueChange={(defaultModel) => patch({ defaultModel })}
            triggerClassName="w-52"
          />
        </SettingsRow>
        <SettingsRow label="Review model" description="Runs visual QA and annotation passes.">
          <DropdownMenu
            align="end"
            ariaLabel="Review model"
            value={models.reviewModel}
            options={options}
            onValueChange={(reviewModel) => patch({ reviewModel })}
            triggerClassName="w-52"
          />
        </SettingsRow>
        <SettingsRow
          label="Custom models"
          description={`OpenAI-compatible endpoints · ${customCount} of ${MAX_CUSTOM_MODELS} slots used.`}
        >
          <Button
            variant="secondary"
            size="sm"
            disabled={atLimit}
            title={atLimit ? "Two custom models max on this plan — more requires Lite+" : undefined}
            onClick={() => setAdding((a) => !a)}
            aria-expanded={adding}
          >
            <Plus />
            Add provider
          </Button>
        </SettingsRow>

        {adding && (
          <div className="space-y-3 px-4 pb-4">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Point at any OpenAI-compatible endpoint. It appears in the chat and review pickers immediately.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <label className="mb-1 block px-0.5 text-[11px] font-medium text-muted-foreground" htmlFor="cm-name">Model name</label>
                <Input id="cm-name" value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="e.g. Llama 4.1" className="h-7 text-xs" />
              </div>
              <div>
                <label className="mb-1 block px-0.5 text-[11px] font-medium text-muted-foreground" htmlFor="cm-endpoint">Base URL (OpenAI-compatible)</label>
                <Input
                  id="cm-endpoint"
                  value={draftEndpoint}
                  onChange={(e) => setDraftEndpoint(e.target.value)}
                  placeholder="https://api.myprovider.com/v1"
                  className="h-7 font-mono text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block px-0.5 text-[11px] font-medium text-muted-foreground" htmlFor="cm-key">API key</label>
                <Input
                  id="cm-key"
                  type="password"
                  value={draftKey}
                  onChange={(e) => setDraftKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCustomModel()}
                  placeholder="sk-…"
                  className="h-7 font-mono text-xs"
                />
              </div>
            </div>
            {modelError && <p role="alert" className="text-xs text-red-400">{modelError}</p>}
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={addCustomModel} disabled={!draftName.trim() || !draftEndpoint.trim()}>
                Save model
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              {atLimit && (
                <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Crown className="size-3" /> Lite+ for more
                </span>
              )}
            </div>
          </div>
        )}

        {models.customModels.length > 0 && (
          <div>
            {models.customModels.map((model) => (
              <div key={model.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                    <Plug className="size-3 text-muted-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-foreground">{model.label}</span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">{model.endpoint}</span>
                  </span>
                  <Badge variant="taro">custom</Badge>
                  <button
                    type="button"
                    aria-label={`Remove ${model.label}`}
                    onClick={() => removeCustomModel(model.id)}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2 pl-9">
                  <KeyRound className="size-3.5 shrink-0 text-muted-foreground" />
                  <label className="sr-only" htmlFor={`cm-key-${model.id}`}>{model.label} API key</label>
                  <Input
                    id={`cm-key-${model.id}`}
                    type="password"
                    value={model.apiKey ?? ""}
                    onChange={(e) =>
                      patch({
                        customModels: models.customModels.map((m) =>
                          m.id === model.id ? { ...m, apiKey: e.target.value || undefined } : m
                        ),
                      })
                    }
                    placeholder="API key — sk-…"
                    className="h-7 flex-1 font-mono text-xs"
                  />
                  <span className={cn("shrink-0 text-[11px]", model.apiKey ? "text-success" : "text-muted-foreground")}>
                    {model.apiKey ? "Key saved" : "No key"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsGroup>

      <SettingsGroup
        title="Thinking effort"
        description={`Low through High are always available. Max unlocks with Lite+. Syncs with the chat bar.`}
      >
        <SettingsRow label="Default effort">
          <Segmented
            ariaLabel="Thinking effort"
            value={String(models.effort)}
            onValueChange={(v) => patch({ effort: Number(v) })}
            options={effortLevels.map((level, i) => ({
              value: String(i),
              label: level.label,
              icon: level.pro ? <Crown /> : undefined,
              disabled: Boolean(level.pro),
              disabledHint: level.pro ? "Max requires Lite+" : undefined,
            }))}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup>
        <div className="flex items-center gap-2 px-4 pt-3.5">
          <h3 className="text-[13px] font-medium text-foreground">Providers</h3>
          <Badge variant="taro"><Crown className="size-3" />Lite+ and above</Badge>
        </div>
        <p className="px-4 pt-1 text-xs text-muted-foreground">
          Add Anthropic, OpenAI, Google or local providers on the Lite+ plan or higher. Your plan includes two
          custom OpenAI-compatible models above.
        </p>
        <div className="pointer-events-none mt-2 select-none opacity-45" aria-disabled="true">
          {models.providers.map((provider) => (
            <SettingsRow
              key={provider.id}
              label={
                <span className="flex items-center gap-2.5">
                  <KeyRound className="size-3.5 text-muted-foreground" />
                  {provider.name}
                </span>
              }
              description={
                <span className="pl-6 font-mono text-[11px]">{provider.connected ? provider.keyHint : "Not connected"}</span>
              }
            >
              {provider.connected && <StatusDot tone="success">Connected</StatusDot>}
              <Button variant={provider.connected ? "ghost" : "secondary"} size="sm">
                {provider.connected ? "Disconnect" : "Add key"}
              </Button>
            </SettingsRow>
          ))}
        </div>
      </SettingsGroup>

      <SettingsGroup title="Streaming">
        <SettingsRow label="Stream responses" description="Reveal replies word by word. Turn off to show the completed reply at once.">
          <Switch
            aria-label="Stream responses"
            checked={models.streamResponses}
            onCheckedChange={(streamResponses) => patch({ streamResponses })}
          />
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
}

/* ------------------------------------------------------------------
 * Agents
 * ------------------------------------------------------------------ */

const agentTone: Record<string, "taro" | "ocean" | "neutral"> = { aria: "taro", theo: "ocean", rin: "neutral" };

export function AgentsSection({ settings, update }: SectionProps) {
  const setAgent = (id: string, value: Partial<AgentConfig>) =>
    update(
      "agents",
      settings.agents.map((a) => (a.id === id ? { ...a, ...value } : a))
    );

  return (
    <div className="space-y-3">
      {settings.agents.map((agent) => (
        <div
          key={agent.id}
          className={cn(
            "rounded-xl border border-border bg-card transition-opacity",
            !agent.enabled && "opacity-60"
          )}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <Avatar initials={agent.name.slice(0, 2)} tone={agentTone[agent.id] ?? "neutral"} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-foreground">{agent.name}</span>
                {agent.canWriteCode && <Badge variant="default">code</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{agent.role}</p>
            </div>
            <Switch
              aria-label={`Enable ${agent.name}`}
              checked={agent.enabled}
              onCheckedChange={(enabled) => setAgent(agent.id, { enabled })}
            />
          </div>
          <div className="divide-y divide-border border-t border-border">
            <SettingsRow label="Model">
              <DropdownMenu
                align="end"
                ariaLabel={`${agent.name} model`}
                value={agent.model}
                options={modelOptions(settings.models.customModels)}
                onValueChange={(model) => setAgent(agent.id, { model })}
                triggerClassName="w-44"
              />
            </SettingsRow>
            <SettingsRow label="Autonomy" description="Ask first, suggest changes, or apply automatically.">
              <Segmented
                ariaLabel={`${agent.name} autonomy`}
                value={agent.autonomy}
                onValueChange={(autonomy) => setAgent(agent.id, { autonomy })}
                options={[
                  { value: "ask", label: "Ask" },
                  { value: "suggest", label: "Suggest" },
                  { value: "auto", label: "Auto" },
                ]}
              />
            </SettingsRow>
            <SettingsRow label="Can write code" description="Only after a design is approved.">
              <Switch
                aria-label={`${agent.name} can write code`}
                checked={agent.canWriteCode}
                onCheckedChange={(canWriteCode) => setAgent(agent.id, { canWriteCode })}
              />
            </SettingsRow>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------
 * Source Control
 * ------------------------------------------------------------------ */

export function SourceControlSection({ settings, update }: SectionProps) {
  const sc = settings.sourceControl;
  const account = settings.account;
  const patch = (value: Partial<typeof sc>) => update("sourceControl", { ...sc, ...value });
  const [authing, setAuthing] = React.useState(false);

  const signIn = () => {
    setAuthing(true);
    window.setTimeout(() => {
      setAuthing(false);
      update("sourceControl", {
        ...sc,
        signedIn: true,
        provider: "github",
        repo: sc.repos[0] ?? sc.repo,
        defaultBranch: sc.branches[0] ?? sc.defaultBranch,
      });
    }, 1000);
  };

  const exampleBranch = `${sc.branchPrefix}hero-variant-b`;

  return (
    <div className="space-y-8">
      <SettingsGroup title="Account">
        <SettingsRow label="GitHub" description="Connect GitHub to pick repositories and branches.">
          {sc.signedIn ? (
            <>
              <span className="inline-flex h-7 items-center gap-2 rounded-full border border-border bg-background px-3 text-xs text-foreground">
                <GitHubMark className="size-3.5" />
                {account.handle || "account"}
              </span>
              <Button variant="ghost" size="sm" onClick={() => patch({ signedIn: false })}>
                Sign out
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={signIn}
              disabled={authing}
              className="rounded-full px-3"
            >
              <GitHubMark className="size-3.5" />
              {authing ? "Redirecting…" : "Sign in to GitHub"}
            </Button>
          )}
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Repository">
        <SettingsRow label="Provider">
          <Segmented
            ariaLabel="Provider"
            value={sc.provider}
            onValueChange={(provider) => patch({ provider })}
            options={[
              { value: "github", label: "GitHub" },
              { value: "gitlab", label: "GitLab" },
              { value: "bitbucket", label: "Bitbucket" },
            ]}
          />
        </SettingsRow>
        <SettingsRow
          label="Repository"
          description={sc.signedIn ? undefined : "Sign in to GitHub to choose a repository."}
        >
          {sc.signedIn ? (
            <DropdownMenu
              align="end"
              ariaLabel="Repository"
              value={sc.repo}
              options={sc.repos.map((r) => ({ value: r, label: r }))}
              onValueChange={(repo) => patch({ repo })}
              triggerClassName="w-56"
            />
          ) : (
            <Input disabled value={sc.repo} aria-label="Repository" className="w-56 font-mono text-xs" />
          )}
        </SettingsRow>
        <SettingsRow
          label="Default branch"
          description={sc.signedIn ? undefined : "Sign in to GitHub to choose a branch."}
        >
          {sc.signedIn ? (
            <DropdownMenu
              align="end"
              ariaLabel="Default branch"
              value={sc.defaultBranch}
              options={sc.branches.map((b) => ({ value: b, label: b }))}
              onValueChange={(defaultBranch) => patch({ defaultBranch })}
              triggerClassName="w-56"
            />
          ) : (
            <Input disabled value={sc.defaultBranch} aria-label="Default branch" className="w-56 font-mono text-xs" />
          )}
        </SettingsRow>
        <SettingsRow
          label="Branch prefix"
          htmlFor="sc-prefix"
          description={
            <span>
              Agents branch as <span className="font-mono text-foreground/80">{exampleBranch}</span>
            </span>
          }
        >
          <Input
            id="sc-prefix"
            value={sc.branchPrefix}
            onChange={(e) => patch({ branchPrefix: e.target.value.replace(/\s/g, "") })}
            className="w-60 font-mono text-xs"
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Commits">
        <SettingsRow
          label="Require design approval"
          description="Agents can only commit code for designs you've approved."
        >
          <Switch
            aria-label="Require design approval"
            checked={sc.requireApproval}
            onCheckedChange={(requireApproval) => patch({ requireApproval })}
          />
        </SettingsRow>
        <SettingsRow label="Auto-commit" description="Commit approved changes without asking.">
          <Switch aria-label="Auto-commit" checked={sc.autoCommit} onCheckedChange={(autoCommit) => patch({ autoCommit })} />
        </SettingsRow>
        <SettingsRow label="Sign commits" description="Sign with your SSH key.">
          <Switch aria-label="Sign commits" checked={sc.signCommits} onCheckedChange={(signCommits) => patch({ signCommits })} />
        </SettingsRow>
        <SettingsRow
          label="Message style"
          description={
            <span className="font-mono text-[11px]">
              {sc.commitStyle === "conventional" ? "feat(hero): add variant B layout" : "Add variant B layout to the hero"}
            </span>
          }
        >
          <Segmented
            ariaLabel="Commit message style"
            value={sc.commitStyle}
            onValueChange={(commitStyle) => patch({ commitStyle })}
            options={[
              { value: "conventional", label: "Conventional" },
              { value: "descriptive", label: "Descriptive" },
            ]}
          />
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
}

/* ------------------------------------------------------------------
 * Browser
 * ------------------------------------------------------------------ */

export function BrowserSection({ settings, update }: SectionProps) {
  const browser = settings.browser;
  const patch = (value: Partial<typeof browser>) => update("browser", { ...browser, ...value });
  const [cleared, setCleared] = React.useState(false);

  React.useEffect(() => {
    if (!cleared) return;
    const t = window.setTimeout(() => setCleared(false), 1600);
    return () => window.clearTimeout(t);
  }, [cleared]);

  return (
    <div className="space-y-8">
      <SettingsGroup title="Live preview">
        <SettingsRow label="Engine">
          <DropdownMenu
            align="end"
            ariaLabel="Browser engine"
            value={browser.engine}
            onValueChange={(engine) => patch({ engine })}
            options={[
              { value: "chromium", label: "Chromium" },
              { value: "webkit", label: "WebKit" },
              { value: "firefox", label: "Firefox" },
            ]}
            triggerClassName="w-40"
          />
        </SettingsRow>
        <SettingsRow label="Default viewport">
          <Segmented
            ariaLabel="Default viewport"
            value={browser.viewport}
            onValueChange={(viewport) => patch({ viewport })}
            options={[
              { value: "desktop", label: "Desktop", icon: <Monitor /> },
              { value: "tablet", label: "Tablet", icon: <Laptop /> },
              { value: "mobile", label: "Mobile", icon: <Smartphone /> },
            ]}
          />
        </SettingsRow>
        <SettingsRow label="Dev server URL" htmlFor="br-url">
          <Input
            id="br-url"
            value={browser.devUrl}
            onChange={(e) => patch({ devUrl: e.target.value })}
            className="w-60 font-mono text-xs"
          />
        </SettingsRow>
        <SettingsRow label="Hot reload" description="Refresh the preview when files change.">
          <Switch aria-label="Hot reload" checked={browser.hotReload} onCheckedChange={(hotReload) => patch({ hotReload })} />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Visual QA">
        <SettingsRow label="Run on save" description="Check contrast, spacing and layout shifts after each change.">
          <Switch
            aria-label="Run visual QA on save"
            checked={browser.visualQaOnSave}
            onCheckedChange={(visualQaOnSave) => patch({ visualQaOnSave })}
          />
        </SettingsRow>
        <SettingsRow label="Capture screenshots" description="Attach before/after shots to tasks.">
          <Switch
            aria-label="Capture screenshots"
            checked={browser.captureScreenshots}
            onCheckedChange={(captureScreenshots) => patch({ captureScreenshots })}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Privacy">
        <SettingsRow label="Block trackers" description="Strip analytics scripts from previews.">
          <Switch
            aria-label="Block trackers"
            checked={browser.blockTrackers}
            onCheckedChange={(blockTrackers) => patch({ blockTrackers })}
          />
        </SettingsRow>
        <SettingsRow label="Cache & cookies" description="Clear stored data for all previews.">
          <Button variant="secondary" size="sm" onClick={() => setCleared(true)} disabled={cleared}>
            <RefreshCw className={cn(cleared && "animate-spin")} />
            {cleared ? "Cleared" : "Clear data"}
          </Button>
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
}
