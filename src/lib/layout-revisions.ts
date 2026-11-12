import { layoutSvg, type SavedLayout } from './layout-designer';
import { activeRevision, addPreview, previewById, revisePreview, reviewId, selectPreview, type ReviewRepository, type ReviewScope } from './review-store';

export async function saveLayoutRevision(
  repository: ReviewRepository, scope: ReviewScope, previewId: string, layout: SavedLayout, expected?: string,
) {
  const revisionId = reviewId();
  const svg = layoutSvg(layout.layers, { width: layout.width, height: layout.height });
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Layout draft</title><style>body{margin:0;background:#111;color:#eee}svg{display:block;max-width:100%;height:auto}</style><main aria-label="Layout draft">${svg}</main></html>`;
  await repository.change(scope, state => {
    const previous = state.previews.find(preview => preview.id === previewId);
    if (!previous) {
      if (expected) throw Error('The original layout revision is unavailable.');
      return addPreview(state, { id: previewId, revisionId, kind: 'html', title: layout.title, html, layout });
    }
    if (previous.revisionId !== expected) throw Error('The layout changed while it was open. Reopen it before saving.');
    return selectPreview(revisePreview(state, previewId, { html, layout }, revisionId), previewId, revisionId);
  });
  return revisionId;
}

export async function undoLayoutRevision(repository: ReviewRepository, scope: ReviewScope, previewId: string, expected: string) {
  await repository.change(scope, state => {
    const preview = previewById(state, previewId);
    if (preview.revisionId !== expected) throw Error('The layout changed while it was open. Reopen it before restoring.');
    const index = preview.revisions.findIndex(revision => revision.id === expected);
    const previous = preview.revisions.slice(0, index).reverse().find(revision => revision.layout);
    if (!previous) throw Error('There is no earlier saved layout.');
    return selectPreview(state, previewId, previous.id);
  });
  return activeRevision(previewById(repository.snapshot(scope).state, previewId));
}
