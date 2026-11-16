/// <reference types="vite/client" />
import { designRecipes, escapeRecipeText, type DesignRecipe, type DesignRecipeKind, type RecipeSettings } from "./design-recipes/catalog";
import { webMarkup, webStyles } from "./design-recipes/web";
import { sceneMarkup } from "./design-recipes/scene";
import baseCss from "./design-recipes/base.css?raw";
import webScript from "./design-recipes/web-preview.js?raw";
import sceneScript from "./design-recipes/scene-preview.js?raw";

export { designRecipes };
export type { DesignRecipe, DesignRecipeKind, RecipeSettings };

export interface DesignRecipeSelection {
  id: string;
  title: string;
  version: string;
  settings: RecipeSettings;
}

export function searchDesignRecipes(query: string, kind?: DesignRecipeKind) {
  const terms = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return designRecipes.filter((recipe) => {
    const searchable = [recipe.title, recipe.id, recipe.summary, ...recipe.tags].join(" ").toLowerCase();
    return (!kind || kind === recipe.kind) && terms.every((term) => searchable.includes(term));
  });
}

export function checkRecipeCompatibility(recipe: DesignRecipe, environment: { scripts?: boolean; webgl?: boolean }) {
  const needsScript = !["editorial-hero", "responsive-navigation"].includes(recipe.id);
  if (needsScript && environment.scripts === false) {
    return { status: "limited", message: "This experience requires browser JavaScript for its interactive controls. Test and adapt the static content before use." };
  }
  if (recipe.kind === "3d" && environment.webgl === false) {
    return { status: "fallback", message: "This environment lacks WebGL. Use the static illustration and HTML controls or choose a web recipe." };
  }
  return {
    status: "compatible",
    message: recipe.kind === "3d"
      ? "No package dependencies. Requires modern browser JavaScript and WebGL for 3D. The illustration and HTML alternatives stay available when WebGL fails."
      : "No package dependencies. Open the standalone HTML in a modern browser or adapt its markup and scoped styles to the existing stack.",
  };
}

export function renderDesignRecipe(recipe: DesignRecipe, input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("Recipe settings must be an object.");
  const raw = input as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!recipe.controls.some((control) => control.id === key)) throw Error(`Unknown recipe setting: ${key}.`);
  }
  const settings = Object.fromEntries(recipe.controls.map((control) => {
    const value = Object.prototype.hasOwnProperty.call(raw, control.id) ? raw[control.id] : control.default;
    const valid = control.type === "text"
      ? typeof value === "string" && value.trim().length > 0 && value.length <= control.maxLength
      : control.type === "choice"
        ? control.choices.some((option) => option.value === value)
        : typeof value === "number" && Number.isFinite(value) && value >= control.min && value <= control.max && (value - control.min) % control.step === 0;
    if (!valid) throw Error(`Invalid value for recipe setting ${control.id}.`);
    return [control.id, value as string | number];
  }));
  const selection: DesignRecipeSelection = { id: recipe.id, version: recipe.version, title: recipe.title, settings };
  const identity = `${recipe.id}@${recipe.version}`;
  const filename = `${recipe.id}-${recipe.version}.html`;
  const script = recipe.kind === "3d" ? sceneScript : webScript;
  const markup = recipe.kind === "3d" ? sceneMarkup(recipe, settings) : webMarkup(recipe.id, settings);
  const encoded = JSON.stringify(settings).replace(/</g, "\\u003c");
  const title = escapeRecipeText(settings.heading ?? recipe.title);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<meta name="taro-design-recipe" content="${identity}">
<title>${title}</title>
<style>${baseCss}\n${recipe.kind === "web" ? webStyles : ""}</style>
</head>
<body data-recipe="${recipe.id}">
<!-- ${identity} · Original Taro example. No third-party code, fonts, or artwork.
     Keep this recipe marker and the settings below when adapting the technique. -->
${markup}
<script id="recipe-settings" type="application/json">${encoded}</script>
<script>
${script}
</script>
</body>
</html>`;
  return { html, filename, selection };
}
