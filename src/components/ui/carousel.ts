/**
 * Carrousel manuel partagé (hero de l'accueil, diaporamas de section) : une
 * racine `[data-l4s-carousel]`, des diapositives `[data-slide]` (la visible
 * porte `data-active`), des pastilles `[data-goto]` et des flèches
 * `[data-step]`. Pas de défilement automatique ; sans JavaScript, la première
 * diapositive reste affichée.
 */
export function initCarousels(): void {
  document.querySelectorAll<HTMLElement>("[data-l4s-carousel]").forEach((root) => {
    if (root.dataset.l4sCarouselReady) return;
    root.dataset.l4sCarouselReady = "1";
    const slides = Array.from(root.querySelectorAll<HTMLElement>("[data-slide]"));
    const dots = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-goto]"));
    if (slides.length < 2) return;
    let index = 0;

    const show = (next: number) => {
      index = (next + slides.length) % slides.length;
      slides.forEach((s, i) => {
        const on = i === index;
        s.toggleAttribute("data-active", on);
        // La photo visible est lue par les lecteurs d'écran, les autres non.
        if (on) s.removeAttribute("aria-hidden");
        else s.setAttribute("aria-hidden", "true");
        // Une photo paresseuse se charge dès qu'on la demande.
        if (on && s instanceof HTMLImageElement) s.loading = "eager";
      });
      dots.forEach((d, i) => d.setAttribute("aria-current", String(i === index)));
    };

    root.querySelectorAll<HTMLButtonElement>("[data-step]").forEach((b) =>
      b.addEventListener("click", () => show(index + Number(b.dataset.step))),
    );
    dots.forEach((d) => d.addEventListener("click", () => show(Number(d.dataset.goto))));
    // Flèches du clavier quand le focus est dans les commandes.
    root.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") show(index + 1);
      else if (event.key === "ArrowLeft") show(index - 1);
    });
  });
}
