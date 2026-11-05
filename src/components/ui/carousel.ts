/**
 * Carrousel partagé (hero de l'accueil, diaporamas de section) : une racine
 * `[data-l4s-carousel]`, des diapositives `[data-slide]` (la visible porte
 * `data-active`), des pastilles `[data-goto]` et des flèches `[data-step]`.
 * Sans JavaScript, la première diapositive reste affichée.
 *
 * Défilement automatique seulement si la racine porte
 * `data-l4s-autoplay="<millisecondes>"` (le hero de l'accueil, choix de
 * Michael du 5 novembre 2026 ; les diaporamas de section restent manuels).
 * Il se met en pause au survol, quand le focus est dans le carrousel et quand
 * l'onglet est caché ; il s'arrête pour de bon dès que le visiteur choisit
 * une photo, et ne démarre jamais si le système demande moins d'animations.
 */
export function initCarousels(): void {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

    // Défilement automatique (optionnel).
    const delay = Number(root.dataset.l4sAutoplay);
    let timer: number | undefined;
    let stopped = reducedMotion || !(delay > 0);
    let hovered = false;
    let focused = false;

    const clear = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
    };
    const schedule = () => {
      clear();
      if (stopped || hovered || focused || document.hidden) return;
      timer = window.setTimeout(() => {
        // Précharge la suivante avant de l'afficher, pour un fondu sans trou.
        const next = slides[(index + 1) % slides.length];
        if (next instanceof HTMLImageElement && !next.complete) {
          next.loading = "eager";
          next.addEventListener("load", () => {
            show(index + 1);
            schedule();
          }, { once: true });
          return;
        }
        show(index + 1);
        schedule();
      }, delay);
    };
    const stop = () => {
      stopped = true;
      clear();
    };

    if (!stopped) {
      root.addEventListener("pointerenter", () => {
        hovered = true;
        clear();
      });
      root.addEventListener("pointerleave", () => {
        hovered = false;
        schedule();
      });
      root.addEventListener("focusin", () => {
        focused = true;
        clear();
      });
      root.addEventListener("focusout", () => {
        focused = false;
        schedule();
      });
      document.addEventListener("visibilitychange", schedule);
      schedule();
    }

    root.querySelectorAll<HTMLButtonElement>("[data-step]").forEach((b) =>
      b.addEventListener("click", () => {
        stop();
        show(index + Number(b.dataset.step));
      }),
    );
    dots.forEach((d) =>
      d.addEventListener("click", () => {
        stop();
        show(Number(d.dataset.goto));
      }),
    );
    // Flèches du clavier quand le focus est dans les commandes.
    root.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") {
        stop();
        show(index + 1);
      } else if (event.key === "ArrowLeft") {
        stop();
        show(index - 1);
      }
    });
  });
}
