import { taskRepository } from './task-persistence';
import { createTask, type TaskRepository } from './task-store';
import type { ReviewPreview, ReviewScope, ReviewThread } from './review-store';
import { workspaceRuleKey } from './workspace-preferences';

export async function syncReviewWorkItem(
  scope: ReviewScope,
  preview: ReviewPreview,
  thread: ReviewThread,
  tasks: TaskRepository = taskRepository,
) {
  if (!scope.workspace || preview.kind === 'nike') return;
  const workspace = workspaceRuleKey(scope.workspace, 'taro');
  const id = `review:${scope.sessionId}:${preview.id}:${thread.id}`;
  const description = thread.messages[0].body;
  const item = { scope, previewId: preview.id, revisionId: thread.revisionId, threadId: thread.id, anchor: thread.anchor, resolved: thread.resolved };
  await tasks.change(workspace, current => {
    if (current.some(entry => entry.id === id)) {
      return current.map(entry => entry.id === id ? { ...entry, reviewItem: { ...entry.reviewItem, ...item } } : entry);
    }
    const title = `Review ${preview.title}`.slice(0, 180);
    return [{ ...createTask(title, id), description, details: description, tags: ['Review'], reviewItem: item }, ...current];
  });
}
