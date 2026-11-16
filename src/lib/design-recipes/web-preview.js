(() => {
  const lookup = (selector) => document.querySelector(selector);
  const all = (selector) => Array.from(document.querySelectorAll(selector));
  const recipe = document.body.dataset.recipe;
  // srcdoc normally resolves fragment URLs against the Gallery's URL.
  // Keep recipe links in their own document while leaving exported anchors native.
  if (location.href === "about:srcdoc") {
    document.addEventListener("click", (event) => {
      const link = event.target.closest("a[href^='#']");
      if (!link) return;
      const target = document.getElementById(link.getAttribute("href").slice(1));
      if (!target) return;
      event.preventDefault();
      target.focus({ preventScroll: true });
      target.scrollIntoView();
    });
  }
  if (recipe === "portfolio-case-study") {
    const comparison = lookup(".comparison");
    lookup("[data-compare]").addEventListener("input", (event) => {
      comparison.style.setProperty("--reveal", event.target.value + "%");
    });
  }
  if (recipe === "product-carousel") {
    const slides = all("[data-product]");
    const picks = all("[data-item]");
    let index = slides.findIndex((slide) => !slide.hidden);
    function show(next) {
      index = (next + slides.length) % slides.length;
      slides.forEach((slide, position) => { slide.hidden = position !== index; });
      picks.forEach((button, position) => button.setAttribute("aria-pressed", String(position === index)));
      lookup("[data-slide-status]").textContent = picks[index].textContent + ", " + (index + 1) + " of " + slides.length;
    }
    picks.forEach((button, position) => button.addEventListener("click", () => show(position)));
    lookup("[data-prev]").addEventListener("click", () => show(index - 1));
    lookup("[data-next]").addEventListener("click", () => show(index + 1));
    const drag = lookup("[data-drag]");
    let start;
    drag.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      drag.setPointerCapture(event.pointerId);
      start = { x: event.clientX, y: event.clientY };
    });
    drag.addEventListener("pointerup", (event) => {
      if (start) {
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (Math.abs(dx) > Math.max(38, Math.abs(dy))) show(index - Math.sign(dx));
      }
      start = undefined;
    });
    drag.addEventListener("pointercancel", () => { start = undefined; });
    lookup(".carousel").addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      show(index + (event.key === "ArrowLeft" ? -1 : 1));
    });
  }
  if (recipe === "image-gallery") {
    const filters = all("[data-filter]");
    const prints = all("[data-print]");
    const dialog = lookup("dialog");
    let openedFrom;
    filters.forEach((button) => button.addEventListener("click", () => {
      filters.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      prints.forEach((print) => { print.hidden = button.dataset.filter !== "all" && print.dataset.category !== button.dataset.filter; });
    }));
    prints.forEach((button) => button.addEventListener("click", () => {
      openedFrom = button;
      lookup("[data-print-art]").className = "print-art " + button.dataset.print;
      lookup("#print-title").textContent = button.textContent.trim();
      lookup("[data-print-description]").textContent = button.dataset.description;
      dialog.showModal();
    }));
    lookup("[data-close-print]").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => openedFrom?.focus());
  }
  if (recipe === "checkout-states") {
    const details = lookup("#details");
    const summary = lookup("#summary");
    const receipt = lookup("#receipt");
    const customer = lookup("#customer");
    const email = lookup("#email");
    const fields = [customer, email];
    function validate(field) {
      const valid = field.value.trim() && field.validity.valid;
      field.setAttribute("aria-invalid", String(!valid));
      lookup("#" + field.id + "-error").hidden = Boolean(valid);
      return valid;
    }
    fields.forEach((field) => field.addEventListener("input", () => {
      if (field.hasAttribute("aria-invalid")) validate(field);
    }));
    details.addEventListener("submit", (event) => {
      event.preventDefault();
      const invalid = fields.filter((field) => !validate(field));
      if (invalid.length) return invalid[0].focus();
      const delivery = lookup('input[name="delivery"]:checked').value;
      lookup("[data-details]").textContent = customer.value.trim() + " · " + email.value.trim() + " · " + (delivery === "pickup" ? "Pick up" : "Ship to me");
      details.hidden = true;
      summary.hidden = false;
      lookup("#summary h2").focus();
    });
    lookup("[data-edit]").addEventListener("click", () => {
      summary.hidden = true;
      details.hidden = false;
      customer.focus();
    });
    lookup("[data-confirm]").addEventListener("click", () => {
      summary.hidden = true;
      receipt.hidden = false;
      lookup("#receipt h2").focus();
    });
  }
  if (recipe === "responsive-navigation") {
    const menu = lookup("details");
    menu.addEventListener("click", (event) => {
      const link = event.target.closest("a[href^='#']");
      if (link) {
        menu.open = false;
        lookup(link.hash).focus({ preventScroll: true });
      }
    });
    menu.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && menu.open) {
        menu.open = false;
        lookup("summary").focus();
      }
    });
  }
})();
