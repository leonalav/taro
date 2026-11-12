import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createReviewBrowser } from './review-browser.mjs';
const service=createReviewBrowser();
after(()=>service.close());
test('canvas layer identity survives DOM inspection and supplies a stable selector',async()=>{
  await service.request({key:'layers',action:'open',html:'<svg width="100" height="100"><g data-taro-layer="canvas-cta"><rect width="80" height="40"/></g></svg>'});
  const capture=await service.request({key:'layers',action:'inspect',selector:'[data-taro-layer="canvas-cta"]'});
  assert.equal(capture.selection.layerId,'canvas-cta');
  assert.equal(capture.components.find(c=>c.layerId==='canvas-cta').selector,'[data-taro-layer="canvas-cta"]');
});
test('audit measures eight environments, real contrast, overflow, names and reduced-motion violations without changing the live preview',async()=>{
  const html=`<!doctype html><html lang="en"><style>body{margin:0;background:white;color:black}p{color:#aaa}main{width:500px}button{width:8px;height:8px;padding:0;border:0}#moving{animation:move 1s infinite}#complex{background:linear-gradient(white,black)}@keyframes move{to{transform:translateX(10px)}}</style><main><p id="low">Low contrast text</p><p id="complex">Needs visual contrast review</p><button aria-label=""></button><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'/%3E"><div id="moving">Motion</div></main></html>`;
  await service.request({key:'quality',action:'open',html,viewport:{width:920,height:720}});
  const result=await service.request({key:'quality',action:'audit'});
  assert.equal(result.audit.version,1);assert.equal(result.audit.cases.length,8);
  assert.match(result.audit.sourceHash,/^[a-f0-9]{64}$/);
  const mobile=result.audit.cases.find(c=>c.scheme==='light'&&c.mode==='mobile');
  assert.equal(mobile.viewport.width,320);assert.match(mobile.screenshot,/^data:image\/png;base64,/);
  assert.ok(mobile.findings.some(f=>f.rule==='horizontal-overflow'));
  assert.ok(mobile.findings.some(f=>f.rule==='text-contrast'&&f.selector==='#low'&&f.ratio<4.5));
  assert.ok(mobile.findings.some(f=>f.rule==='accessible-name'));
  assert.ok(mobile.findings.some(f=>f.rule==='image-alt'));
  assert.ok(mobile.findings.some(f=>f.rule==='target-size'));
  assert.ok(mobile.unmeasured.some(f=>f.selector==='#complex'));
  assert.ok(result.audit.cases.filter(c=>c.mode==='reduced-motion').every(c=>c.findings.some(f=>f.rule==='reduced-motion')));
  const zoom=result.audit.cases.find(c=>c.mode==='zoom');assert.equal(zoom.viewport.width,720);assert.equal(zoom.zoom,2);
  const live=await service.request({key:'quality',action:'inspect'});assert.equal(live.viewport.width,920);
  assert.equal(result.audit.status,'issues');
});
test('supported solid colors composite correctly while uncertain opacity and pseudo layers stay unmeasured',async()=>{
  const html=`<!doctype html><style>body{background:#fff;color:#000}p{margin:20px}#alpha{background:rgba(0,0,0,.5);color:#fff}#faded{opacity:.5}#pseudo::before{content:'';position:absolute;inset:0;background:red}</style><p id="solid">Readable text</p><p id="alpha">White on composite gray</p><p id="faded">Opacity needs review</p><p id="pseudo">Pseudo layer needs review</p>`;
  await service.request({key:'composite',action:'open',html});
  const {audit}=await service.request({key:'composite',action:'audit'});
  const first=audit.cases[0];
  assert.ok(!first.findings.some(f=>f.rule==='text-contrast'&&f.selector==='#solid'));
  assert.ok(first.findings.some(f=>f.rule==='text-contrast'&&f.selector==='#alpha'&&f.ratio>3.8&&f.ratio<4.1));
  assert.ok(first.unmeasured.some(f=>f.selector==='#faded'));
  assert.ok(first.unmeasured.some(f=>f.selector==='#pseudo'));
});
test('image and sibling paint behind text cannot earn a solid-background contrast pass',async()=>{
  await service.request({key:'paint',action:'open',html:`<!doctype html><style>body{margin:0;background:white;color:black}.backdrop{position:absolute;inset:0;width:100%;height:100%;z-index:0}p{position:relative;z-index:1;padding:24px}</style><img class="backdrop" alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='black'/%3E%3C/svg%3E"><p id="over-image">Black text on black image</p>`});
  const {audit}=await service.request({key:'paint',action:'audit'});
  assert.ok(audit.cases[0].unmeasured.some(item=>item.selector==='#over-image'));
});
test('audit targets do not mutate live preview cookies or local storage',async()=>{
  const server=http.createServer((_,response)=>{response.setHeader('Content-Type','text/html');response.end(`<script>localStorage.setItem('visits',String(Number(localStorage.getItem('visits')||0)+1));addEventListener('storage',()=>document.getElementById('visits').textContent=localStorage.getItem('visits'));</script><p id="visits"></p><script>document.getElementById('visits').textContent=localStorage.getItem('visits');</script>`);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    await service.request({key:'storage',action:'open',url:`http://127.0.0.1:${server.address().port}`});
    const started=Date.now();await service.request({key:'storage',action:'audit'});
    assert.ok(Date.now()-started<30000,'The audit fits inside the browser transport timeout.');
    const live=await service.request({key:'storage',action:'inspect',selector:'#visits'});
    assert.equal(live.selection.text,'1');
  }finally{await service.request({key:'storage',action:'close'}).catch(()=>{});server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
