import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Bold, Check, Code2, Italic, Link, List, MessageSquare, RotateCcw, Send, X } from 'lucide-react';
import { Avatar } from './ui/avatar';
import type { ReviewThread } from '@/lib/review-store';
import './review.css';

export function ReviewMarkdown({body,className,inline=false}:{body:string;className?:string;inline?:boolean}) {
  return <div className={className?`review-markdown ${className}`:'review-markdown'}><ReactMarkdown remarkPlugins={[remarkGfm,remarkBreaks]} allowedElements={inline?['strong','em','del','code','br']:undefined} unwrapDisallowed={inline} components={{a:({children,...props})=><a {...props} target="_blank" rel="noreferrer">{children}</a>}}>{body}</ReactMarkdown></div>;
}
export function CommentComposer({onSubmit,onCancel,label='Comment',submitLabel='Post comment',autoFocus=false,compact=false}:{onSubmit:(body:string)=>Promise<unknown>|unknown;onCancel?:()=>void;label?:string;submitLabel?:string;autoFocus?:boolean;compact?:boolean}) {
  const [body,setBody]=React.useState(''),[preview,setPreview]=React.useState(false),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
  const area=React.useRef<HTMLTextAreaElement>(null),saving=React.useRef(false);
  React.useEffect(()=>{if(autoFocus)area.current?.focus({preventScroll:true});},[autoFocus]);
  const format=(before:string,after=before,placeholder='text')=>{
    const element=area.current;if(!element)return;const start=element.selectionStart,end=element.selectionEnd;
    const selected=body.slice(start,end)||placeholder,next=body.slice(0,start)+before+selected+after+body.slice(end);
    setBody(next);setPreview(false);requestAnimationFrame(()=>{element.focus();element.setSelectionRange(start+before.length,start+before.length+selected.length);});
  };
  const submit=async()=>{if(!body.trim()||saving.current)return;saving.current=true;setBusy(true);setError('');try{await onSubmit(body);setBody('');}catch(error){setError(String(error));}finally{saving.current=false;setBusy(false);}};
  return <form className={compact?'review-composer review-composer--compact':'review-composer'} onKeyDown={event=>{if(event.key==='Escape'&&onCancel&&!saving.current){event.preventDefault();onCancel();}}} onSubmit={event=>{event.preventDefault();void submit();}}>
    {!compact&&<div className="review-format-toolbar" role="toolbar" aria-label="Comment formatting">
      <button type="button" aria-label="Bold" title="Bold (Ctrl+B)" onClick={()=>format('**')}><Bold/></button>
      <button type="button" aria-label="Italic" title="Italic (Ctrl+I)" onClick={()=>format('*')}><Italic/></button>
      <button type="button" aria-label="Inline code" title="Inline code" onClick={()=>format('`')}><Code2/></button>
      <button type="button" aria-label="Code block" title="Code block" onClick={()=>format('```\n','\n```','code')}>```</button>
      <button type="button" aria-label="Add link" title="Add link" onClick={()=>format('[','](https://example.com)')}><Link/></button>
      <button type="button" aria-label="Add list" title="Add list" onClick={()=>format('- ','')}><List/></button>
      <button type="button" className="review-preview-toggle" aria-pressed={preview} onClick={()=>setPreview(value=>!value)}>{preview?'Write':'Preview'}</button>
    </div>}
    {preview?<div className="review-comment-preview">{body?<ReviewMarkdown body={body}/>:<span>Write a comment to preview its formatting.</span>}</div>:
      <textarea ref={area} aria-label={label} value={body} placeholder={compact?'Add a comment…':'Leave a recommendation…'} rows={compact?2:3} onInput={event=>setBody(event.currentTarget.value)} onChange={event=>setBody(event.target.value)} onKeyDown={event=>{
        if(event.key==='Escape'||event.nativeEvent.isComposing)return;
        if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();void submit();}
        if((event.ctrlKey||event.metaKey)&&['b','i'].includes(event.key.toLowerCase())){event.preventDefault();format(event.key.toLowerCase()==='b'?'**':'*');}
        event.stopPropagation();
      }}/>}
    {error&&<p role="alert" className="review-error">{error}</p>}
    {compact?<div className="review-composer-actions">
      {onCancel&&<button type="button" aria-label="Cancel comment" title="Cancel comment" disabled={busy} onClick={onCancel}><X/></button>}
      <button type="submit" className="review-primary" aria-label={busy?'Saving comment':submitLabel} title={submitLabel} disabled={!body.trim()||busy}><Send/></button>
    </div>:<div className="review-composer-footer"><span>Markdown supported</span>{onCancel&&<button type="button" onClick={onCancel}>Cancel</button>}<button type="submit" className="review-primary" disabled={!body.trim()||busy}><Send/>{busy?'Saving…':submitLabel}</button></div>}
  </form>;
}

export function ReviewThreadCard({thread,onReply,onResolve,onClose,onHandoff,canOpenTask}:{thread:ReviewThread;onHandoff?:(target:'composer'|'task')=>Promise<void>;canOpenTask?:boolean;onReply:(body:string)=>Promise<unknown>|unknown;onResolve:(resolved:boolean)=>Promise<unknown>|unknown;onClose?:()=>void}) {
  const [reply,setReply]=React.useState(false),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
  const handoff=(target:'composer'|'task')=>{setError('');void onHandoff?.(target).catch(error=>setError(String(error)));};
  return <article className="review-thread" aria-label={`Comment by ${thread.messages[0].author}`}>
    {thread.messages.map((message,index)=><div key={message.id} className={index?'review-thread-reply':''}>
      <div className="review-thread-heading"><Avatar initials={message.author.slice(0,2).toUpperCase()} size="sm" tone={message.role==='Reviewer'?'sunset':'taro'}/><strong>{message.author}</strong><span title={message.role}>{message.role}</span><time dateTime={new Date(message.createdAt).toISOString()}>{new Date(message.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time>{index===0&&onClose&&<button type="button" aria-label="Close comment" onClick={onClose}><X/></button>}</div>
      <ReviewMarkdown body={message.body}/>
    </div>)}
    {thread.anchor.selector&&<div className="review-anchor-label" title={thread.anchor.selector}><Code2/>{thread.anchor.selector}</div>}
    {error&&<p role="alert" className="review-error">{error}</p>}
    <div className="review-thread-actions"><button type="button" onClick={()=>setReply(value=>!value)}><MessageSquare/>Reply</button><button type="button" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await onResolve(!thread.resolved);}catch(error){setError(String(error));}finally{setBusy(false);}}}>{thread.resolved?<RotateCcw/>:<Check/>}{thread.resolved?'Reopen':'Resolve'}</button>{thread.resolved&&<span>{thread.resolution?"Verified fix":"Manually resolved"}</span>}{!thread.resolved&&onHandoff&&<><button type="button" onClick={()=>handoff('composer')}>Send to agent</button>{canOpenTask&&<button type="button" onClick={()=>handoff('task')}>Open task</button>}</>}</div>
    {reply&&<CommentComposer label="Reply to comment" submitLabel="Reply" onCancel={()=>setReply(false)} onSubmit={async body=>{await onReply(body);setReply(false);}}/>}
  </article>;
}
