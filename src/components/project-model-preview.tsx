import * as React from "react";
import { Button } from "@/components/ui/button";
import { decodeGlbPreview } from "@/lib/glb-preview";
import { createGlbPreviewRenderer } from "@/lib/glb-preview-renderer";
import { projectAssetBlob, type AssetVariant, type ProjectAsset } from "@/lib/project-assets";

const startingAngle = -0.48;
const pitch = -0.22;

export function ProjectModelPreview({ root, asset, variant, fallback }: {
  root: string;
  asset: ProjectAsset;
  variant?: AssetVariant;
  fallback?: React.ReactNode;
}) {
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const angle = React.useRef(startingAngle);
  const draw = React.useRef<() => void>(null);
  const [status, setStatus] = React.useState<{ triangles: number; simplifiedMaterials: boolean }>();
  const [error, setError] = React.useState("");
  const file = variant?.file ?? asset.original;
  const failure = file.available ? error : "Project model file is missing or has changed.";

  React.useEffect(() => {
    const surface = canvas.current;
    if (!surface || !file.available) return;
    let active = true;
    let renderer: ReturnType<typeof createGlbPreviewRenderer> | undefined;
    let resize: ResizeObserver | undefined;
    const handleLoss = () => {
      draw.current = null;
      resize?.disconnect();
      setError("The graphics device lost the 3D preview.");
    };
    surface.addEventListener("webglcontextlost", handleLoss);
    void projectAssetBlob(root, asset, variant).then(blob => blob.arrayBuffer()).then(bytes => {
      if (!active) return;
      const geometry = decodeGlbPreview(bytes);
      renderer = createGlbPreviewRenderer(surface, geometry);
      draw.current = () => {
        const bounds = surface.getBoundingClientRect();
        if (bounds.width <= 0 || bounds.height <= 0) return;
        const density = Math.min(window.devicePixelRatio || 1, 2, 1200 / Math.max(bounds.width, bounds.height));
        const width = Math.max(1, Math.round(bounds.width * density));
        const height = Math.max(1, Math.round(bounds.height * density));
        if (surface.width !== width) surface.width = width;
        if (surface.height !== height) surface.height = height;
        renderer?.render(angle.current, pitch);
      };
      resize = new ResizeObserver(draw.current);
      resize.observe(surface);
      draw.current();
      setStatus({ triangles: geometry.triangles, simplifiedMaterials: geometry.simplifiedMaterials });
    }).catch(error => {
      if (active) setError(error instanceof Error ? error.message : String(error));
    });
    return () => {
      active = false;
      draw.current = null;
      surface.removeEventListener("webglcontextlost", handleLoss);
      resize?.disconnect();
      renderer?.dispose();
    };
  }, [root, asset, variant, file.available]);

  function setAngle(next: number) {
    angle.current = next % (2 * Math.PI);
    draw.current?.();
  }

  return <div className="overflow-hidden rounded-md border border-border bg-background">
    <canvas ref={canvas} hidden={!!failure} role="img" aria-label={`3D geometry preview of ${file.filename}`} className="block aspect-video max-h-80 w-full" />
    {failure ? <>
      <p className="px-3 py-2 text-center text-xs text-muted-foreground" role="status">{failure}</p>
      {fallback ?? <p className="px-3 pb-3 text-center text-xs text-muted-foreground">Add a preview image to show a rendered still.</p>}
    </> : status ? <>
      <div className="flex flex-wrap items-center gap-2 p-2">
        <Button variant="secondary" size="sm" onClick={() => setAngle(angle.current - Math.PI / 6)}>Rotate left</Button>
        <Button variant="secondary" size="sm" onClick={() => setAngle(angle.current + Math.PI / 6)}>Rotate right</Button>
        <Button variant="ghost" size="sm" onClick={() => setAngle(startingAngle)}>Reset view</Button>
        <span className="ml-auto text-xs text-muted-foreground">{status.triangles.toLocaleString()} {status.triangles === 1 ? "triangle" : "triangles"}</span>
      </div>
      {status.simplifiedMaterials && <p className="px-2 pb-2 text-xs text-muted-foreground">Showing simplified materials with flat base colors.</p>}
    </> : <p role="status" className="px-2 pb-2 text-xs text-muted-foreground">Loading model preview…</p>}
  </div>;
}
