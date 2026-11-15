import type { ChipRef } from '@/data/mentions';
import { resolveReviewAnchor, type ReviewAnchorV2 } from './review-anchors';
import { activeRevision, previewById, type ReviewRepository, type ReviewScope } from './review-store';
import type { RunRequest } from './adi/context';

export interface ReviewReference { scope: ReviewScope; previewId: string; revisionId: string; threadIds: string[] }

export async function loadReviewFeedback(reference: ReviewReference, repository: ReviewRepository) {
  await repository.load(reference.scope);
  const snapshot = repository.snapshot(reference.scope);
  if (!snapshot.loaded) throw Error(snapshot.error ?? 'Review data is unavailable.');
  const preview = previewById(snapshot.state, reference.previewId);
  const current = preview.revisions.at(-1)!;
  const original = preview.revisions.find(revision => revision.id === reference.revisionId);
  if (!original) throw Error('The referenced Review revision is missing.');
  const ids = [...new Set(reference.threadIds)];
  if (!ids.length || ids.length > 20) throw Error('Select between one and 20 Review threads.');
  const threads = ids.map(id => {
    const thread = preview.threads.find(thread => thread.id === id && thread.revisionId === original.id);
    if (!thread || thread.resolved) throw Error('The Review thread is closed or belongs to another revision.');
    const capture = current.observation && current.capture ? { ...current.observation, screenshot: current.capture } : undefined;
    const anchor = thread.anchor.version === 2 && capture
      ? resolveReviewAnchor(thread.anchor as ReviewAnchorV2, capture, current.id)
      : { status: original.id === current.id ? 'exact' : 'historical' };
    return {
      id: thread.id, generation: thread.generation ?? 0, anchor: thread.anchor, resolution: anchor,
      messages: [thread.messages[0], ...thread.messages.slice(1).slice(-7)].map(message => ({ ...message, body: message.body.slice(0, 3000) })),
      omittedMessages: Math.max(0, thread.messages.length - 8),
    };
  });
  return {
    reference, title: preview.title, workspaceAvailable: !!reference.scope.workspace,
    original: { id: original.id, createdAt: original.createdAt, captureId: original.observation?.captureId },
    current: { id: current.id, createdAt: current.createdAt, url: current.url, selected: activeRevision(preview).id === current.id },
    threads,
  };
}
export type ReviewFeedback = Awaited<ReturnType<typeof loadReviewFeedback>>;

export function buildReviewFixRequest(feedback: ReviewFeedback): RunRequest {
  return { text: 'Apply the requested fixes from Review to ' + feedback.title, referenceIds: feedback.reference.threadIds, reviewItem: feedback };
}
export async function queueReviewFix(reference: ReviewReference, target: 'composer' | 'task', repository: ReviewRepository) {
  const feedback = await loadReviewFeedback(reference, repository);
  if (target === 'task') {
    if (!feedback.workspaceAvailable) throw Error('Open a workspace before running a Review fix as a task.');
    if (reference.threadIds.length !== 1) throw Error('Open one Review task at a time.');
    return { reference, taskId: 'review:' + reference.scope.sessionId + ':' + reference.previewId + ':' + reference.threadIds[0] };
  }
  const chip: ChipRef = { id: 'review:' + reference.previewId + ':' + reference.threadIds.join(','), kind: 'review',
    label: 'Review · ' + feedback.title, review: reference };
  return { reference, chip };
}
