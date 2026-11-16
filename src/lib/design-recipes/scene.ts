import { escapeRecipeText, type DesignRecipe, type RecipeSettings } from "./catalog";

const checkpointDetails: Record<string, string> = {
  front: "See the main driver and the smaller tweeter together.",
  detail: "Look closely at the driver and its concentric mounting rings.",
  profile: "See the depth of the cabinet from the side.",
  "key-light": "A high key light makes the face and rim distinct.",
  "side-light": "Side illumination separates the bright edge from the dark face.",
  "rim-light": "A grazing key light emphasizes the outer edge.",
  wide: "The complete particle field and its outer arms.",
  edge: "The plane of the composition from its edge.",
  core: "A closer view of the dense center where the arms meet.",
  approach: "Tall stone forms leave an opening at the center.",
  passage: "The camera turns between the nearer forms.",
  overview: "From above, the route through the forms becomes readable.",
  column: "Column. A single block with a broad front face and softened edges.",
  orb: "Orb. A light-catching round form with no defined front.",
  knot: "Knot. A continuous loop with a wide opening through the center.",
  resting: "The crossing surfaces and the central opening are visible together.",
  above: "An elevated angle shows where the two bands cross.",
};
const descriptions: Record<string, string> = {
  "product-viewer": "Desk speaker with two front drivers and a deep, rounded enclosure.",
  "lit-material-showcase": "Round material sample under directional studio lights.",
  "particle-composition": "Still view of a spiral point field with pale highlights around the center.",
  "scroll-camera": "A row of upright blocks representing a passage with an opening at the center.",
  "selectable-object-scene": "Three objects on a single stage: a column, a sphere, and a loop.",
  "adaptive-quality-scene": "Looped sculpture with two crossing bands and an open center.",
};
const viewerButtons = `<button type="button" data-turn="-1">Turn left</button><button type="button" data-turn="1">Turn right</button><button type="button" data-reset>Reset view</button>`;

function pointPoster() {
  return Array.from({ length: 156 }, (_, index) => {
    const radius = Math.sqrt((index + 1) / 156) * 43;
    const angle = index % 3 * Math.PI * 2 / 3 + radius * .103;
    const x = 50 + Math.cos(angle) * radius;
    const y = 50 + Math.sin(angle) * radius * .63;
    return `<b style="--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--o:${(.35 + .6 * (1 - radius / 43)).toFixed(2)}"></b>`;
  }).join("");
}

export function sceneMarkup(recipe: DesignRecipe, settings: RecipeSettings) {
  const isTimeline = recipe.id === "scroll-camera";
  const canPlay = ["particle-composition", "adaptive-quality-scene"].includes(recipe.id);
  const checkpoints = recipe.checkpoints ?? [];
  const initial = recipe.id === "selectable-object-scene" ? String(settings.object) : checkpoints[0];
  const describeCheckpoint = (name: string) => name === "profile" && recipe.id === "adaptive-quality-scene"
    ? "Viewed edge-on, the two loops narrow to an interlocking profile."
    : checkpointDetails[name];
  const details = checkpoints.map((name) => `<li data-beat="${name}"><strong>${name.replace(/-/g, " ")}</strong>${checkpointDetails[name]}</li>`).join("");
  const settingsMarkup = recipe.controls.map((control) => {
    const value = settings[control.id];
    const label = control.label.replace(/^Initial ([a-z])/i, (_, initial: string) => initial.toUpperCase());
    if (control.type === "range") return `<label class="scene-control">${label}<input data-setting="${control.id}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${value}"></label>`;
    if (control.type === "choice" && control.id !== "object") {
      return `<label class="scene-control">${label}<select data-setting="${control.id}">${control.choices.map(({ value: option, label }) => `<option value="${option}" ${value === option ? "selected" : ""}>${label}</option>`).join("")}</select></label>`;
    }
    return "";
  }).join("");
  const controls = `<div class="scene-controls" aria-label="Scene controls">
    <div class="scene-actions"><button type="button" data-load disabled>Load 3D</button><output data-state role="status">Still preview</output></div>
    <div>${settingsMarkup}</div>
    <div class="scene-actions" role="group" aria-label="Named views">
      ${checkpoints.map((name) => `<button type="button" data-checkpoint="${name}" data-description="${escapeRecipeText(describeCheckpoint(name))}" aria-pressed="${name === initial}">${name.replace(/-/g, " ")}</button>`).join("")}
      ${recipe.id === "product-viewer" ? viewerButtons : ""}
      ${canPlay ? `<button type="button" data-play aria-pressed="false" disabled>Play rotation</button>` : ""}
    </div>
    ${isTimeline ? '<label><input type="checkbox" data-follow checked> Follow page scroll</label>' : ""}
    <p data-detail role="status">${checkpointDetails[initial]}</p>
  </div>`;
  const stage = `<div data-recipe-stage data-taro-layer="scene-stage" data-recipe-state="poster" data-recipe-renderer="pending" data-recipe-checkpoint="${initial}" class="scene-stage">
      <div class="scene-poster" role="img" aria-label="${descriptions[recipe.id]}">${recipe.id === "particle-composition" ? pointPoster() : "<i aria-hidden='true'></i>"}</div>
      <canvas aria-hidden="true"></canvas>
    </div>`;
  return `<main class="scene">
  <header><h1>${recipe.title}</h1><p>${recipe.summary}</p></header>
  ${isTimeline ? `${controls}<div class="scene-timeline">${stage}</div><ol class="scene-steps">${details}</ol>` : `${stage}${controls}`}
  <noscript><p>${recipe.fallback}</p></noscript>
</main>`;
}
