import { escapeRecipeText, type RecipeSettings } from "./catalog";
import styles from "./web.css?raw";
export const webStyles = styles;

const titles = {
  folio: ["Folio", "A hard cover for loose notes."],
  orbit: ["Orbit", "A circular paperweight with a cutout grip."],
  loop: ["Loop", "A cable keeper shaped from a single fold."],
} as const;

const prints = [
  { id: "soundings", category: "lines", title: "Soundings", detail: "Cream arcs repeat across dark indigo, widening toward the right edge." },
  { id: "interval", category: "shapes", title: "Interval", detail: "A blue plate overlaps a tangerine square." },
  { id: "tideline", category: "lines", title: "Tideline", detail: "Fine diagonal stripes cross a yellow ground." },
  { id: "sunroom", category: "shapes", title: "Sunroom", detail: "An offset red circle rests on a warm pink field." },
] as const;

const navItems = [["current", "Current issue"], ["archive", "Archive"], ["about", "About"]] as const;
const navLinks = navItems.map(([id, label]) => `<a href="#${id}">${label}</a>`).join("");

export function webMarkup(id: string, settings: RecipeSettings): string {
  const heading = escapeRecipeText(settings.heading);
  switch (id) {
    case "editorial-hero":
      return `<main class="feature" data-palette="${settings.palette}">
  <header class="feature-lead">
    <div class="feature-caption">
      <h1>${heading}</h1>
      <p>A field note on the first blue hour after the snow begins to lift.</p>
      <a class="text-link" href="#story">Read the field note <span aria-hidden="true">↓</span></a>
    </div>
    <div class="ridge" role="img" aria-label="Abstract ridge silhouettes at dawn, with a pale sun beyond the snowline"><i></i><b></b><em></em></div>
  </header>
  <article id="story" tabindex="-1" class="feature-story">
    <h2>Above the snowline</h2>
    <p>Before the first meltwater runs, the ridge is all edges. Light reaches the exposed slopes while the snow below holds the blue of the previous night.</p>
    <p>By noon the layers flatten. The thin line between shadow and ice is easiest to see if you wait in the same place for ten minutes.</p>
  </article>
</main>`;
    case "portfolio-case-study":
      return `<main class="case paper">
  <header class="case-head"><div><h1>${heading}</h1><p>A wayfinding study for a small collection of listening walks.</p></div><a class="text-link" href="#notes">Design notes <span aria-hidden="true">↓</span></a></header>
  <figure>
    <div class="comparison" aria-hidden="true" style="--reveal:${settings.reveal}%">
      <div class="map map-before"><i></i><b></b><em></em></div><div class="map map-after"><i></i><b></b><em></em></div>
    </div>
    <label class="compare-label">Comparison <input type="range" min="0" max="100" value="${settings.reveal}" data-compare aria-describedby="map-description"></label>
    <figcaption id="map-description">The original design has thin, equal-weight paths. The revision highlights the listening route and puts landmarks on the route itself.</figcaption>
  </figure>
  <section id="notes" tabindex="-1"><h2>Design notes</h2><p>Reducing the number of symbols made the map easier to read at walking pace. The route gained contrast and each stopping point gained a name.</p></section>
</main>`;
    case "product-carousel":
      return `<main class="collection">
  <header><h1>${heading}</h1><p>Three small things designed to stay within reach.</p></header>
  <div class="carousel" aria-label="Desk collection" aria-roledescription="carousel">
    <div class="slides" data-drag>
      ${Object.entries(titles).map(([key, [name, detail]]) => `<article class="product" data-product="${key}" ${settings.start === key ? "" : "hidden"}><div class="product-plate" role="img" aria-label="${detail}"><i></i></div><div><h2>${name}</h2><p>${detail}</p></div></article>`).join("")}
    </div>
    <div class="carousel-actions"><button type="button" data-prev>Previous</button><div class="item-picks" aria-label="Choose a product" role="group">${Object.entries(titles).map(([key, [name]]) => `<button type="button" data-item="${key}" aria-pressed="${settings.start === key}">${name}</button>`).join("")}</div><button type="button" data-next>Next</button></div>
    <p data-slide-status role="status" class="sr-only"></p>
  </div>
</main>`;
    case "image-gallery":
      return `<main class="prints paper">
  <header><h1>${heading}</h1><div class="filters" aria-label="Filter prints" role="group">${["All", "Lines", "Shapes"].map(filter => `<button type="button" data-filter="${filter.toLowerCase()}" aria-pressed="${filter.toLowerCase() === settings.filter}">${filter}</button>`).join("")}</div></header>
  <div class="print-grid">${prints.map(print => `<button type="button" class="print-card" data-print="${print.id}" data-category="${print.category}" data-description="${print.detail}" ${settings.filter === "all" || settings.filter === print.category ? "" : "hidden"}><span class="print-art ${print.id}" aria-hidden="true"></span><span>${print.title}</span></button>`).join("")}</div>
  <dialog aria-labelledby="print-title"><button type="button" data-close-print>Close</button><div data-print-art class="print-art" aria-hidden="true"></div><h2 id="print-title"></h2><p data-print-description></p></dialog>
</main>`;
    case "checkout-states":
      return `<main class="reservation paper">
  <header><h1>${heading}</h1><p>A sample reservation. No payment is collected.</p></header>
  <form id="details" novalidate aria-label="Reservation details">
    <div class="field"><label for="customer">Full name</label><input id="customer" required autocomplete="name" aria-describedby="customer-error"><p id="customer-error" data-error hidden>Enter your name.</p></div>
    <div class="field"><label for="email">Email</label><input id="email" type="email" required autocomplete="email" aria-describedby="email-error"><p id="email-error" data-error hidden>Enter a valid email address.</p></div>
    <fieldset><legend>Delivery</legend><label><input type="radio" name="delivery" value="pickup" ${settings.delivery === "pickup" ? "checked" : ""}> Pick up</label><label><input type="radio" name="delivery" value="shipping" ${settings.delivery === "shipping" ? "checked" : ""}> Ship to me</label></fieldset>
    <button type="submit">Review reservation</button>
  </form>
  <section id="summary" hidden><h2 tabindex="-1">Review details</h2><p data-details></p><button type="button" data-edit>Edit details</button> <button type="button" data-confirm>Confirm sample reservation</button></section>
  <section id="receipt" hidden><h2 tabindex="-1">Sample reservation confirmed</h2><p>Your details were processed locally for this preview.</p></section>
</main>`;
    case "responsive-navigation":
      return `<main class="press" data-theme="${settings.theme}">
  <header><a class="press-name" href="#current">${heading}</a><nav aria-label="Site">${navLinks}</nav><details><summary>Menu</summary><nav aria-label="Mobile site">${navLinks}</nav></details></header>
  <article id="current" tabindex="-1"><h1>Printing close to home</h1><p>The current issue gathers four essays on making books, keeping archives, and talking in small rooms.</p></article>
  <section id="archive" tabindex="-1"><h2>Archive</h2><p>Find past issues through our lending library and three local reading rooms.</p></section>
  <section id="about" tabindex="-1"><h2>About</h2><p>Northward is an independent press working across short books and public readings.</p></section>
</main>`;
    default:
      throw Error("Unsupported web recipe.");
  }
}
