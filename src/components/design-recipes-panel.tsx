import * as React from "react";
import { ArrowLeft, Box, Code2, Download, Monitor, Search, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  checkRecipeCompatibility, renderDesignRecipe, searchDesignRecipes,
  type DesignRecipe, type DesignRecipeKind, type DesignRecipeSelection, type RecipeSettings,
} from "@/lib/design-recipes";
import { designSkills } from "@/lib/design-recipes/skills";

function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function DesignRecipesPanel({ onUse }: { onUse?: (selection: DesignRecipeSelection) => void }) {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | DesignRecipeKind>("all");
  const [active, setActive] = React.useState<DesignRecipe>();
  const lastTrigger = React.useRef<HTMLButtonElement>(null);
  const shouldRestoreFocus = React.useRef(false);
  const recipes = searchDesignRecipes(query, filter === "all" ? undefined : filter);

  React.useLayoutEffect(() => {
    if (!active && shouldRestoreFocus.current) {
      lastTrigger.current?.focus();
      shouldRestoreFocus.current = false;
    }
  }, [active]);

  if (active) {
    return <RecipeInspector key={active.id} recipe={active} onUse={onUse} onBack={() => {
      shouldRestoreFocus.current = true;
      setActive(undefined);
    }} />;
  }

  return <section className="mx-auto grid max-w-[76rem] gap-6 px-6 py-5" aria-label="Design recipes">
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative min-w-40 flex-1 md:max-w-xs">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Search design recipes" placeholder="Search capabilities…" value={query} onChange={(event) => setQuery(event.currentTarget.value)} className="pl-8" />
      </label>
      <div role="group" aria-label="Recipe type" className="flex flex-wrap gap-1">
        {([{ id: "all", label: "All" }, { id: "web", label: "Web" }, { id: "3d", label: "3D" }] as const).map(({ id, label }) => (
          <Button key={id} size="sm" variant={filter === id ? "secondary" : "ghost"} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</Button>
        ))}
      </div>
      <span role="status" className="ml-auto text-xs tabular-nums text-muted-foreground">{recipes.length} {recipes.length === 1 ? "recipe" : "recipes"}</span>
    </div>

    {recipes.length ? <ul className="grid list-none gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {recipes.map((recipe) => <li key={recipe.id}>
        <button
          type="button"
          ref={(element) => { if (shouldRestoreFocus.current && lastTrigger.current?.dataset.recipeId === recipe.id && element) lastTrigger.current = element; }}
          data-recipe-id={recipe.id}
          aria-label={`Preview ${recipe.title}`}
          onClick={(event) => { lastTrigger.current = event.currentTarget; setActive(recipe); }}
          className="flex h-full w-full items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-taro"
        >
          {recipe.kind === "3d" ? <Box aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-taro" /> : <Code2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{recipe.title}</span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">{recipe.summary}</span>
          </span>
        </button>
      </li>)}
    </ul> : <p className="py-8 text-center text-sm text-muted-foreground">No recipes match the current search.</p>}

    <details className="border-t border-border pt-4 text-sm">
      <summary className="w-fit cursor-pointer font-medium">Importable design skills</summary>
      <p className="mt-2 max-w-prose text-xs leading-5 text-muted-foreground">Save the skill as <code>SKILL.md</code> in the named folder. Open Settings → Skills to scan that folder and import the skill into your workspace.</p>
      <ul className="mt-2 list-none divide-y divide-border">
        {designSkills.map((skill) => <li key={skill.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <div><span>{skill.title}</span><code className="ml-2 text-xs text-muted-foreground">{skill.id}/SKILL.md</code></div>
          <Button variant="secondary" size="sm" onClick={() => downloadText("SKILL.md", skill.markdown, "text/markdown;charset=utf-8")} aria-label={`Download ${skill.title} skill`}><Download />Download</Button>
        </li>)}
      </ul>
    </details>
  </section>;
}

