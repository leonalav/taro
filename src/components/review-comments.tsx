import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Bold, Check, Code2, Italic, Link, List, MessageSquare, RotateCcw, Send, X } from 'lucide-react';
import { Avatar } from './ui/avatar';
import type { ReviewThread } from '@/lib/review-store';

export function ReviewMarkdown({body}:{body:string}) {
  return <div className="review-markdown"><ReactMarkdown remarkPlugins={[remarkGfm,remarkBreaks]} components={{a:({children,...props})=><a {...props} target="_blank" rel="noreferrer">{children}</a>}}>{body}</ReactMarkdown></div>;
}
export function CommentComposer({onSubmit,onCancel,label='Comment',submitLabel='Post comment'}:{onSubmit:(body:string)=>Promise<unknown>|unknown;onCancel?:()=>void;label?:string;submitLabel?:string}) {
  const [body,setBody]=React.useState(''),[preview,setPreview]=React.useState(false),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
  const area=React.useRef<HTMLTextAreaElement>(null);
  const format=(before:string,after=before,placeholder='text')=>{
    const element=area.current;if(!element)return;const start=element.selectionStart,end=element.selectionEnd;
    const selected=body.slice(start,end)||placeholder,next=body.slice(0,start)+before+selected+after+body.slice(end);
    setBody(next);setPreview(false);requestAnimationFrame(()=>{element.focus();element.setSelectionRange(start+before.length,start+before.length+selected.length);});
  };
  const submit=async()=>{if(!body.trim()||busy)return;setBusy(true);setError('');try{await onSubmit(body);setBody('');}catch(error){setError(String(error));}finally{setBusy(false);}};
  return <form className="review-composer" onSubmit={event=>{event.preventDefault();void submit();}}>
    <div className="review-format-toolbar" role="toolbar" aria-label="Comment formatting">
      <button type="button" aria-label="Bold" title="Bold (Ctrl+B)" onClick={()=>format('**')}><Bold/></button>
      <button type="button" aria-label="Italic" title="Italic (Ctrl+I)" onClick={()=>format('*')}><Italic/></button>
      <button type="button" aria-label="Inline code" title="Inline code" onClick={()=>format('`')}><Code2/></button>
      <button type="button" aria-label="Code block" title="Code block" onClick={()=>format('```\n','\n```','code')}>```</button>
      <button type="button" aria-label="Add link" title="Add link" onClick={()=>format('[','](https://example.com)')}><Link/></button>
      <button type="button" aria-label="Add list" title="Add list" onClick={()=>format('- ','')}><List/></button>
      <button type="button" className="review-preview-toggle" aria-pressed={preview} onClick={()=>setPreview(value=>!value)}>{preview?'Write':'Preview'}</button>
    </div>
    {preview?<div className="review-comment-preview">{body?<ReviewMarkdown body={body}/>:<span>Write a comment to preview its formatting.</span>}</div>:
      <textarea ref={area} aria-label={label} value={body} placeholder="Leave a recommendation…" rows={3} onInput={event=>setBody(event.currentTarget.value)} onChange={event=>setBody(event.target.value)} onKeyDown={event=>{
        if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();void submit();}
        if((event.ctrlKey||event.metaKey)&&['b','i'].includes(event.key.toLowerCase())){event.preventDefault();format(event.key.toLowerCase()==='b'?'**':'*');}
        event.stopPropagation();
      }}/>}
    {error&&<p role="alert" className="review-error">{error}</p>}
    <div className="review-composer-footer"><span>Markdown supported</span>{onCancel&&<button type="button" onClick={onCancel}>Cancel</button>}<button type="submit" className="review-primary" disabled={!body.trim()||busy}><Send/>{busy?'Saving…':submitLabel}</button></div>
  </form>;
}

export function ReviewThreadCard({thread,onReply,onResolve,onClose}:{thread:ReviewThread;onReply:(body:string)=>Promise<unknown>|unknown;onResolve:(resolved:boolean)=>Promise<unknown>|unknown;onClose?:()=>void}) {
  const [reply,setReply]=React.useState(false),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
  return <article className="review-thread" aria-label={`Comment by ${thread.messages[0].author}`}>
    {thread.messages.map((message,index)=><div key={message.id} className={index?'review-thread-reply':''}>
      <div className="review-thread-heading"><Avatar initials={message.author.slice(0,2).toUpperCase()} size="sm" tone={message.role==='Reviewer'?'sunset':'taro'}/><strong>{message.author}</strong><span title={message.role}>{message.role}</span><time dateTime={new Date(message.createdAt).toISOString()}>{new Date(message.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time>{index===0&&onClose&&<button type="button" aria-label="Close comment" onClick={onClose}><X/></button>}</div>
      <ReviewMarkdown body={message.body}/>
    </div>)}
    {thread.anchor.selector&&<div className="review-anchor-label" title={thread.anchor.selector}><Code2/>{thread.anchor.selector}</div>}
    {error&&<p role="alert" className="review-error">{error}</p>}
    <div className="review-thread-actions"><button type="button" onClick={()=>setReply(value=>!value)}><MessageSquare/>Reply</button><button type="button" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await onResolve(!thread.resolved);}catch(error){setError(String(error));}finally{setBusy(false);}}}>{thread.resolved?<RotateCcw/>:<Check/>}{thread.resolved?'Reopen':'Resolve'}</button>{thread.resolved&&<span>Resolved</span>}</div>
    {reply&&<CommentComposer label="Reply to comment" submitLabel="Reply" onCancel={()=>setReply(false)} onSubmit={async body=>{await onReply(body);setReply(false);}}/>}
  </article>;
}
