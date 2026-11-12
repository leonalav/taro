import { describe, expect, it } from 'vitest';
import { webToolDefinitions, webToolNames, webActivity, reconcileWebReads, settleWebActivities, toolResultText, safeWebUrl } from './web-research';
import { DeferredToolCatalog } from './phase-two-catalog';
import type { ChatMessage, ToolActivity } from '@/data/mock';
const search=(id='s'):ToolActivity=>({id,kind:'web-search',label:'Search 1 source',status:'done',web:{kind:'web-search',query:'css',provider:'DuckDuckGo',sources:[{url:'https://example.com/a',title:'A',displayUrl:'example.com/a',snippet:'a'}]}});
const fetch=(status:ToolActivity['status']='done'):ToolActivity=>({id:'f',kind:'web-fetch',label:'Read A',status,web:{kind:'web-fetch',requestedUrl:'https://example.com/a#x',finalUrl:'https://example.org/a',title:'A',content:'hello',contentType:'text/html',offset:0,totalCharacters:5,truncated:false,retrievedAt:'2026-11-10T00:00:00Z'}});
const group=(activities:ToolActivity[],agentId='code'):ChatMessage=>({id:Math.random().toString(),role:'activity-group',agentId,summary:'tools',activities});
describe('web research',()=>{
 it('registers read-only tools with bounded schemas and inherited restrictions',()=>{
  expect(webToolDefinitions.map(t=>t.function.name)).toEqual(['WebSearch','WebFetch']);
  const catalog=new DeferredToolCatalog(true);
  for(const name of webToolNames)expect(catalog.definitions().some(t=>t.function.name===name)).toBe(true);
  expect(new DeferredToolCatalog(true,new Set(['Read'])).allowed('WebFetch')).toBe(false);
 });
 it('validates persisted links',()=>{
  for(const url of ['javascript:alert(1)','file:///a','https://u:p@example.com','http://localhost','http://127.0.0.1'])expect(safeWebUrl(url)).toBeUndefined();
  expect(safeWebUrl('https://example.com/a#b')).toBe('https://example.com/a');
 });
 it('marks successful reads in the same agent history and survives storage',()=>{
  const other=group([search('other')],'design');
  const messages=reconcileWebReads([group([search()]),other,group([fetch()])]);
  expect((messages[0] as any).activities[0].web.sources[0].read).toBe(true);
  expect(messages[1]).toBe(other);
  expect(JSON.parse(JSON.stringify(messages))[0].activities[0].web.sources[0].read).toBe(true);
  expect(reconcileWebReads(messages)).toBe(messages);
 });
 it('does not mark failures read, and matches reads before later searches',()=>{
  expect((reconcileWebReads([group([search(),fetch('failed')])])[0] as any).activities[0].web.sources[0].read).toBeUndefined();
  expect((reconcileWebReads([group([fetch(),search()])])[0] as any).activities[1].web.sources[0].read).toBe(true);
 });
 it('converts typed payloads, deduplicates actual sources and initializes running states',()=>{
  const input={query:'css'};
  expect(webActivity('WebSearch',input)).toMatchObject({web:{kind:'web-search',query:'css',sources:[]}});
  const raw={kind:'web-search',query:'css',sources:[{url:'https://example.com/a#b',title:'A'},{url:'https://example.com/a',title:'A2'},{url:'javascript:bad',title:'Bad'}]};
  expect(webActivity('WebSearch',input,raw)?.web).toMatchObject({sources:[{url:'https://example.com/a',title:'A'}]});
  expect(webActivity('WebFetch',{url:'https://example.com'}, {kind:'web-fetch'})).toMatchObject({web:{kind:'web-fetch'}});
 });
 it('settles only running web rows and preserves full web tool text windows',()=>{
  const row={...search(),status:'running' as const};
  const settled=settleWebActivities([row,fetch()]);
  expect(settled[0].status).toBe('stopped');expect(settled[1].status).toBe('done');
  const text='a'.repeat(30000);expect(toolResultText('WebFetch',text)).toHaveLength(30000);expect(toolResultText('Read',text)).toHaveLength(20000);
 });
});
