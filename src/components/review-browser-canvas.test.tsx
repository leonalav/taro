// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewBrowserCanvas } from './review-browser-canvas';
import { addPreview, previewById, revisePreview } from '@/lib/review-store';

const { request, add } = vi.hoisted(() => ({ request: vi.fn(), add: vi.fn() }));
vi.mock('@/lib/review-browser', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/review-browser')>(),
  requestReviewBrowser: request,
}));
vi.mock('./review-state', () => ({ useReviewComments: () => ({ add }) }));

it('opens and focuses an annotation on a historical capture without connecting to the browser', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const viewport = { width: 300, height: 200 };
  const state = revisePreview(addPreview({ version: 1, previews: [] }, {
    id: 'p', revisionId: 'old', title: 'Example', kind: 'url', viewport,
    capture: 'data:image/png;base64,AA',
    observation: { url: 'https://example.com/', title: 'Example', viewport, document: { ...viewport, scrollX: 0, scrollY: 0 }, anchors: {}, components: [] },
  }), 'p', { url: 'https://example.com/' }, 'new');
  try {
    await act(async () => root.render(<ReviewBrowserCanvas scope={{ workspace: '/tmp', sessionId: 's' }}
      preview={{ ...previewById(state, 'p'), revisionId: 'old' }} onComments={() => {}} />));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Annotate component"]')!.click());
    const surface = host.querySelector<HTMLElement>('[aria-label="Browser preview viewport"]')!;
    await act(async () => surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(host.querySelector('textarea')).toBe(document.activeElement);
    expect(host.querySelector('.review-body > .review-comment-bubble textarea')).toBe(document.activeElement);
    expect(host.querySelector('.review-side-panel')).toBeNull();
    expect(host.querySelector('[aria-label="Comment formatting"]')).toBeNull();
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(host.querySelector('textarea')).toBeNull();
    expect(document.activeElement).toBe(surface);
    await act(async () => surface.dispatchEvent(new MouseEvent('click', { clientX: 10, clientY: 5, bubbles: true })));
    const textarea=host.querySelector('textarea')!;
    expect(textarea).toBe(document.activeElement);
    await act(async()=>{
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(textarea,'Check **contrast**');
      textarea.dispatchEvent(new Event('input',{bubbles:true}));
    });
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Post comment"]')!.click());
    expect(add).toHaveBeenCalledWith('Check **contrast**',expect.objectContaining({version:2}));
    expect(host.querySelector('.review-comment-bubble')).toBeNull();
    expect(document.activeElement).toBe(surface);
    expect(request).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
