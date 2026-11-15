// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {describe,it,expect,vi} from 'vitest';
import {WebResearchRow} from './web-research-row';
import type {ToolActivity} from '@/data/mock';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
const desktop=vi.hoisted(()=>({enabled:false,invoke:vi.fn().mockResolvedValue(undefined)}));
vi.mock('@tauri-apps/api/core',()=>({isTauri:()=>desktop.enabled,invoke:desktop.invoke}));
const make=(count:number):ToolActivity=>({id:'s',kind:'web-search',label:'search',status:'done',web:{kind:'web-search',query:'browser APIs',provider:'DuckDuckGo',sources:Array.from({length:count},(_,i)=>({url:`https://example.com/${i}`,displayUrl:`example.com/${i}`,title:`Source ${i}`,snippet:'text',read:i===0,iconDataUrl:i===0?'data:image/png;base64,AAAA':undefined}))}});
describe('web research rows',()=>{
 it('opens desktop source links through the native browser command without marking them read',async()=>{
  desktop.enabled=true;const host=document.createElement('div');const root=createRoot(host);
  try{await act(async()=>root.render(<WebResearchRow activity={make(2)}/>));await act(async()=>host.querySelectorAll('a')[1].click());expect(desktop.invoke).toHaveBeenCalledWith('open_web_link',{url:'https://example.com/1'});expect(host.querySelectorAll('a')[1].textContent).not.toContain('Read');}finally{desktop.enabled=false;await act(async()=>root.unmount());}
 });
 it('renders exact source count, accessible links, read status and icon fallback',async()=>{
  const host=document.createElement('div');const root=createRoot(host);
  await act(async()=>root.render(<WebResearchRow activity={make(31)}/>));
  expect(host.querySelector('summary')?.textContent).toContain('Search 31 sources');
  expect(host.querySelectorAll('a')).toHaveLength(31);expect(host.textContent).toContain('DuckDuckGo');expect(host.textContent).toContain('Read');
  const link=host.querySelector('a')!;expect(link.getAttribute('rel')).toContain('noopener');expect(link.title).toContain('https://example.com/0');
  await act(async()=>host.querySelector('img')!.dispatchEvent(new Event('error')));expect(host.querySelector('img')).toBeNull();
  await act(async()=>root.render(<WebResearchRow activity={make(1)}/>));expect(host.querySelector('summary')?.textContent).toContain('Search 1 source');
  await act(async()=>root.unmount());
 });
 it('shows distinct lifecycle states without resetting a disclosure',async()=>{
  const host=document.createElement('div');const root=createRoot(host);const row=make(0);
  for(const [status,label] of [['running','Searching the web…'],['done','Search 0 sources'],['failed','Web search failed'],['stopped','Web search stopped']] as const){await act(async()=>root.render(<WebResearchRow activity={{...row,status,errorTrace:status==='failed'?'DuckDuckGo blocked this request':undefined}}/>));expect(host.querySelector('summary')?.textContent).toContain(label);}
  const details=host.querySelector('details')!;details.open=true;
  await act(async()=>root.render(<WebResearchRow activity={make(3)}/>));expect(details.open).toBe(true);
  await act(async()=>root.unmount());
 });
 it('renders fetched text safely and refuses malformed saved source links',async()=>{
  const host=document.createElement('div');const root=createRoot(host);const row=make(1);if(row.web?.kind==='web-search')row.web.sources[0].url='javascript:alert(1)';
  await act(async()=>root.render(<WebResearchRow activity={row}/>));expect(host.querySelector('a')).toBeNull();
  await act(async()=>root.render(<WebResearchRow activity={{id:'f',kind:'web-fetch',label:'read',status:'done',web:{kind:'web-fetch',requestedUrl:'https://example.com',finalUrl:'https://example.com/page',title:'Page',content:'<script>not executable</script>',contentType:'text/html',offset:0,totalCharacters:31,truncated:false,retrievedAt:'Unix time 1794319161 UTC'}}}/>));
  expect(host.textContent).toContain('Read Page');expect(host.textContent).toContain('not executable');expect(host.querySelector('script')).toBeNull();
  expect(host.textContent).toContain('Retrieved');expect(host.textContent).not.toContain('Unix time');
  await act(async()=>root.unmount());
 });
});
