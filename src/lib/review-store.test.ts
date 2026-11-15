import { describe, expect, it } from 'vitest';
import { addPreview, addReviewComment, createReviewRepository, replyToComment, resolveComment, revisePreview, validateViewport, type ReviewStorage } from './review-store';

function fixture() {
  const saved = new Map<string, string>();
  let fail = false;
  const storage: ReviewStorage = { read: async key => saved.get(key) ?? null, write: async (key, value) => { if (fail) throw Error('disk full'); saved.set(key, value); } };
  return { saved, storage, repo: createReviewRepository(storage), fail: (value: boolean) => { fail = value; } };
}
const scope = { workspace: 'A:/project', sessionId: 'one' };
describe('durable review artifacts', () => {
  it('isolates sessions and retains byte-exact HTML in every immutable revision', async () => {
    const {repo,storage} = fixture();
    const html = '<!doctype html>\r\n<h1>日本語 &amp; original</h1>\n';
    await repo.change(scope, state => addPreview(state, {id:'p',title:'Original',kind:'html',html}));
    const first = repo.snapshot(scope).state.previews[0].revisions[0];
    await repo.change(scope, state => revisePreview(state, 'p', {html:'<h1>Revised</h1>'}));
    const fresh = createReviewRepository(storage); await fresh.load(scope);
    expect(fresh.snapshot(scope).state.previews[0].revisions).toHaveLength(2);
    expect(fresh.snapshot(scope).state.previews[0].revisions[0]).toEqual(first);
    expect(first.html).toBe(html);
    await repo.load({...scope,sessionId:'two'});
    expect(repo.snapshot({...scope,sessionId:'two'}).state.previews).toEqual([]);
  });
  it('serializes concurrent comments and preserves replies through resolve and reopen', async () => {
    const {repo,storage}=fixture();
    await repo.change(scope, state => addPreview(state,{id:'p',title:'Page',kind:'html',html:'<p>hello</p>'}));
    const comment = (id: string) => (state: Parameters<typeof addReviewComment>[0]) => addReviewComment(state,'p',{id,body:'**Bold** *italic* `code`\n\n```ts\nconst x = 1;\n```',author:'Aria',role:'Designer',anchor:{x:20,y:30,selector:'p'}});
    await Promise.all([repo.change(scope,comment('a')),repo.change(scope,comment('b'))]);
    await repo.change(scope,state=>replyToComment(state,'p','a',{body:'Reply',author:'You',role:'Reviewer'}));
    await repo.change(scope,state=>resolveComment(state,'p','a',true));
    await repo.change(scope,state=>resolveComment(state,'p','a',false));
    const fresh=createReviewRepository(storage);await fresh.load(scope);
    const threads=fresh.snapshot(scope).state.previews[0].threads;
    expect(threads).toHaveLength(2);expect(threads[0].messages).toHaveLength(2);
    expect(threads[0].messages[0].body).toContain('```ts');expect(threads[0].resolved).toBe(false);
  });
  it('retains pending changes after save failures and retries without dropping subsequent changes', async()=>{
    const f=fixture();await f.repo.load(scope);f.fail(true);
    await expect(f.repo.change(scope,state=>addPreview(state,{id:'p',title:'Unsaved',kind:'html',html:'original'}))).rejects.toThrow('disk full');
    expect(f.repo.snapshot(scope).state.previews).toHaveLength(1);
    expect(f.repo.snapshot(scope).error).toContain('disk full');
    expect(f.saved.size).toBe(0);f.fail(false);await f.repo.retrySave(scope);
    const fresh=createReviewRepository(f.storage);await fresh.load(scope);
    expect(fresh.snapshot(scope).state.previews[0].revisions[0].html).toBe('original');
  });
  it('never overwrites unreadable saved data',async()=>{
    let writes=0;const repo=createReviewRepository({read:async()=>'{broken',write:async()=>{writes++;}});
    await repo.load(scope);expect(repo.snapshot(scope).loaded).toBe(false);
    await expect(repo.change(scope,state=>state)).rejects.toThrow(/saved review/i);expect(writes).toBe(0);
  });
  it('rejects invalid viewport values and foreign preview/thread identities',()=>{
    for(const width of [NaN,Infinity,0,-1,99,4097,1.5])expect(()=>validateViewport({width,height:800})).toThrow();
    expect(validateViewport({width:393,height:852})).toEqual({width:393,height:852});
    expect(()=>resolveComment({version:1,previews:[]},'foreign','thread',true)).toThrow(/preview/i);
  });
});
