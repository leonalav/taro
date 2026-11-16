import { describe, expect, it } from "vitest";
import { designRecipes, renderDesignRecipe, searchDesignRecipes } from "./design-recipes";
import { executeDesignRecipeTool } from "./design-recipe-tools";

describe("design recipe library", () => {
  it("provides six distinct executable examples of each kind with portable source", () => {
    expect(designRecipes.filter((recipe) => recipe.kind === "web")).toHaveLength(6);
    expect(designRecipes.filter((recipe) => recipe.kind === "3d")).toHaveLength(6);
    expect(new Set(designRecipes.map((recipe) => recipe.id)).size).toBe(12);
    for (const recipe of designRecipes) {
      expect(recipe).toMatchObject({
        version: "1.0.0", dependencies: [], mobile: expect.any(String), limitations: expect.any(String),
        license: expect.any(String), checks: expect.arrayContaining([expect.any(String)]),
      });
      const html = renderDesignRecipe(recipe, {}).html;
      expect(html).toMatch(/^<!doctype html>/i);
      expect(html).toContain(`${recipe.id}@${recipe.version}`);
      expect(html).not.toMatch(/<(script|link)\b[^>]+\b(?:src|href)=/i);
      if(recipe.kind==='3d')expect(html).toContain('data-load disabled');
    }
  });

  it("matches capabilities and surfaces browser incompatibilities", () => {
    expect(searchDesignRecipes("product orbit").map((recipe) => recipe.id)).toEqual(["product-viewer"]);
    expect(searchDesignRecipes("camera", "web")).toEqual([]);
    const result = executeDesignRecipeTool({ action: "describe", id: "product-viewer", webgl: false });
    expect(result.artifact.compatibility).toMatchObject({ status: "fallback" });
  });

  it("rejects unsupported versions and typed settings without writing files", () => {
    expect(() => executeDesignRecipeTool({ action: "source", id: "editorial-hero", version: "8.0.0" })).toThrow(/version/i);
    expect(() => executeDesignRecipeTool({ action: "source", id: "product-viewer", version: "1.0.0", settings: { finish: "#ffffff" } })).toThrow(/finish/i);
    expect(() => executeDesignRecipeTool({ action: "source", id: "product-viewer", version: "1.0.0", settings: { features: true } })).toThrow(/features/i);
  });

  it("exports validated settings and escapes content in every context", () => {
    const recipe = designRecipes.find((item) => item.id === "editorial-hero")!;
    const heading = '</title><script>alert(1)</script>';
    const exported = renderDesignRecipe(recipe, { heading });
    expect(exported.selection.settings.heading).toBe(heading);
    expect(exported.html).not.toContain(heading);
    expect(exported.html).toContain("&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
