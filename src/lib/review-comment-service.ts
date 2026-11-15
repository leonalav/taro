import type { VerifiedResolution } from './review-resolution';
import {
  addReviewComment, applyReviewResolution, previewById, replyToComment, resolveComment, reviewId, reviewScopeKey,
  type ReviewAnchor, type ReviewPreview, type ReviewRepository, type ReviewScope, type ReviewState, type ReviewThread,
} from './review-store';

interface MutationRequest { previewId: string; clientMutationId: string }
interface Author { body: string; author: string; role: string }
export interface PostReviewComment extends MutationRequest, Author { revisionId: string; anchor: ReviewAnchor }
interface ThreadMutation extends MutationRequest { threadId: string; expectedGeneration: number }
export interface ReplyReviewComment extends ThreadMutation, Author {}
export interface ReviewStatusChange extends ThreadMutation { resolved: boolean }
interface ReviewReplyAndStatus extends ReplyReviewComment { resolved: boolean }
export interface CommentSaveResult { threadId: string; saved: true; sync: 'complete' | 'pending'; warning?: string }
type Projection = (scope: ReviewScope, preview: ReviewPreview, thread: ReviewThread) => Promise<void>;

export function createReviewCommentService(repository: ReviewRepository, project: Projection) {
  const drains = new Map<string, Promise<void>>();

  async function drain(scope: ReviewScope) {
    await repository.load(scope);
    const pending = repository.snapshot(scope).state.projectionOutbox ?? [];
    for (const item of pending) {
      const state = repository.snapshot(scope).state;
      try {
        const preview = previewById(state, item.previewId);
        const thread = preview.threads.find(thread => thread.id === item.threadId);
        if (!thread) throw Error('Comment thread was not found.');
        await project(scope, preview, thread);
        await repository.change(scope, current => ({
          ...current, projectionOutbox: current.projectionOutbox?.filter(entry => entry.mutationId !== item.mutationId),
        }), { atomic: true });
      } catch (error) {
        await repository.change(scope, current => ({
          ...current,
          projectionOutbox: current.projectionOutbox?.map(entry => entry.mutationId === item.mutationId
            ? { ...entry, attempts: entry.attempts + 1, lastError: String(error) }
            : entry),
        }), { atomic: true }).catch(() => {});
      }
    }
  }

  function retrySync(scope: ReviewScope): Promise<void> {
    const key = reviewScopeKey(scope);
    const next = (drains.get(key) ?? Promise.resolve()).catch(() => {}).then(() => drain(scope));
    drains.set(key, next);
    return next.finally(() => { if (drains.get(key) === next) drains.delete(key); });
  }

  async function mutate(
    scope: ReviewScope, request: MutationRequest, operation: 'post' | 'reply' | 'status',
    apply: (state: ReviewState) => { state: ReviewState; threadId: string },
  ): Promise<CommentSaveResult> {
    if (!request.clientMutationId.trim() || request.clientMutationId.length > 200) throw Error('Invalid comment mutation ID.');
    const signature = JSON.stringify([operation, request], (_key, value: unknown) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
    });
    let threadId = '';
    await repository.change(scope, state => {
      const existing = state.commentMutations?.find(item => item.mutationId === request.clientMutationId);
      if (existing) {
        if (existing.signature !== signature) throw Error('This comment mutation ID is already in use.');
        threadId = existing.threadId;
        return state;
      }
      const updated = apply(state);
      threadId = updated.threadId;
      return {
        ...updated.state,
        commentMutations: [...state.commentMutations ?? [], { mutationId: request.clientMutationId, signature, threadId }],
        projectionOutbox: [...state.projectionOutbox ?? [], { mutationId: request.clientMutationId, previewId: request.previewId, threadId, operation, attempts: 0 }],
      };
    }, { atomic: true });
    await retrySync(scope);
    const pending = repository.snapshot(scope).state.projectionOutbox?.some(entry => entry.mutationId === request.clientMutationId);
    return pending
      ? { threadId, saved: true, sync: 'pending', warning: 'Comment saved. Task synchronization is pending.' }
      : { threadId, saved: true, sync: 'complete' };
  }

  function updateThread(scope: ReviewScope, request: ThreadMutation, operation: 'reply' | 'status', update: (state: ReviewState) => ReviewState) {
    return mutate(scope, request, operation, state => {
      const thread = previewById(state, request.previewId).threads.find(thread => thread.id === request.threadId);
      if (!thread) throw Error('Comment thread was not found in this preview.');
      if ((thread.generation ?? 0) !== request.expectedGeneration) throw Error('This comment changed. Reload the thread before retrying.');
      return { state: update(state), threadId: thread.id };
    });
  }

  return {
    post(scope: ReviewScope, request: PostReviewComment) {
      return mutate(scope, request, 'post', state => {
        const threadId = reviewId();
        return { threadId, state: addReviewComment(state, request.previewId, { ...request, id: threadId }) };
      });
    },
    reply(scope: ReviewScope, request: ReplyReviewComment) {
      const { body, author, role } = request;
      return updateThread(scope, request, 'reply', state => replyToComment(state, request.previewId, request.threadId, { body, author, role }));
    },
    replyAndSetStatus(scope: ReviewScope, request: ReviewReplyAndStatus) {
      const { body, author, role, resolved, previewId, threadId }=request;
      return updateThread(scope,request,'status',state=>resolveComment(replyToComment(state,previewId,threadId,{body,author,role}),previewId,threadId,resolved));
    },
    setStatus(scope: ReviewScope, request: ReviewStatusChange) {
      return updateThread(scope, request, 'status', state => resolveComment(state, request.previewId, request.threadId, request.resolved));
    },
    resolveVerified(scope:ReviewScope,resolution:VerifiedResolution) {
      return updateThread(scope,{previewId:resolution.target.previewId,threadId:resolution.sourceThreadId,clientMutationId:resolution.receiptId,expectedGeneration:resolution.sourceThreadGeneration},'status',state=>applyReviewResolution(state,resolution));
    },
    retrySync,
  };
}
