import * as React from 'react';
import {ChevronDown,FileText,Globe,LoaderCircle,Search} from 'lucide-react';
import type {ToolActivity} from '@/data/mock';
import {safeIcon,safeWebUrl,webLabel} from '@/lib/web-research';
import {cn} from '@/utils/cn';
import {isTauri,invoke} from '@tauri-apps/api/core';

function retrievalTime(value:string):string{
 const unix=value.match(/^Unix time (\d+) UTC$/);
 const date=new Date(unix?Number(unix[1])*1000:value);
 return Number.isFinite(date.getTime())?`Retrieved ${date.toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}`:value;
}

function SiteIcon({src}:{src?:string}){
 const [failed,setFailed]=React.useState(false);React.useEffect(()=>setFailed(false),[src]);
 const icon=safeIcon(src);
 return icon&&!failed?<img src={icon} onError={()=>setFailed(true)} alt="" className="size-4 shrink-0 rounded-sm object-contain"/>:<Globe aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5}/>;
}
export function WebResearchRow({activity}:{activity:ToolActivity}){
 const [linkError,setLinkError]=React.useState('');
 const initialOpen=React.useRef<boolean|undefined>(undefined);
 const openLink=async(event:React.MouseEvent<HTMLAnchorElement>,url:string)=>{if(!isTauri())return;event.preventDefault();setLinkError('');try{await invoke('open_web_link',{url});}catch(error){setLinkError(`Could not open source: ${String(error)}`);}};
 const web=activity.web;if(!web)return null;
 const running=activity.status==='running'||activity.status==='queued';
 const failed=activity.status==='failed';
 const success=activity.status==='done'||activity.status==='succeeded';
 const stopped=activity.status==='stopped'||activity.status==='interrupted';
 const Icon=running?LoaderCircle:web.kind==='web-search'?Search:FileText;
 if(initialOpen.current===undefined)initialOpen.current=running||failed||(web.kind==='web-search'&&success&&web.sources.length===0);
 const destination=web.kind==='web-fetch'?safeWebUrl(web.finalUrl):undefined;
 return <details open={initialOpen.current} data-web-research={web.kind} className="group/web my-1.5 min-w-0 overflow-hidden rounded-lg border border-[#24242b] bg-[#0e0e12]">
  <summary className="flex min-w-0 cursor-pointer list-none items-center gap-2 px-3 py-2.5 font-mono text-[11px] hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#dcc6ff] [&::-webkit-details-marker]:hidden">
   <Icon aria-hidden="true" className={cn('size-3.5 shrink-0 text-muted-foreground',running&&'animate-spin motion-reduce:animate-none')} strokeWidth={1.75}/>
   <span className={cn('min-w-0 flex-1 truncate',failed?'text-destructive':'text-foreground/85')} title={webLabel(web,activity.status)}>{webLabel(web,activity.status)}</span>
   <span className="shrink-0 text-[10px] text-muted-foreground">{running?'Running':failed?'Failed':stopped?'Stopped':'Completed'}</span>
   <ChevronDown aria-hidden="true" className="size-3 shrink-0 text-muted-foreground group-open/web:rotate-180"/>
  </summary>
  <div className="min-w-0 border-t border-[#1f1f25] px-3 py-2">
   {web.kind==='web-search'?<>
    <p className="mb-1 break-words text-[11px] leading-5 text-muted-foreground">{web.query} <span aria-hidden="true">·</span> DuckDuckGo</p>
    <div className="scrollbar-thin max-h-80 min-w-0 overflow-y-auto overflow-x-hidden">
     {web.sources.map((source,index)=>{
      const href=safeWebUrl(source.url);
      const content=<><SiteIcon src={source.iconDataUrl}/><span className="min-w-0 flex-1"><span className="block truncate text-xs text-foreground/85">{source.title}</span><span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{source.displayUrl}</span></span>{source.read&&<span className="shrink-0 text-[10px] text-success">Read</span>}</>;
      const cls='flex min-w-0 items-center gap-2.5 rounded-md px-1 py-2';
      return href?<a key={`${source.url}:${index}`} href={href} onClick={event=>{void openLink(event,href);}} title={href} aria-label={`${source.title} — ${href}${source.read?' — Read':''}`} target="_blank" rel="noopener noreferrer" className={cn(cls,'hover:bg-white/[0.035] focus-visible:outline-2 focus-visible:outline-taro')}>{content}</a>:<div key={index} className={cls}>{content}</div>;
     })}
    </div>
    {success&&web.sources.length===0&&<p className="py-2 text-xs text-muted-foreground">No sources found. Try a more specific query.</p>}
   </>:<>
    {destination&&<a href={destination} onClick={event=>{void openLink(event,destination);}} target="_blank" rel="noopener noreferrer" title={destination} className="mb-2 flex min-w-0 items-center gap-2 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-taro"><SiteIcon src={web.iconDataUrl}/><span className="truncate">{destination.replace(/^https?:\/\//,'')}</span></a>}
    {web.content&&<pre className="scrollbar-thin max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background p-2 text-xs leading-5 text-foreground/80 [overflow-wrap:anywhere] font-sans">{web.content}</pre>}
    {success&&<p className="mt-2 text-[10px] text-muted-foreground">{web.truncated?`Partial page · next offset ${web.nextOffset}`:`${web.totalCharacters.toLocaleString()} characters`} {web.retrievedAt&&`· ${retrievalTime(web.retrievedAt)}`}</p>}
   </>}
   {running&&<p className="py-1 text-xs text-muted-foreground" role="status">{web.kind==='web-search'?'Waiting for DuckDuckGo results…':'Fetching readable page text…'}</p>}
   {activity.errorTrace&&<p role="status" className={cn('py-1 text-xs leading-5 break-words',failed?'text-destructive':'text-muted-foreground')}>{activity.errorTrace}</p>}
   {stopped&&!activity.errorTrace&&<p className="py-1 text-xs text-muted-foreground">The request was stopped.</p>}
   {linkError&&<p role="alert" className="py-1 text-xs text-destructive break-words">{linkError}</p>}
  </div>
 </details>;
}
