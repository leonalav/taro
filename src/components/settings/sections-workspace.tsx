import * as React from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open as openDirectory } from "@tauri-apps/plugin-dialog";
import {
  Check,
  Frame,
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
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { SettingsGroup, SettingsRow, StatusDot } from "@/components/settings/primitives";
import type { SectionProps } from "@/components/settings/sections-personal";
import { modelOptions, type AgentConfig, type Plugin, type Rule } from "@/data/settings";
import { compileWorkspaceRules, MAX_WORKSPACE_RULES, MAX_WORKSPACE_RULE_CHARS, MAX_WORKSPACE_RULES_PROMPT_CHARS, validateWorkspaceRuleChange } from "@/lib/workspace-rules";
import { cn } from "@/utils/cn";
import {SkillsSettings} from '@/components/skills-settings';
import {listMcpTools} from '@/lib/agent-tools';
import {mcpConnectionError,parseMcpArguments} from '@/lib/mcp-settings';

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
  const [query, setQuery] = React.useState("");
  const [addOpen, setAddOpen] = React.useState(false);
  const [addTab, setAddTab] = React.useState<"catalog" | "custom">("catalog");

  /* custom MCP draft */
  const [cName, setCName] = React.useState("");
  const [cTransport, setCTransport] = React.useState<Transport>("stdio");
  const [cCommand, setCCommand] = React.useState("");
  const [cArgs, setCArgs] = React.useState("[]");
  const [cUrl, setCUrl] = React.useState("");
  const [cKey, setCKey] = React.useState("");
  const [mcpError,setMcpError]=React.useState("");
  const [adding,setAdding]=React.useState(false);
  type Connection={signature:string;state:'testing'|'connected'|'failed';count?:number;error?:string};
  const [connections,setConnections]=React.useState<Record<string,Connection>>({});
  const latest=React.useRef(settings);latest.current=settings;
  const mounted=React.useRef(true);
  React.useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const signature=(plugin:Plugin,root=latest.current.workspaceRoot)=>JSON.stringify([root,plugin.transport,plugin.command,plugin.args,plugin.url,plugin.enabled]);

  const setPlugin = (id: string, value: Partial<Plugin>) =>
    update("plugins", latest.current.plugins.map((p) => (p.id === id ? { ...p, ...value } : p)));
  const testConnection=async(plugin:Plugin)=>{
    const workspaceRoot=latest.current.workspaceRoot?.trim();
    const checked=signature(plugin);
    if(!workspaceRoot){setConnections(current=>({...current,[plugin.id]:{signature:checked,state:'failed',error:'Choose a workspace folder before testing this server.'}}));return;}
    setConnections(current=>({...current,[plugin.id]:{signature:checked,state:'testing'}}));
    try{
      const result=await listMcpTools(plugin,workspaceRoot);
      if(!result||!Array.isArray(result.tools))throw Error('Invalid MCP tools response');
      const current=latest.current.plugins.find(candidate=>candidate.id===plugin.id);
      if(!mounted.current||!current||signature(current)!==checked)return;
      setConnections(current=>({...current,[plugin.id]:{signature:checked,state:'connected',count:result.tools.length}}));
      setPlugin(plugin.id,{status:'connected'});
    }catch(error){
      const current=latest.current.plugins.find(candidate=>candidate.id===plugin.id);
      if(!mounted.current||!current||signature(current)!==checked)return;
      setConnections(current=>({...current,[plugin.id]:{signature:checked,state:'failed',error:mcpConnectionError(error)}}));
      setPlugin(plugin.id,{status:/\bHTTP\s+(401|403)\b/i.test(String(error))?'needs-auth':'off'});
    }
  };

  const q = query.trim().toLowerCase();
  const matches = (name: string, desc: string) => !q || name.toLowerCase().includes(q) || desc.toLowerCase().includes(q);

  const mcps = plugins.filter((p) => p.kind === "MCP" && matches(p.name, p.description));
  const integrations = plugins.filter((p) => p.kind === "Integration" && matches(p.name, p.description));

  const installed = (id: string) => plugins.some((p) => p.id === id || (p.name === mcpCatalog.find(c=>c.id===id)?.name && Boolean(p.transport)));
  const isCustom = (id: string) => !mcpCatalog.some((c) => c.id === id);

  const addCatalog = (item: { id: string; name: string; description: string }) => {setCName(item.name);setAddTab("custom");};

  const addCustom = async () => {
    if (adding || !cName.trim() || (cTransport==="stdio"?!cCommand.trim():!cUrl.trim())) return;
    let args:string[]=[];
    try{
      if(cTransport==='stdio')args=parseMcpArguments(cArgs);
      else{
        const url=new URL(cUrl.trim());
        if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Use an HTTP or HTTPS MCP URL without embedded credentials.');
      }
      if(cKey.trim()&&!isTauri())throw Error('Open the desktop app to save API keys in the operating-system credential store.');
    }catch(error){setMcpError(error instanceof Error?error.message:'Check the server configuration.');return;}
    const id=newId("mcp");
    setAdding(true);
    if(cKey.trim()) {try{await invoke("store_model_key",{modelId:`mcp:${id}`,secret:cKey.trim()});}catch{setMcpError('Could not save the API key in the operating-system credential store.');setAdding(false);return;}}
    setMcpError("");
    update("plugins", [
      ...latest.current.plugins,
      {
        id,
        name: cName.trim(),
        description: `Custom · ${transportLabels[cTransport]}`,
        kind: "MCP" as const,
        enabled: true,
        status: "off" as const,
        transport:cTransport,
        command:cTransport==="stdio"?cCommand.trim():undefined,
        args:cTransport==="stdio"?args:undefined,
        url:cTransport!=="stdio"?cUrl.trim():undefined,
      },
    ]);
    setCName("");
    setCCommand("");
    setCArgs("[]");
    setCUrl("");
    setCKey("");
    setAddOpen(false);
    setAdding(false);
  };

  /* live mcp.json preview for the custom form */
  const slug = cName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const serverSpec: Record<string, unknown> = {};
  if (cTransport === "stdio") {
    serverSpec.command = cCommand.trim() || "npx";
    try{serverSpec.args=parseMcpArguments(cArgs);}catch{serverSpec.args="Enter a JSON array of strings";}
  } else {
    if (cTransport === "http") serverSpec.type = "streamableHttp";
    if (cUrl.trim()) serverSpec.url = cUrl.trim();
  }
  if (cKey.trim()) serverSpec.headers = { Authorization: "Bearer [stored in OS credential store]" };
  const mcpJson = JSON.stringify({ mcpServers: { [slug || "my-server"]: serverSpec } }, null, 2);

  const pluginRow = (plugin: Plugin, removable: boolean) => {
    const Icon = pluginIcons[plugin.id] ?? Plug;
    const previous=connections[plugin.id];
    const connection=previous?.signature===signature(plugin)?previous:undefined;
    const configured=plugin.transport==='stdio'?Boolean(plugin.command?.trim()):Boolean(plugin.transport&&plugin.url?.trim());
    return (
      <div key={plugin.id} className="group flex flex-wrap items-center gap-3 px-4 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground/80">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-foreground">{plugin.name}</span>
            {plugin.kind === "MCP" && isCustom(plugin.id) && <Badge variant="taro">custom</Badge>}
          </div>
          <p className="truncate text-xs text-muted-foreground">{plugin.description}</p>
          {connection?.error&&<p role="alert" className="mt-1 text-xs text-destructive">{connection.error}</p>}
        </div>
        <StatusDot tone={plugin.enabled&&connection?.state==='connected'?'success':connection?.state==='failed'?'warning':'muted'}>{!plugin.enabled?'Off':connection?.state==='testing'?'Testing…':connection?.state==='connected'?`Connected · ${connection.count} tool${connection.count===1?'':'s'}`:connection?.state==='failed'?'Connection failed':configured?'Not tested':'Needs setup'}</StatusDot>
        {configured&&<Button variant="secondary" size="sm" aria-label={`Test ${plugin.name} connection`} disabled={!plugin.enabled||connection?.state==='testing'} onClick={()=>void testConnection(plugin)}>{connection?.state==='testing'?'Testing…':'Test connection'}</Button>}
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
              status: "off",
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
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-[250px_1fr]">
              <div className="space-y-3">
                <Field label="Name">
                  <Input aria-label="MCP server name" value={cName} onChange={(e) => setCName(e.target.value)} placeholder="e.g. Notion" disabled={adding} />
                </Field>
                <Field label="Transport">
                  <Segmented
                    ariaLabel="Transport"
                    value={cTransport}
                    onValueChange={value=>{if(!adding){setCTransport(value);setCKey("");}}}
                    options={[
                      { value: "stdio", label: "stdio" },
                      { value: "http", label: "Streamable HTTP" },
                    ]}
                  />
                </Field>
                {cTransport === "stdio" ? (
                  <><Field label="Executable path (no shell quotes)">
                    <Input
                      aria-label="MCP executable path"
                      value={cCommand}
                      onChange={(e) => setCCommand(e.target.value)}
                      placeholder="npx or C:\Program Files\MCP\server.exe"
                      className="font-mono text-xs"
                      disabled={adding}
                    />
                  </Field><Field label="Arguments (JSON array)"><Input aria-label="MCP arguments JSON" value={cArgs} onChange={event=>setCArgs(event.target.value)} placeholder={'["@my/mcp-server", "--folder", "my project"]'} className="font-mono text-xs" disabled={adding}/></Field></>
                ) : (
                  <Field label="URL">
                    <Input
                      aria-label="MCP server URL"
                      value={cUrl}
                      onChange={(e) => setCUrl(e.target.value)}
                      placeholder="https://mcp.example.com/mcp"
                      className="font-mono text-xs"
                      disabled={adding}
                    />
                  </Field>
                )}
                {cTransport==='http'?<Field label="API key (HTTP bearer token)">
                  <Input
                    aria-label="MCP API key"
                    type="password"
                    value={cKey}
                    onChange={(e) => setCKey(e.target.value)}
                    placeholder="ntok_…"
                    className="font-mono text-xs"
                    autoComplete="new-password"
                    disabled={adding}
                  />
                </Field>:<p className="text-xs text-muted-foreground">Stdio servers inherit your environment. Keep secrets in environment variables rather than command arguments.</p>}
                <Button size="sm" onClick={addCustom} disabled={adding || !cName.trim() || (cTransport==="stdio"?!cCommand.trim():!cUrl.trim())} className="w-full">
                  {adding?'Saving…':'Add MCP server'}
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

      <SkillsSettings workspaceRoot={settings.workspaceRoot} skills={settings.skills} onChange={skills=>update("skills",skills)} />
      {/* ---- Integrations ---- */}
      <SettingsGroup title="Integrations" description="One-way syncs and embeds.">
        {integrations.length === 0 && (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">No integrations match.</p>
        )}
        {integrations.map((plugin) => pluginRow(plugin, true))}
      </SettingsGroup>


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
            <SettingsRow label="Autonomy" description="Suggest is read-only. Ask confirms delegation. Tool permissions always apply.">
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
            <SettingsRow label="Can write code" description="Allows workspace changes with the user's tool permissions.">
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
