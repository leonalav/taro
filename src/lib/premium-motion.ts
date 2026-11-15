import * as React from "react";
import { gsap } from "gsap";

/** True when the user asked the OS for reduced motion. */
export function systemPrefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function finePointer() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: fine)").matches
  );
}

/**
 * One-shot entrance choreography, scoped to `scope`.
 * Every tween clears its inline styles once it settles so hover/focus CSS
 * (and the reduced-motion fallback) always wins afterwards.
 */
export function useEntranceChoreography(
  scope: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  build: (timeline: gsap.core.Timeline) => void,
) {
  const buildRef = React.useRef(build);
  buildRef.current = build;

  React.useLayoutEffect(() => {
    const root = scope.current;
    if (!root || !enabled || systemPrefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      const timeline = gsap.timeline({
        defaults: { duration: 0.72, ease: "power3.out", clearProps: "opacity,transform,filter" },
      });
      buildRef.current(timeline);
    }, root);

    return () => ctx.revert();
  }, [scope, enabled]);
}

/**
 * Slow violet light that trails the pointer inside `scope`.
 * Pointer-fine devices only, and fully skipped for reduced motion.
 */
export function useCursorGlow(
  scope: React.RefObject<HTMLElement | null>,
  targetSelector: string,
  enabled: boolean,
) {
  React.useEffect(() => {
    const root = scope.current;
    if (!root || !enabled || !finePointer() || systemPrefersReducedMotion()) return;

    const target = root.querySelector<HTMLElement>(targetSelector);
    if (!target) return;

    const moveX = gsap.quickTo(target, "x", { duration: 0.7, ease: "power3" });
    const moveY = gsap.quickTo(target, "y", { duration: 0.7, ease: "power3" });

    const onMove = (event: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      gsap.to(target, { opacity: 1, duration: 0.45, overwrite: "auto" });
      moveX(event.clientX - rect.left);
      moveY(event.clientY - rect.top);
    };
    const onLeave = () => {
      gsap.to(target, { opacity: 0, duration: 0.6, overwrite: "auto" });
    };

    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerleave", onLeave);
    return () => {
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      gsap.killTweensOf(target);
    };
  }, [scope, targetSelector, enabled]);
}

/** Feeds pointer position into CSS custom properties for the hover spotlight. */
export function trackSpotlight(event: React.PointerEvent<HTMLElement>) {
  const element = event.currentTarget;
  const rect = element.getBoundingClientRect();
  element.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
  element.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
}
