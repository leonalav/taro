export type DesignRecipeKind = "web" | "3d";
export type RecipeValue = string | number;
export type RecipeSettings = Record<string, RecipeValue>;

const htmlEscapes: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeRecipeText(value: RecipeValue) {
  return String(value).replace(/[&<>"']/g, (character) => htmlEscapes[character]);
}

export type RecipeControl =
  | { id: string; label: string; type: "text"; default: string; maxLength: number }
  | { id: string; label: string; type: "choice"; default: string; choices: ReadonlyArray<{ value: string; label: string }> }
  | { id: string; label: string; type: "range"; default: number; min: number; max: number; step: number };

export interface DesignRecipe {
  id: string;
  title: string;
  kind: DesignRecipeKind;
  version: string;
  summary: string;
  tags: readonly string[];
  controls: readonly RecipeControl[];
  mobile: string;
  fallback: string;
  limitations: string;
  checks: readonly string[];
  checkpoints?: readonly string[];
  dependencies: readonly string[];
  source: string;
  license: string;
}

const text = (id: string, label: string, value: string): RecipeControl => ({ id, label, type: "text", default: value, maxLength: 80 });
const choice = (id: string, label: string, value: string, choices: string[]): RecipeControl => ({
  id, label, type: "choice", default: value, choices: choices.map((entry) => ({ value: entry.toLowerCase(), label: entry })),
});
const quality = choice("quality", "Render quality", "auto", ["Auto", "Low", "High", "Static"]);

function recipe(kind: DesignRecipeKind, metadata: Omit<DesignRecipe, "kind" | "version" | "dependencies" | "source" | "license">): DesignRecipe {
  return {
    ...metadata, kind, version: "1.0.0", dependencies: [],
    source: "Original Taro example with authored procedural graphics. No third-party assets.",
    license: "Taro project terms apply. No separate third-party terms.",
  };
}

export const designRecipes: readonly DesignRecipe[] = [
  recipe("web", {
    id: "editorial-hero", title: "Editorial hero", summary: "A lead feature with a readable story behind its headline and cover illustration.",
    tags: ["editorial", "responsive typography", "feature story", "publication", "hero"],
    controls: [text("heading", "Headline", "The edge of the season"), choice("palette", "Palette", "glacier", ["Glacier", "Dusk"])],
    mobile: "The cover and text stack; the reading link still lands on the story.",
    fallback: "Text, story, and link work with JavaScript unavailable.",
    limitations: "Illustrative copy and artwork. Replace them with cleared editorial assets for publication.",
    checks: ["Open the story by keyboard.", "Read the longest headline at phone width."],
  }),
  recipe("web", {
    id: "portfolio-case-study", title: "Portfolio case study", summary: "A compact project narrative with persistent anchors and a before/after comparison.",
    tags: ["portfolio", "case study", "before after", "comparison", "range", "project story"],
    controls: [text("heading", "Project name", "A map of quiet places"), { id: "reveal", label: "Initial comparison (%)", type: "range", default: 55, min: 0, max: 100, step: 1 }],
    mobile: "The comparison fits the article column; its range works by touch and keyboard.",
    fallback: "Captions describe both designs, independent of the visual comparison.",
    limitations: "Uses synthetic map artwork and sample project text.",
    checks: ["Move the comparison from 0 to 100 with the keyboard.", "Follow the Design notes anchor."],
  }),
  recipe("web", {
    id: "product-carousel", title: "Product carousel", summary: "A three-item collection with direct selection, previous and next controls, and horizontal dragging.",
    tags: ["carousel", "drag", "touch", "products", "swipe", "keyboard"],
    controls: [text("heading", "Collection name", "Objects for the desk"), choice("start", "Initial item", "folio", ["Folio", "Orbit", "Loop"])],
    mobile: "Horizontal swipes change items while vertical swipes can scroll the page.",
    fallback: "Previous, Next, and direct item buttons expose the same products as dragging.",
    limitations: "Three synthetic products. There is no inventory or purchasing integration.",
    checks: ["Drag past the threshold in both directions.", "Switch by keyboard and by touch."],
  }),
  recipe("web", {
    id: "image-gallery", title: "Image gallery", summary: "A category-filtered set of prints with a keyboard-operable detail dialog.",
    tags: ["image gallery", "filter", "lightbox", "escape", "artwork", "photography layout"],
    controls: [text("heading", "Gallery title", "Print room"), choice("filter", "Initial filter", "all", ["All", "Lines", "Shapes"])],
    mobile: "The grid wraps and the detail image fits the viewport.",
    fallback: "The original grid has titled artwork and an accessible detail button for every piece.",
    limitations: "Original geometric compositions stand in for a collection of approved images.",
    checks: ["Filter the artwork.", "Open a print, press Escape, and check that focus returns."],
  }),
  recipe("web", {
    id: "checkout-states", title: "Checkout form states", summary: "A two-step order review with inline errors, editable details, and a local confirmation.",
    tags: ["form", "checkout", "validation", "error state", "confirmation", "accessible forms"],
    controls: [text("heading", "Order title", "Reserve a field notebook"), choice("delivery", "Default delivery", "pickup", ["Pickup", "Shipping"])],
    mobile: "Labels, errors, review, and confirmation remain in one reading column.",
    fallback: "Errors and confirmation use text; keyboard interaction completes the entire demonstration.",
    limitations: "Demonstration only. No payment, order submission, or network requests.",
    checks: ["Trigger and correct both errors.", "Edit the review and complete the sample order."],
  }),
  recipe("web", {
    id: "responsive-navigation", title: "Responsive navigation", summary: "An anchored site menu that becomes a native disclosure on narrow screens.",
    tags: ["responsive navigation", "menu", "disclosure", "anchors", "keyboard", "mobile"],
    controls: [text("heading", "Site name", "Northward Press"), choice("theme", "Theme", "ink", ["Ink", "Paper"])],
    mobile: "A labeled Menu disclosure opens without trapping focus and closes on selection.",
    fallback: "Desktop links and the mobile details disclosure work without JavaScript.",
    limitations: "Demonstrates one navigation level and local sections.",
    checks: ["Reach each section at desktop width.", "Use Escape and activate a link from the phone menu."],
  }),
  recipe("3d", {
    id: "product-viewer", title: "3D product viewer", summary: "Inspect a procedural speaker with orbit, detail views, finish variants, and reset.",
    tags: ["product orbit", "3d viewer", "speaker", "variants", "materials", "touch"],
    controls: [choice("finish", "Initial finish", "terracotta", ["Terracotta", "Ink", "Moss"]), quality],
    mobile: "Horizontal orbit leaves vertical touch scrolling available. Labeled angle and finish controls wrap below.",
    fallback: "A speaker illustration and readable finish and detail information remain available.",
    limitations: "Original procedural speaker. Importing product-specific geometry requires a model loader.",
    checks: ["Drag the angle and change the active finish.", "Reset, switch to static view, and confirm the detail text remains available."],
    checkpoints: ["front", "detail", "profile"],
  }),
  recipe("3d", {
    id: "lit-material-showcase", title: "Lit material showcase", summary: "Compare three studio finishes under a fixed or moved key light.",
    tags: ["material showcase", "lighting", "shader", "roughness", "swatches"],
    controls: [choice("material", "Initial material", "ceramic", ["Ceramic", "Copper", "Graphite"]), { id: "light", label: "Initial key light (%)", type: "range", default: 64, min: 0, max: 100, step: 1 }, quality],
    mobile: "Material and light controls remain available without dragging.",
    fallback: "Material swatches and their finish descriptions remain available in static view.",
    limitations: "Directional studio shader. Exact measured BRDFs, reflections, and HDR environments require a different renderer.",
    checks: ["Switch materials and move the key light.", "Inspect the changed surface color and highlight."],
    checkpoints: ["key-light", "side-light", "rim-light"],
  }),
  recipe("3d", {
    id: "particle-composition", title: "Particle composition", summary: "A seeded star field drawn from one position buffer with an optional rotation.",
    tags: ["particles", "seeded", "points", "motion", "reduced motion", "shader"],
    controls: [{ id: "density", label: "Particle count", type: "range", default: 900, min: 150, max: 1800, step: 150 }, quality],
    mobile: "Low quality draws fewer points; visitors can pause and use named perspectives.",
    fallback: "The seeded still composition is shown when WebGL or motion is unavailable.",
    limitations: "This point-cloud design represents an abstract composition. Its colors and density do not encode data.",
    checks: ["Play, pause, and confirm only Play requests continuous frames.", "Verify low quality and reduced motion."],
    checkpoints: ["wide", "edge", "core"],
  }),
  recipe("3d", {
    id: "scroll-camera", title: "Scroll-controlled camera", summary: "Native scrolling and a manual checkpoint control drive the same camera in a three-beat scene.",
    tags: ["scroll camera", "choreography", "story", "checkpoints", "native scroll"],
    controls: [choice("scene", "Scene palette", "mineral", ["Mineral", "Ember"]), quality],
    mobile: "The scene uses a short sticky viewport; the three manual views also work without scrolling through the sequence.",
    fallback: "Reduced motion keeps manual camera controls and all three chapter descriptions.",
    limitations: "The supplied three-beat track is authored for its procedural objects.",
    checks: ["Traverse start, middle, and end by scroll in both directions.", "Use manual checkpoints when motion is reduced."],
    checkpoints: ["approach", "passage", "overview"],
  }),
  recipe("3d", {
    id: "selectable-object-scene", title: "Selectable object scene", summary: "Pick one of three objects in a small collection and read its independent HTML details.",
    tags: ["object selection", "hit testing", "keyboard", "details", "inventory"],
    controls: [choice("object", "Initial selection", "column", ["Column", "Orb", "Knot"]), quality],
    mobile: "Large HTML buttons provide the same selection as tapping the model.",
    fallback: "The object list and detail text remain usable with the static composition.",
    limitations: "Hit testing uses projected regions sized for the included objects. Dense arbitrary models need mesh raycasting.",
    checks: ["Click each object's projected center on the canvas.", "Select each object by keyboard in static view."],
    checkpoints: ["column", "orb", "knot"],
  }),
  recipe("3d", {
    id: "adaptive-quality-scene", title: "Adaptive 3D scene", summary: "A sculpture starts conservatively and budgets pixel ratio and surface detail around measured frame times.",
    tags: ["adaptive quality", "low power", "performance", "static fallback", "webgl"],
    controls: [quality, choice("colorway", "Sculpture color", "jade", ["Jade", "Aubergine", "Sand"])],
    mobile: "Auto starts at low quality with a coarse pointer or reduced-motion preference.",
    fallback: "A static sculpture and short shape description remain visible. Static can be selected explicitly.",
    limitations: "Frame samples describe this session and do not predict a universal device frame rate.",
    checks: ["Switch between low, high, auto, and static.", "Lose the WebGL context and verify that fallback controls remain usable."],
    checkpoints: ["resting", "profile", "above"],
  }),
];
