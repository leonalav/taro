export const designRecipeToolDefinitions = [{
  type: "function",
  function: {
    name: "DesignRecipe",
    description: "Find original, executable Taro design recipes by capability. Describe a recipe to read its typed controls, mobile behavior, dependencies and checks, or return pinned standalone source and provenance for adaptation. This tool does not write project files.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["search", "describe", "source"] },
        query: { type: "string", description: "Capability or project-fit keywords, e.g. product orbit, touch carousel, scroll camera." },
        kind: { type: "string", enum: ["web", "3d"] },
        id: { type: "string" },
        version: { type: "string", description: "Exact recipe version. Required when requesting source." },
        settings: { type: "object", description: "Values keyed by the typed control IDs returned by describe." },
        scripts: { type: "boolean", description: "Whether the intended output allows inline script execution." },
        webgl: { type: "boolean", description: "Whether the intended renderer supports WebGL." },
      },
      required: ["action"], additionalProperties: false,
    },
  },
}];
export const designRecipeToolNames = new Set(designRecipeToolDefinitions.map((tool) => tool.function.name));
export const designRecipeInstructions = "For a reusable design technique, search DesignRecipe with the brief's capabilities, then describe the candidate and check the target stack, browser requirements, and fallbacks. Request source by exact version only after checking fit. Adapt the pattern to the existing visual identity and approved assets. Retain the recipe ID, exact version, and settings in source or project metadata when adapting it. Do not replace unrelated code. Verify the listed interactions in the project's actual preview.";
