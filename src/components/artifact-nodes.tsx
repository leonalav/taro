import { cn } from "@/utils/cn";

/**
 * Faint node lattice used by artifact sheets. Mirrors the numbered hexagon
 * diagram in the supplied artifact reference: purely decorative, never
 * announced, and drawn behind content at low opacity.
 */
export function ArtifactNodes({ className }: { className?: string }) {
  const hex = (cx: number, cy: number, r: number) => {
    const points = Array.from({ length: 6 }, (_, index) => {
      const angle = (Math.PI / 3) * index - Math.PI / 6;
      return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`;
    });
    return points.join(" ");
  };
  return (
    <svg
      className={cn("artifact-sheet__nodes", className)}
      viewBox="0 0 132 168"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g stroke="currentColor" strokeWidth="0.8">
        <polygon points={hex(96, 34, 15)} />
        <polygon points={hex(118, 62, 15)} />
        <polygon points={hex(92, 82, 11)} />
        <polygon points={hex(114, 112, 14)} />
        <polygon points={hex(88, 136, 9)} />
        <path d="M104 45 112 52M104 90 110 100M100 123 96 130" strokeDasharray="2 3" />
      </g>
      <g fill="currentColor">
        <circle cx="96" cy="34" r="1.3" />
        <circle cx="118" cy="62" r="1.3" />
        <circle cx="92" cy="82" r="1.1" />
        <circle cx="114" cy="112" r="1.3" />
        <circle cx="88" cy="136" r="1.1" />
      </g>
    </svg>
  );
}
