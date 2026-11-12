// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ReviewThreadCard, CommentComposer } from './review-comments';
import type { ReviewThread } from '@/lib/review-store';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let host:HTMLDivElement;let root:ReturnType<typeof createRoot>;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();});
const thread:ReviewThread={id:'t',revisionId:'r',resolved:false,anchor:{x:10,y:20},messages:[{id:'m',author:'Aria',role:'Designer',createdAt:1,body:'**Bold** *italic* `inline`\n\n```ts\nconst answer = 42;\n```\n\n<script>bad()</script>'}]};
describe('review thread formatting and actions',()=>{
  it('renders safe Markdown and retains the reply and resolve actions',async()=>{
    const resolve=vi.fn(),reply=vi.fn();
    await act(async()=>root.render(<ReviewThreadCard thread={thread} onResolve={resolve} onReply={reply}/>));
    expect(host.querySelector('.review-markdown strong')?.textContent).toBe('Bold');expect(host.querySelector('em')?.textContent).toBe('italic');
    expect(host.querySelector('code')?.textContent).toBe('inline');expect(host.querySelector('pre code')?.textContent).toContain('const answer = 42;');
    expect(host.querySelector('script')).toBeNull();
    await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Resolve')?.click());expect(resolve).toHaveBeenCalledWith(true);
    await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Reply')?.click());expect(host.querySelector('textarea')?.getAttribute('aria-label')).toBe('Reply to comment');
  });
  it('keeps unsent text when submission fails',async()=>{
    const save=vi.fn().mockRejectedValue(Error('Disk full'));
    await act(async()=>root.render(<CommentComposer onSubmit={save}/>));
    const area=host.querySelector('textarea')!;
    await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(area,'Keep my comment');area.dispatchEvent(new Event('input',{bubbles:true}));area.dispatchEvent(new Event('change',{bubbles:true}));});
    await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(save).toHaveBeenCalledWith('Keep my comment');expect(area.value).toBe('Keep my comment');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Disk full');
  });
});
