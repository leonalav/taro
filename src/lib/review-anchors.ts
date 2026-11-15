import type { BrowserCapture } from './review-browser';
import type { ReviewAnchor, ReviewComponent, ReviewRect, Viewport } from './review-store';

export interface Point { x: number; y: number }
export interface PreviewTransform { scale: number; scrollX: number; scrollY: number; canvasOffset: Point }
export interface ReviewAnchorV2 extends ReviewAnchor {
  version: 2;
  revisionId: string;
  viewport: Viewport;
  scroll: Point;
  captureId?: string;
  kind: 'live' | 'saved' | 'coordinate-only';
  fingerprint?: string;
  normalizedPoint?: Point;
}
interface AnchorInput {
  point: Point;
  capture: BrowserCapture;
  revisionId: string;
  kind: 'live' | 'saved';
  component?: ReviewComponent;
}
export type AnchorResolution =
  | { status: 'exact'; rect?: ReviewRect }
  | { status: 'missing' | 'historical' }
  | { status: 'ambiguous'; candidates: ReviewComponent[] };

export function viewportPointToDocument(point: Point, transform: PreviewTransform): Point {
  return {
    x: (point.x - transform.canvasOffset.x) / transform.scale + transform.scrollX,
    y: (point.y - transform.canvasOffset.y) / transform.scale + transform.scrollY,
  };
}

export function documentPointToCanvas(point: Point, transform: PreviewTransform): Point {
  return {
    x: (point.x - transform.scrollX) * transform.scale + transform.canvasOffset.x,
    y: (point.y - transform.scrollY) * transform.scale + transform.canvasOffset.y,
  };
}

const fingerprint = (component: ReviewComponent) => JSON.stringify([
  component.layerId ?? '', component.tag, component.text.trim().replace(/\s+/g, ' '),
]);

export function capturedComponentAt(capture: BrowserCapture, point: Point): ReviewComponent | undefined {
  return capture.components.reduce<ReviewComponent | undefined>((smallest, component) => {
    const { x, y, width, height } = component.rect;
    if (width <= 0 || height <= 0 || point.x < x || point.y < y || point.x >= x + width || point.y >= y + height) return smallest;
    return !smallest || width * height <= smallest.rect.width * smallest.rect.height ? component : smallest;
  }, undefined);
}

export function createReviewAnchor({ point, capture, revisionId, kind, component }: AnchorInput): ReviewAnchorV2 {
  const rect = component?.rect;
  return {
    ...point, version: 2, revisionId, viewport: capture.viewport,
    scroll: { x: capture.document.scrollX, y: capture.document.scrollY },
    captureId: capture.captureId,
    kind: component ? kind : 'coordinate-only',
    selector: component?.selector,
    fingerprint: component && fingerprint(component),
    normalizedPoint: rect && rect.width > 0 && rect.height > 0 ? {
      x: Math.max(0, Math.min(1, (point.x - rect.x) / rect.width)),
      y: Math.max(0, Math.min(1, (point.y - rect.y) / rect.height)),
    } : undefined,
  };
}

export function resolveReviewAnchor(anchor: ReviewAnchorV2, capture: BrowserCapture, revisionId: string): AnchorResolution {
  if (!anchor.fingerprint) return { status: revisionId === anchor.revisionId ? 'exact' : 'historical' };
  const candidates = capture.components.filter(component => fingerprint(component) === anchor.fingerprint);
  if (revisionId === anchor.revisionId) {
    const original = candidates.find(component => component.selector === anchor.selector);
    if (original) return { status: 'exact', rect: original.rect };
  }
  if (candidates.length > 1) return { status: 'ambiguous', candidates };
  if (!candidates.length) return { status: 'missing' };
  return { status: 'exact', rect: candidates[0].rect };
}
