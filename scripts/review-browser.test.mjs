import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { setTimeout as pause } from 'node:timers/promises';
import { createReviewBrowser } from './review-browser.mjs';
const service=createReviewBrowser();
const server=http.createServer((req,res)=>{
  res.setHeader('Content-Type','text/html');
  if(req.url.startsWith('/missing-model.glb'))res.statusCode=404;
  if(req.url==='/diagnostics'){
    res.end(`<!doctype html><button id="trigger" onclick="console.error('PRIVATE-CONTENT');requestAnimationFrame(()=>{const end=performance.now()+80;while(performance.now()<end){}});throw Error('SECRET')">Test</button>
      <img src="/missing-model.glb?token=TOPSECRET"><img src="http://127.0.0.1:1/failure.png?token=TOPSECRET">`);
  }else res.end('<!doctype html><style>body{margin:0}h1{margin:0;width:280px;height:80px}main{height:2000px}</style><h1 id="hero">Review actual geometry</h1><button onclick="this.textContent=\'Clicked\'">Test click</button><main>Scroll</main>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
after(async()=>{await service.close();server.close();});
test('real browser measures actual geometry, viewport, selector, scroll and prototype input',async()=>{
  const opened=await service.request({key:'session-a',action:'open',url,viewport:{width:920,height:720}});
  assert.equal(opened.viewport.width,920);assert.match(opened.screenshot,/^data:image\/png;base64,/);
  assert.ok(opened.source.includes('Review actual geometry'));
  const measured=await service.request({key:'session-a',action:'inspect',selector:'#hero'});
  assert.equal(measured.selection.rect.width,280);assert.equal(measured.selection.rect.height,80);
  assert.equal(measured.selection.styles.fontSize,'32px');
  const root=await service.request({key:'session-a',action:'inspect',selector:'html'});
  assert.equal(root.selection.selector,'html');
  await service.request({key:'session-a',action:'input',input:{type:'click',x:40,y:90}});
  assert.ok((await service.request({key:'session-a',action:'inspect'})).components.some(c=>c.text==='Clicked'));
  const mobile=await service.request({key:'session-a',action:'viewport',viewport:{width:393,height:852}});
  assert.equal(mobile.viewport.width,393);assert.equal(mobile.viewport.height,852);
  const scrolled=await service.request({key:'session-a',action:'input',input:{type:'scroll',deltaY:400,deltaX:0}});
  assert.ok(scrolled.document.scrollY>0);
  await assert.rejects(service.request({key:'session-a',action:'inspect',selector:'#missing'}),/not found/i);
  await assert.rejects(service.request({key:'session-a',action:'viewport',viewport:{width:NaN,height:800}}),/viewport/i);
});
test('a prototype action still returns a capture when it removes the selected component',async()=>{
  await service.request({key:'action-once',action:'open',html:'<h1 id="selected">Selected</h1><button id="action" onclick="this.textContent=String(Number(this.textContent)+1);document.getElementById(\'selected\')?.remove()">0</button>',viewport:{width:800,height:600}});
  const button=await service.request({key:'action-once',action:'inspect',selector:'#action'});
  const rect=button.selection.rect;
  const result=await service.request({key:'action-once',action:'input',selector:'#selected',input:{type:'click',x:rect.x+4,y:rect.y+4}});
  assert.equal(result.components.find(c=>c.selector==='#action').text,'1');assert.equal(result.selection,undefined);
});
test('wheel input scrolls the overflow container beneath the pointer',async()=>{
  await service.request({key:'nested-scroll',action:'open',html:'<style>body{margin:0}</style><div id="scroller" style="width:300px;height:200px;overflow:auto"><section id="inner" style="height:2000px">Scrollable panel</section></div>',viewport:{width:800,height:600}});
  const scrolled=await service.request({key:'nested-scroll',action:'input',input:{type:'scroll',x:100,y:100,deltaY:350,deltaX:0}});
  const measured=await service.request({key:'nested-scroll',action:'inspect',selector:'#inner'});
  assert.equal(scrolled.document.scrollY,0);assert.ok(measured.selection.rect.y<0,'nested content moved within its scroll container');
});
test('browser targets are isolated, HTML content remains exact, unsafe URLs and missing sessions fail clearly',async()=>{
  const html='<!doctype html>\r\n<h1 id="saved">Saved 日本語</h1>';
  const saved=await service.request({key:'session-b',action:'open',html,viewport:{width:800,height:600}});
  assert.equal(saved.components.find(c=>c.selector==='#saved').text,'Saved 日本語');
  const other=await service.request({key:'session-a',action:'inspect',selector:'#hero'});
  assert.equal(other.selection.text,'Review actual geometry');
  await assert.rejects(service.request({key:'none',action:'inspect'}),/open a preview/i);
  await assert.rejects(service.request({key:'bad',action:'open',url:'javascript:alert(1)',viewport:{width:800,height:600}}),/HTTP/i);
  await assert.rejects(service.request({key:'bad',action:'open',url:'http://127.0.0.1:1',viewport:{width:800,height:600}}),/navigation|ERR_/i);
});

const interactionHtml=`<!doctype html><style>
  body {margin:0} #menu:not(:hover) a {visibility:hidden}
  #menu {width:175px;height:65px} section {height:1000px}
  #slider {width:100%; box-sizing:border-box; margin:0}
  #pulse {width:100px;height:40px;background:red;animation:slide 1s infinite linear alternate}
  @keyframes slide {to {transform:translateX(140px)}}
</style>
<nav id="menu">Menu <a href="#end">Next scene</a></nav>
<input id="slider" type="range" min="0" max="100" value="0" aria-label="Scene angle">
<p id="angle">0</p><span id="scene-status">Start</span><input id="field" aria-label="Search"><button id="submit" onclick="this.textContent='Opened'">Open</button>
<div id="pulse"></div><section></section><h2 id="end">Scene two</h2>
<script>slider.addEventListener('input',()=>{angle.textContent=slider.value;if(Number(slider.value)>60)document.querySelector('#scene-status').textContent='Moved';});</script>`;

test('live viewing sends an initial frame for a static page',async()=>{
  const key='live-static',liveId='static-viewer';
  await service.request({key,action:'open',html:'<!doctype html><h1>Static prototype</h1>',viewport:{width:920,height:720}});
  let frame;
  try{
    for(let index=0;index<16&&!frame?.screenshot;index++){
      frame=await service.request({key,action:'live-frame',liveId});
      if(!frame.screenshot)await pause(85);
    }
    assert.match(frame?.screenshot??'',/^data:image\/jpeg;base64,/);
  }finally{await service.request({key,action:'stop-live',liveId});}
});

test('live viewing delivers changing JPEG frames from the scoped target and leaves evidence as PNG',async()=>{
  const key='live-prototype',liveId='first-viewer';
  await service.request({key,action:'open',html:interactionHtml,viewport:{width:920,height:720}});
  const frames=new Set(),deadline=Date.now()+1800;
  while(frames.size<7&&Date.now()<deadline){
    const frame=await service.request({key,action:'live-frame',liveId});
    if(frame.screenshot){
      assert.match(frame.screenshot,/^data:image\/jpeg;base64,/);
      assert.deepEqual(frame.viewport,{width:920,height:720});
      assert.equal(frame.evidence,undefined);
      frames.add(frame.screenshot);
    }
    await pause(85);
  }
  assert.ok(frames.size>=7,`only received ${frames.size} distinct compositor frames in 1.8s`);
  assert.deepEqual(await service.request({key:'unrelated',action:'stop-live',liveId}),{stopped:false});
  await assert.rejects(service.request({key,action:'live-frame',liveId:'another-viewer'}),/another viewer/i);
  const evidence=await service.request({key,action:'capture',capture:{mode:'viewport'}});
  assert.match(evidence.screenshot,/^data:image\/png;base64,/);
  assert.equal(evidence.evidence.mode,'viewport');
  assert.deepEqual(await service.request({key,action:'stop-live',liveId:'another-viewer'}),{stopped:false});
  assert.deepEqual(await service.request({key,action:'stop-live',liveId}),{stopped:true});
  assert.deepEqual(await service.request({key,action:'stop-live',liveId}),{stopped:false});
});

test('a disconnected live viewer releases its stream without closing the preview',async()=>{
  const key='live-prototype-lease',liveId='abandoned';
  await assert.rejects(service.request({key,action:'live-frame',liveId}),/open a preview/i);
  await service.request({key,action:'open',html:interactionHtml,viewport:{width:393,height:852}});
  await service.request({key,action:'live-frame',liveId});
  await pause(2300);
  assert.deepEqual(await service.request({key,action:'stop-live',liveId}),{stopped:false});
  const capture=await service.request({key,action:'inspect',selector:'#slider'});
  assert.equal(capture.viewport.width,393);
  assert.equal(capture.selection.selector,'#slider');
});

test('hover, focus, keyboard modifiers, and drag use real browser input',async()=>{
  const key='interaction';
  await service.request({key,action:'open',html:interactionHtml,viewport:{width:920,height:720}});
  const input=async input=>service.request({key,action:'input',input});
  const hover=await input({type:'hover',selector:'#menu'});
  assert.ok(hover.components.some(item=>item.text==='Next scene'));
  const click=await input({type:'click',selector:'#field'});
  assert.equal(click.state.focusedSelector,'#field');
  const typed=await input({type:'text',text:'search'});
  assert.ok(!JSON.stringify(typed.state).includes('search'));
  assert.equal((await input({type:'key',key:'Tab'})).state.focusedSelector,'#submit');
  assert.equal((await input({type:'key',key:'Tab',shift:true})).state.focusedSelector,'#field');
  const dragged=await input({type:'drag',selector:'#slider',to:{x:700,y:73},durationMs:200});
  assert.ok(Number(dragged.components.find(item=>item.selector==='#angle').text)>60);
  await assert.rejects(input({type:'hover',selector:'input'}),/ambiguous/i);
  await assert.rejects(input({type:'click',selector:'#end'}),/outside|visible/i);
  assert.equal((await input({type:'click',selector:'#submit'})).components.find(item=>item.selector==='#submit').text,'Opened');
});

test('captures document bounds, selected offscreen content and controlled animation positions',async()=>{
  const key='capture-options';
  await service.request({key,action:'open',html:interactionHtml,viewport:{width:393,height:600},environment:{deviceScale:2}});
  const full=await service.request({key,action:'capture',capture:{mode:'document'}});
  assert.ok(full.evidence.bounds.height>1000);
  assert.equal(full.evidence.deviceScale,2);
  const pngSize=url=>{const bytes=Buffer.from(url.split(',')[1],'base64');return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];};
  assert.deepEqual(pngSize(full.screenshot),[786,full.evidence.bounds.height*2]);
  const region=await service.request({key,action:'capture',capture:{mode:'element',selector:'#end'}});
  assert.ok(region.evidence.bounds.y>1000);
  assert.equal(region.document.scrollY,0,'capture does not disturb the viewport');
  await assert.rejects(service.request({key,action:'capture',capture:{mode:'element',selector:'#menu a'}}),/visible/i);
  const motion=await service.request({key,action:'motion',motion:{selector:'#pulse',checkpoints:[0,0.5,1]}});
  assert.deepEqual(motion.run.frames.map(frame=>frame.checkpoint),[0,0.5,1]);
  assert.equal(new Set(motion.run.frames.map(frame=>frame.screenshot)).size,3);
});

test('replays the same interaction on desktop and mobile and preserves failure evidence',async()=>{
  const key='replay';
  await service.request({key,action:'open',html:interactionHtml,viewport:{width:920,height:720}});
  const replay={name:'Explore scene',steps:[
    {input:{type:'drag',selector:'#slider',toSelector:'#slider',toRelative:{x:0.85,y:0.5}},expect:{selector:'#scene-status',text:'Moved'}},
    {input:{type:'click',selector:'#submit'},expect:{selector:'#submit',text:'Opened'}},
    {input:{type:'scroll',deltaY:1200},expect:{selector:'#end',inViewport:true}},
  ]};
  for(const width of [920,393]){
    const result=await service.request({key,action:'replay',viewport:{width,height:720},replay});
    assert.equal(result.run.status,'passed',JSON.stringify(result.run.steps));
    assert.equal(result.run.steps.length,3);
    assert.equal(result.run.frames.length,4);
    assert.equal(result.run.frames[0].evidence.viewport.width,width);
  }
  const failed=await service.request({key,action:'replay',replay:{...replay,steps:[{...replay.steps[0],expect:{selector:'#angle',text:'unreachable'}},...replay.steps.slice(1)]}});
  assert.equal(failed.run.status,'failed');
  assert.equal(failed.run.steps.length,1);
  assert.match(failed.run.steps[0].error,/expected/i);
  assert.equal(failed.run.frames.length,2);
  assert.equal((await service.request({key,action:'inspect',selector:'#submit'})).selection.text,'Open');
});

test('requires the named input to hold focus before targeted typing or key actions',async()=>{
  const key='focused-replay';
  const html='<label>First <input id="first"></label><label>Second <input id="second"></label><p id="result">Waiting</p><script>first.addEventListener("input",()=>result.textContent=first.value);first.addEventListener("keydown",()=>result.textContent="Pressed");</script>';
  await service.request({key,action:'open',html,viewport:{width:800,height:600}});
  for(const [action,value] of [[{type:'text',text:'Typed'},'Typed'],[{type:'key',key:'Enter'},'Pressed']]){
    const replay={name:'Check focus',steps:[{input:{type:'click',selector:'#first'}},{input:{...action,selector:'#first'},expect:{selector:'#result',text:value}}]};
    const success=await service.request({key,action:'replay',replay});
    assert.equal(success.run.status,'passed');
    const failure=await service.request({key,action:'replay',replay:{...replay,steps:[replay.steps[0],{...replay.steps[1],input:{...action,selector:'#second'}}]}});
    assert.equal(failure.run.status,'failed');
    assert.match(failure.run.steps[1].error,/focused/);
    assert.equal(failure.components.find(item=>item.selector==='#result').text,'Waiting');
  }
});

test('distinguishes a proven state change from an expectation that was already true',async()=>{
  const key='replay-transition';
  const html='<button id="noop">Do nothing</button><button id="show" onclick="document.querySelector(\'#result\').textContent=\'Opened\'">Open</button><p id="result">Waiting</p>';
  await service.request({key,action:'open',html,viewport:{width:800,height:600}});
  const replay={name:'Open details',steps:[
    {input:{type:'click',selector:'#noop'},expect:{selector:'#result',text:'Waiting'}},
    {input:{type:'click',selector:'#show'},expect:{selector:'#result',text:'Opened'}},
  ]};
  const result=await service.request({key,action:'replay',replay});
  assert.deepEqual(result.run.steps.map(step=>[step.status,step.transitioned]),[['passed',false],['passed',true]]);
});

test('diagnostics distinguish failed and HTTP error requests, omit request secrets and report timing',async()=>{
  const key='diagnostics';
  const opened=await service.request({key,action:'open',url:`${url}/diagnostics`,viewport:{width:800,height:600}});
  assert.ok(opened.diagnostics.events.some(event=>event.kind==='http'&&event.status===404&&event.url.endsWith('/missing-model.glb')),JSON.stringify(opened.diagnostics));
  assert.ok(opened.diagnostics.events.some(event=>event.kind==='network'&&event.url.endsWith('/failure.png')),JSON.stringify(opened.diagnostics));
  const result=await service.request({key,action:'input',input:{type:'click',selector:'#trigger'}});
  assert.ok(result.diagnostics.events.some(event=>event.kind==='exception'));
  assert.ok(result.diagnostics.events.some(event=>event.kind==='console'&&event.level==='error'));
  assert.ok(result.state.actionDurationMs>0);
  assert.equal(result.diagnostics.slowFramesSupported,true);
  const initialFrames=new Set(opened.diagnostics.slowFrames.map(frame=>frame.startMs));
  const sawSlowFrame=({slowFrames})=>slowFrames.some(frame=>frame.durationMs>=80&&!initialFrames.has(frame.startMs));
  let observed=result.diagnostics;
  const deadline=performance.now()+1500;
  while(!sawSlowFrame(observed)&&performance.now()<deadline){
    await pause(75);
    observed=(await service.request({key,action:'capture'})).diagnostics;
  }
  assert.ok(sawSlowFrame(observed),JSON.stringify(observed.slowFrames));
  assert.doesNotMatch(JSON.stringify(result.diagnostics),/TOPSECRET|PRIVATE-CONTENT|SECRET/);
});

test('a missing 3D model blocks audit and interaction eligibility even if the detail toggle works',async()=>{
  const key='missing-model';
  const html=`<!doctype html><html lang="en"><title>Product</title><body><main><h1>Product</h1><button id="detail" style="min-height:44px" onclick="fetch('${url}/missing-model.glb?key=TOPSECRET').catch(()=>{});document.querySelector('#status').textContent='Details'">Details</button><span id="status">Waiting</span><script>fetch('${url}/missing-model.glb?key=TOPSECRET').catch(()=>{});</script></main></body></html>`;
  await service.request({key,action:'open',html,viewport:{width:800,height:600}});
  const audit=(await service.request({key,action:'audit'})).audit;
  assert.notEqual(audit.status,'measured-clear');
  assert.ok(audit.cases.every(item=>item.findings.some(finding=>finding.rule==='asset-load-failure'&&finding.severity==='error')));
  assert.doesNotMatch(JSON.stringify(audit.cases.map(item=>item.findings)),/TOPSECRET/);
  const result=await service.request({key,action:'replay',replay:{name:'Show details',steps:[{input:{type:'click',selector:'#detail'},expect:{selector:'#status',text:'Details'}}]}});
  assert.equal(result.run.status,'failed');
  assert.equal(result.run.steps[0].transitioned,true);
  assert.match(result.run.steps[0].error,/resource failed to load/);
});

test('named recipe checkpoints carry readiness, are captured in isolation and fail clearly',async()=>{
  const key='scene-checkpoints';
  const html=`<main data-recipe-stage data-recipe-checkpoint="initial" data-recipe-frame="0">Initial</main>
  <script>const stage=document.querySelector('main');window.taroRecipeCheckpoint=name=>{
    if(!['wide','detail'].includes(name))return false;
    stage.dataset.recipeCheckpoint=name;
    requestAnimationFrame(()=>{stage.dataset.recipeFrame++;stage.textContent=name;});
    return true;
  };</script>`;
  await service.request({key,action:'open',html});
  const result=await service.request({key,action:'motion',motion:{sceneCheckpoints:['wide','detail']}});
  assert.equal(result.run.kind,'scene-checkpoints');
  assert.deepEqual(result.run.frames.map(frame=>frame.evidence.sceneState),['wide','detail']);
  assert.notEqual(result.run.frames[0].screenshot,result.run.frames[1].screenshot);
  assert.equal((await service.request({key,action:'inspect',selector:'main'})).selection.text,'Initial');
  await assert.rejects(service.request({key,action:'motion',motion:{sceneCheckpoints:['wide','missing']}}),/unknown named checkpoint/i);
});
