import type { ToolOutput } from "./agent-tools";
import { checkRecipeCompatibility, designRecipes, renderDesignRecipe, searchDesignRecipes } from "./design-recipes";

export function executeDesignRecipeTool(input: Record<string, unknown>): ToolOutput {
  const { action, kind, id, version, settings, scripts, webgl } = input;
  if (action === "search") {
    if (kind !== undefined && kind !== "web" && kind !== "3d") throw Error("Select web or 3d.");
    const found = searchDesignRecipes(typeof input.query === "string" ? input.query : "", kind).map((recipe) => ({
      id: recipe.id, version: recipe.version, title: recipe.title, summary: recipe.summary, tags: recipe.tags, kind: recipe.kind,
    }));
    return { text: JSON.stringify(found, null, 2), artifact: { kind: "design-recipe-search", recipes: found } };
  }
  if (action !== "describe" && action !== "source") throw Error("Select search, describe, or source.");
  const recipe = designRecipes.find((item) => item.id === id);
  if (!recipe) throw Error("Unknown design recipe. Search the library to find a recipe ID.");
  if ((action === "source" || version !== undefined) && version !== recipe.version) {
    throw Error(`Recipe version unavailable. ${recipe.id} is available at version ${recipe.version}.`);
  }
  for (const [key, value] of Object.entries({ scripts, webgl })) {
    if (value !== undefined && typeof value !== "boolean") throw Error(`${key} must be a boolean.`);
  }
  const compatibility = checkRecipeCompatibility(recipe, { scripts: scripts as boolean | undefined, webgl: webgl as boolean | undefined });
  if (action === "describe") {
    return { text: JSON.stringify({ ...recipe, compatibility }, null, 2), artifact: { kind: "design-recipe", recipe, compatibility } };
  }
  const rendered = renderDesignRecipe(recipe, settings === undefined ? {} : settings);
  return {
    text: `Recipe ${recipe.id}@${recipe.version}\n${compatibility.message}\n\n${rendered.html}`,
    artifact: { kind: "design-recipe-source", path: rendered.filename, selection: rendered.selection, compatibility },
  };
}
