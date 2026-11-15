import { describe, expect, it } from 'vitest';
import { createReviewAnchor, documentPointToCanvas, resolveReviewAnchor, viewportPointToDocument } from './review-anchors';
import type { BrowserCapture } from './review-browser';

const button = { selector: 'button:nth-child(1)', tag: 'button', text: 'Save', rect: { x: 30, y: 110, width: 60, height: 40 }, styles: {} };
const capture: BrowserCapture = {
  url: 'http://localhost/', title: 'Example', screenshot: 'saved',
  viewport: { width: 300, height: 200 }, document: { width: 300, height: 900, scrollX: 0, scrollY: 100 },
  components: [button], anchors: {},
};
describe('review anchors', () => {
  it.each([0.25, 0.67, 1, 2])('preserves document coordinates at scale %s', scale => {
    const transform = { scale, scrollX: 25, scrollY: 100, canvasOffset: { x: 12, y: 40 } };
    const canvas = { x: 12 + 50 * scale, y: 40 + 30 * scale };
    expect(viewportPointToDocument(canvas, transform)).toEqual({ x: 75, y: 130 });
    expect(documentPointToCanvas({ x: 75, y: 130 }, transform)).toEqual(canvas);
  });
  it('records the click within a component and rejects a reused selector with different meaning', () => {
    const anchor = createReviewAnchor({ point: { x: 45, y: 120 }, capture, revisionId: 'r1', kind: 'saved', component: button });
    expect(anchor.normalizedPoint).toEqual({ x: 0.25, y: 0.25 });
    expect(resolveReviewAnchor(anchor, capture, 'r1').status).toBe('exact');
    expect(resolveReviewAnchor(anchor, { ...capture, components: [{ ...button, text: 'Delete' }] }, 'r2').status).toBe('missing');
    expect(resolveReviewAnchor(anchor, { ...capture, components: [button, { ...button, selector: '#another' }] }, 'r2').status).toBe('ambiguous');
  });
  it('keeps coordinate-only pins on their original revision', () => {
    const anchor = createReviewAnchor({ point: { x: 200, y: 120 }, capture, revisionId: 'r1', kind: 'saved' });
    expect(anchor.kind).toBe('coordinate-only');
    expect(resolveReviewAnchor(anchor, capture, 'r2').status).toBe('historical');
  });
});
