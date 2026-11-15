import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Segmented } from "@/components/ui/segmented";
import { SettingsGroup, SettingsRow } from "@/components/settings/primitives";
import type { SectionProps } from "@/components/settings/sections-personal";
import { sourceControl, useGitHubAccount, useSourceControl } from "@/lib/source-control";

export function SourceControlSettings({ settings, update }: SectionProps) {
  const sc = settings.sourceControl;
  const patch = (value: Partial<typeof sc>) => update("sourceControl", { ...sc, ...value });
  const { account, error: accountError, loading, refresh } = useGitHubAccount();
  const { status, error: repositoryError } = useSourceControl(settings.workspaceRoot);
  const [token, setToken] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  async function connect(useGh: boolean) {
    setBusy(true); setError("");
    try { await sourceControl.connect(token, useGh); setToken(""); patch({ signedIn: true, provider: "github" }); await refresh(); }
    catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    setBusy(true); setError("");
    try { await sourceControl.disconnect(); patch({ signedIn: false, repos: [], branches: [] }); await refresh(); }
    catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <SettingsGroup title="GitHub account" description="Tokens are verified with GitHub and saved only in the operating-system credential store.">
      <SettingsRow label="GitHub" description={loading ? "Checking saved credentials…" : account ? `Signed in as ${account.login}` : "Connect with an access token or an existing GitHub CLI login."}>
        {account && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void disconnect()}>Disconnect</Button>}
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void refresh()}>Check connection</Button>
      </SettingsRow>
      {!account && <div className="space-y-2 border-t border-border p-4">
        <Input type="password" autoComplete="off" aria-label="GitHub access token" placeholder="GitHub access token" value={token} onChange={e => setToken(e.target.value)} />
        <div className="flex gap-2"><Button size="sm" disabled={busy || !token.trim()} onClick={() => void connect(false)}>{busy ? "Connecting…" : "Save token and connect"}</Button><Button size="sm" variant="secondary" disabled={busy} onClick={() => void connect(true)}>Use GitHub CLI login</Button></div>
        <p className="text-xs text-muted-foreground">For CLI login, run <code>gh auth login --hostname github.com</code> in your terminal first. Repository access and pull requests require the matching token permissions. HTTPS pushes use the saved token; SSH uses your configured SSH identity.</p>
      </div>}
      {error && <p role="alert" className="px-4 pb-3 text-xs text-destructive">{error}</p>}
      {!loading && !account && accountError && <p className="px-4 pb-3 text-xs text-muted-foreground">{accountError}</p>}
    </SettingsGroup>
    <SettingsGroup title="Local Git" description="Git actions use the active coding workspace. Choose a GitHub repository from the composer.">
      <SettingsRow label="Local workspace" description={settings.workspaceRoot || "Choose a coding workspace in Plugins settings."}><span className="text-xs text-muted-foreground">{status?.branch || (status?.unborn ? "No commits yet" : status ? "Detached HEAD" : "Unavailable")}</span></SettingsRow>
      {repositoryError && <p className="px-4 text-xs text-muted-foreground">{repositoryError}</p>}
      {status?.remoteRepository && sc.repo && status.remoteRepository.toLowerCase() !== sc.repo.toLowerCase() && <p className="px-4 pb-3 text-xs text-amber-400">The selected repository differs from the local origin ({status.remoteRepository}). Pull requests are blocked until they match.</p>}
      <SettingsRow label="Branch prefix" description="Used as the initial value when you create a branch in Source Control."><Input aria-label="Branch prefix" value={sc.branchPrefix} onChange={e => patch({ branchPrefix: e.target.value.replace(/\s/g, "") })} className="w-52 font-mono text-xs" /></SettingsRow>
    </SettingsGroup>
    <SettingsGroup title="Commits">
      {(["Require design approval", "Auto-commit", "Sign commits"] as const).map(label => <SettingsRow key={label} label={label} description="Excluded from this release. Commits are explicit user actions."><Switch aria-label={label} checked={false} disabled onCheckedChange={() => {}} /></SettingsRow>)}
      <SettingsRow label="Message style" description="Sets the commit field’s example. Commits keep your entered message."><Segmented ariaLabel="Commit message style" value={sc.commitStyle} onValueChange={commitStyle => patch({ commitStyle })} options={[{ value: "conventional", label: "Conventional" }, { value: "descriptive", label: "Descriptive" }]} /></SettingsRow>
    </SettingsGroup>
  </div>;
}