function RecipeInspector({ recipe, onUse, onBack }: {
  recipe: DesignRecipe;
  onUse?: (selection: DesignRecipeSelection) => void;
  onBack: () => void;
}) {
  const heading = React.useRef<HTMLHeadingElement>(null);
  const [preview, setPreview] = React.useState(() => renderDesignRecipe(recipe, {}));
  const [draft, setDraft] = React.useState<RecipeSettings>(preview.selection.settings);
  const [device, setDevice] = React.useState<"wide" | "phone">("wide");
  const [error, setError] = React.useState("");
  const compatibility = checkRecipeCompatibility(recipe, {});
  const changed = recipe.controls.some(({ id }) => draft[id] !== preview.selection.settings[id]);
  React.useEffect(() => { heading.current?.focus(); }, []);

  const change = (id: string, value: string | number) => {
    setDraft((current) => ({ ...current, [id]: value }));
    setError("");
  };
  const applyPreview = (event: React.FormEvent) => {
    event.preventDefault();
    try { setPreview(renderDesignRecipe(recipe, draft)); setError(""); }
    catch (reason) { setError(String(reason)); }
  };

  return <article className="mx-auto max-w-[76rem] px-6 py-5">
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        <Button variant="ghost" size="icon-sm" aria-label="Back to recipes" onClick={onBack}><ArrowLeft /></Button>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 ref={heading} tabIndex={-1} className="text-base font-semibold tracking-tight">{recipe.title}</h2>
            <Badge>v{recipe.version}</Badge>
          </div>
          <p className="mt-1 max-w-prose text-xs leading-5 text-muted-foreground">{recipe.summary}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" disabled={changed} onClick={() => downloadText(preview.filename, preview.html, "text/html;charset=utf-8")}><Download />Download source</Button>
        {onUse && <Button size="sm" disabled={changed} onClick={() => onUse(preview.selection)}>Use in chat</Button>}
      </div>
    </header>

    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
        <div role="group" aria-label="Preview width" className="flex items-center justify-end gap-1 border-b border-border px-2 py-1">
          <Button size="icon-sm" variant={device === "wide" ? "secondary" : "ghost"} aria-label="Wide preview" aria-pressed={device === "wide"} onClick={() => setDevice("wide")}><Monitor /></Button>
          <Button size="icon-sm" variant={device === "phone" ? "secondary" : "ghost"} aria-label="Phone preview" aria-pressed={device === "phone"} onClick={() => setDevice("phone")}><Smartphone /></Button>
        </div>
        <iframe
          key={JSON.stringify(preview.selection.settings)}
          title="Interactive recipe preview"
          srcDoc={preview.html}
          sandbox="allow-scripts allow-forms"
          tabIndex={0}
          className="mx-auto block h-[32rem] w-full bg-[#141914]"
          style={{ maxWidth: device === "phone" ? 390 : undefined }}
        />
      </div>
      <form onSubmit={applyPreview} className="grid content-start gap-3 rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-medium">Preview settings</h3>
        {recipe.controls.map((control) => (
          <label key={control.id} className="grid gap-1 text-xs">
            <span>{control.label}</span>
            {control.type === "text" ? (
              <Input required maxLength={control.maxLength} value={draft[control.id]} onChange={(event) => change(control.id, event.currentTarget.value)} />
            ) : control.type === "range" ? (
              <Input type="number" min={control.min} max={control.max} step={control.step} required value={draft[control.id]} onChange={(event) => change(control.id, event.currentTarget.value === "" ? "" : event.currentTarget.valueAsNumber)} />
            ) : (
              <select value={draft[control.id]} onChange={(event) => change(control.id, event.currentTarget.value)} className="h-8 rounded-lg border border-input bg-background px-2 text-sm">
                {control.choices.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            )}
          </label>
        ))}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <Button size="sm" variant="secondary" type="submit" disabled={!changed}>Apply settings</Button>
      </form>
    </div>

    <dl className="mt-5 grid gap-x-7 gap-y-4 border-t border-border pt-4 text-xs leading-5 sm:grid-cols-2">
      <div><dt className="font-semibold">Compatibility</dt><dd className="text-muted-foreground">{compatibility.message} Open the downloaded file to run it.</dd></div>
      <div><dt className="font-semibold">Mobile and fallback</dt><dd className="text-muted-foreground">{recipe.mobile} {recipe.fallback}</dd></div>
      <div><dt className="font-semibold">What to check</dt><dd className="text-muted-foreground"><ul className="list-disc pl-4">{recipe.checks.map((check) => <li key={check}>{check}</li>)}</ul></dd></div>
      <div><dt className="font-semibold">Source and limits</dt><dd className="text-muted-foreground">{recipe.source} {recipe.license} {recipe.limitations}</dd></div>
    </dl>
  </article>;
}
