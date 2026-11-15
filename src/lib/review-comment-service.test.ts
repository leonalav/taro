import { describe, expect, it, vi } from 'vitest';
import { createReviewCommentService } from './review-comment-service';
import { addPreview, createReviewRepository, previewById } from './review-store';

const scope = { workspace: '/demo', sessionId: 's' };
const post = { previewId: 'p', revisionId: 'r', clientMutationId: 'post-1', body: 'Fix the label', author: 'User', role: 'Reviewer', anchor: { x: 1, y: 2 } };

async function setup() {
  let persisted: string | null = null;
  const storage = { read: async () => persisted, write: vi.fn(async (_: string, value: string) => { persisted = value; }) };
  const repository = createReviewRepository(storage);
  await repository.change(scope, state => addPreview(state, { id: 'p', revisionId: 'r', title: 'Preview', kind: 'url' }));
  return { storage, repository };
}

describe('Review comment persistence', () => {
  it('deduplicates a simultaneous post and retries task projection after a reload', async () => {
    const { storage, repository } = await setup();
    const fail = vi.fn(async () => { throw Error('Tasks offline'); });
    const service = createReviewCommentService(repository, fail);
    const [first, second] = await Promise.all([service.post(scope, post), service.post(scope, post)]);
    expect(first).toMatchObject({ saved: true, sync: 'pending' });
    expect(second.threadId).toBe(first.threadId);
    expect(previewById(repository.snapshot(scope).state, 'p').threads).toHaveLength(1);

    const restarted = createReviewRepository(storage);
    const sync = vi.fn(async () => {});
    await createReviewCommentService(restarted, sync).retrySync(scope);
    expect(sync).toHaveBeenCalledTimes(1);
    const result = await createReviewCommentService(restarted, sync).post(scope, post);
    expect(result).toMatchObject({ threadId: first.threadId, sync: 'complete' });
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('preserves the previous state after a failed Review write and accepts the same request on retry', async () => {
    const { storage, repository } = await setup();
    const sync = vi.fn(async () => {});
    const service = createReviewCommentService(repository, sync);
    storage.write.mockRejectedValueOnce(Error('Disk full'));
    await expect(service.post(scope, post)).rejects.toThrow('Disk full');
    expect(previewById(repository.snapshot(scope).state, 'p').threads).toHaveLength(0);
    expect(sync).toHaveBeenCalledTimes(0);
    await expect(service.post(scope, post)).resolves.toMatchObject({ sync: 'complete' });
  });

  it('deduplicates replies and rejects a competing stale status change', async () => {
    const { repository } = await setup();
    const service = createReviewCommentService(repository, async () => {});
    const { threadId } = await service.post(scope, post);
    const reply = { previewId: 'p', threadId, clientMutationId: 'reply-1', expectedGeneration: 0, body: 'Checking it', author: 'Agent', role: 'Designer' };
    await service.reply(scope, reply);
    await service.reply(scope, reply);
    await expect(service.setStatus(scope, { ...reply, clientMutationId: 'close-1', resolved: true })).rejects.toThrow('changed');
    expect(previewById(repository.snapshot(scope).state, 'p').threads[0].messages).toHaveLength(2);
  });
});
