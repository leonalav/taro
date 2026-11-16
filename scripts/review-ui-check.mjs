import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const output=process.env.TARO_REVIEW_OUTPUT||'.verification-2026-11-09/review-mode';await mkdir(output,{recursive:true});
const html='<!doctype html>\r\n<html><head><title>Review fixture</title><style>body{margin:0;background:#fafaf8;font:16px Arial;color:#111}header{padding:24px 32px;border-bottom:1px solid #ddd}main{padding:32px}h1{margin:0 0 24px;width:360px;height:100px;font-size:40px;line-height:1}p{max-width:440px;line-height:1.6}button{padding:12px 20px;border:0;border-radius:24px;background:#111;color:white}section{height:1600px;margin-top:30px;background:linear-gradient(#ece6db,#c7d7bc);border-radius:20px}</style></head><body><header>STUDIO / DISCOVERY</header><main><h1 id="hero">A preview worth reviewing.</h1><p id="copy">Real component geometry, durable artifacts, and considered feedback.</p><button id="action" onclick="this.textContent=\'Added\'">Explore collection</button><input aria-label="Name" placeholder="Your name"><section id="cards">Product stories</section></main></body></html>';
const fixture=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(html.replace('</style>','header{animation:review-pulse 1s infinite alternate linear}@keyframes review-pulse{to{background:#afcef1}}</style>'));});await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve));
const fixtureUrl=`http://127.0.0.1:${fixture.address().port}`;
const browser=await chromium.launch({headless:true,channel:process.env.TARO_BROWSER_CHANNEL||undefined}),context=await browser.newContext({viewport:{width:1600,height:1100}}),page=await context.newPage();page.setDefaultTimeout(60000);
const errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.route(/^https:\/\//,route=>route.abort());
await page.addInitScript(()=>{if(!localStorage.getItem('review-qa-seeded')){localStorage.setItem('review-qa-seeded','1');localStorage.setItem('taro-preferences-v1',JSON.stringify({appearance:{reduceMotion:true},account:{name:'Reviewer'}}));localStorage.setItem('taro-chat-v1',JSON.stringify({folders:[{id:'folder-review',name:'Review QA',path:'A:/review'}],threads:[{id:'qa-one',name:'Review one',folderId:'folder-review',updated:'now',messages:[]},{id:'qa-two',name:'Review two',folderId:'folder-review',updated:'now',messages:[]}],activeThreadId:'qa-one'}));}});
const check=(name,value)=>{assert.ok(value,name);console.log(`PASS ${name}`);};
const openReview=async()=>{const button=page.getByRole('button',{name:'Review mode — live design preview',exact:true});if(await button.getAttribute('aria-pressed')!=='true')await button.click();await page.getByRole('region',{name:'Review mode',exact:true}).waitFor();};
const switchChat=async name=>{await page.locator('button[title]').filter({has:page.getByText(name,{exact:true})}).filter({has:page.locator('[data-status-dot]')}).click();await openReview();await page.waitForFunction(()=>!document.querySelector('[aria-label="Review mode"] .review-empty svg.animate-spin'));};
try{
  await page.goto((process.env.TARO_BASE_URL||'http://127.0.0.1:1427'),{waitUntil:'commit'});await page.locator('.reception-recent').filter({hasText:'Review one'}).click();await openReview();
  await page.getByRole('heading',{name:'Open a browser preview',exact:true}).waitFor();
  check('new sessions offer a real browser preview',await page.getByRole('heading',{name:'Open a browser preview',exact:true}).isVisible());
  await page.getByLabel('HTML artifact file').setInputFiles({name:'Review artifact.html',mimeType:'text/html',buffer:Buffer.from(html)});
  await page.getByRole('tab',{name:'Review artifact.html',exact:true}).waitFor();await page.locator('.review-viewport img').waitFor();
  await page.getByRole('button',{name:'Inspect component list',exact:true}).click();await page.getByRole('button',{name:'h1 A preview worth reviewing.',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.review-component-details')?.textContent.includes('360 × 100 px'));
  check('component inspector reports real CSS dimensions',true);
  await page.getByRole('button',{name:'Comment on component',exact:true}).click();
  await page.getByRole('textbox',{name:'Comment',exact:true}).fill('Use **bold**, *italic*, and `inline`.\n\n```ts\nconst keep = true;\n```');await page.getByRole('button',{name:'Post comment',exact:true}).click();
  await page.getByRole('button',{name:/Comment 1 by Reviewer/}).click();
  check('comments render bold, italic and fenced code',await page.locator('.review-thread .review-markdown strong').textContent()==='bold'&&await page.locator('.review-thread .review-markdown em').textContent()==='italic'&&(await page.locator('.review-thread pre code').textContent()).includes('const keep = true;'));
  await page.getByRole('button',{name:'Reply',exact:true}).click();await page.getByRole('textbox',{name:'Reply to comment'}).fill('Keep this reply after resolving.');await page.locator('.review-composer button[type=submit]').click();await page.getByRole('button',{name:'Resolve',exact:true}).click();
  await page.getByRole('button',{name:'Show review threads',exact:true}).click();await page.getByRole('button',{name:'Resolved',exact:true}).click();
  check('resolved comments preserve their replies',(await page.locator('[aria-label="Review comment threads"]').textContent()).includes('Keep this reply'));
  await page.getByRole('button',{name:'Reopen',exact:true}).click();await page.getByRole('button',{name:'Close review threads',exact:true}).click();
  await page.getByRole('button',{name:'Browser evidence',exact:true}).click();
  let evidence=page.getByRole('complementary',{name:'Browser evidence',exact:true});
  await evidence.getByRole('button',{name:'Save full page',exact:true}).click();
  const fullPage=await evidence.getByAltText('document capture').getAttribute('src');
  assert.match(fullPage,/^data:image\/png;base64,/);
  await evidence.getByRole('button',{name:'Comment on a point in this saved frame'}).press('Enter');
  await evidence.getByRole('textbox',{name:'Comment on saved browser evidence'}).fill('Check the evidence frame');
  await evidence.getByRole('button',{name:'Post comment',exact:true}).click();
  await evidence.locator('.review-evidence-thread').getByText('Check the evidence frame',{exact:true}).waitFor();
  const replay=await page.evaluate(async()=>{
    const {executeReviewTool}=await import('/src/lib/review-tools.ts');
    const result=await executeReviewTool('BrowserReplay',{name:'Open and inspect collection',steps:[
      {label:'Open collection',input:{type:'click',selector:'#action'},expect:{selector:'#action',text:'Added'}},
      {label:'Find the next scene',input:{type:'scroll',deltaY:350},expect:{selector:'#cards',inViewport:true}},
    ]},{scope:{workspace:'A:/review',sessionId:'qa-one'},author:'QA',role:'Reviewer'});
    return JSON.parse(result.text);
  });
  assert.equal(replay.report.status,'passed',JSON.stringify(replay.report.steps));
  await evidence.getByRole('button',{name:/Open and inspect collection/}).click();
  await evidence.getByRole('button',{name:/Replay at 920/}).click();
  await evidence.getByRole('button',{name:/Open and inspect collection/}).nth(1).waitFor();
  await evidence.getByRole('button',{name:'Sample motion',exact:true}).click();
  const motionImage=evidence.getByAltText('Motion evidence');
  const sampledPng=await motionImage.getAttribute('src');
  const download=page.waitForEvent('download');
  await evidence.getByRole('button',{name:'Download filmstrip video',exact:true}).click();
  const video=await download;
  assert.match(video.suggestedFilename(),/\.webm$|\.mp4$/);
  const videoBytes=await readFile(await video.path());
  assert.ok(videoBytes.length>500);
  const played=await page.evaluate(async ({base64,mimeType})=>{
    const bytes=Uint8Array.from(atob(base64),value=>value.charCodeAt(0));
    const url=URL.createObjectURL(new Blob([bytes],{type:mimeType}));
    const player=document.createElement('video');
    player.muted=true;
    player.src=url;
    document.body.append(player);
    let deadline;
    try{
      const ended=new Promise((resolve,reject)=>{
        deadline=setTimeout(()=>reject(Error('The downloaded filmstrip did not finish playback.')),15000);
        player.addEventListener('ended',resolve,{once:true});
        player.addEventListener('error',()=>reject(Error('The downloaded filmstrip could not be played.')),{once:true});
      });
      await Promise.all([ended,player.play()]);
      return {width:player.videoWidth,height:player.videoHeight,time:player.currentTime};
    }finally{clearTimeout(deadline);player.remove();URL.revokeObjectURL(url);}
  },{base64:videoBytes.toString('base64'),mimeType:video.suggestedFilename().endsWith('.webm')?'video/webm':'video/mp4'});
  assert.deepEqual([played.width,played.height],[920,720]);
  assert.ok(played.time>.2);
  assert.equal(await motionImage.getAttribute('src'),sampledPng);
  check('Review downloads a playable filmstrip and preserves the sampled PNG evidence',true);
  await evidence.getByRole('button',{name:'Close browser evidence',exact:true}).click();
  check('Review saves full-page images, pins comments, and reruns saved stories',true);
  await page.getByRole('button',{name:'Save artifact revision',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[aria-label="Artifact revision"] option').length===2);
  check('saving retains both artifact revisions',true);
  const source=await page.evaluate(async()=>{
    const {reviewRepository}=await import('/src/lib/review-persistence.ts');
    const scope={workspace:'A:/review',sessionId:'qa-one'};
    await reviewRepository.load(scope);
    return reviewRepository.snapshot(scope).state.previews.find(p=>p.title==='Review artifact.html').revisions[0].html;
  });
  assert.equal(source,html);console.log('PASS original HTML preserved byte-for-byte as a string');
  await page.getByRole('combobox',{name:'Artifact revision',exact:true}).selectOption({index:0});await page.getByText('Historical revision. Comments stay attached to this revision.',{exact:false}).waitFor();
  await page.screenshot({path:`${output}/saved-artifact-wide.png`,fullPage:true});
  if(process.env.TARO_ADI_ACCEPTANCE==='1'){
    const historicalRevision=await page.getByRole('combobox',{name:'Artifact revision',exact:true}).inputValue();
    let forwarded=0;
    await page.route('**/__taro_review',route=>{
      const body=route.request().postDataJSON();
      if(JSON.parse(body.key)[2]===historicalRevision)forwarded++;
      return route.abort();
    });
    await page.getByRole('button',{name:'Annotate component',exact:true}).click();
    await page.getByRole('application',{name:'Browser preview viewport'}).press('Enter');
    await page.getByRole('textbox',{name:'Comment',exact:true}).fill('Offline **saved** annotation');
    await page.getByRole('button',{name:'Post comment',exact:true}).click();
    await page.getByRole('button',{name:'Show review threads',exact:true}).click();
    await page.getByText('Offline saved annotation',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Send to agent',exact:true}).last().click();
    await page.locator('[data-chip-kind="review"]').waitFor();
    check('historical annotation works offline and queues a structured Review chip',forwarded===0);
    await page.unroute('**/__taro_review');
    await openReview();
  }
  await switchChat('Review two');await page.getByRole('heading',{name:'Open a browser preview',exact:true}).waitFor();check('second session has independent empty Review state',await page.getByRole('heading',{name:'Open a browser preview',exact:true}).isVisible());
  await page.getByRole('textbox',{name:'Preview URL',exact:true}).fill(fixtureUrl);await page.getByRole('button',{name:'Open preview',exact:true}).click();await page.locator('.review-viewport img').waitFor();
  await page.getByRole('combobox',{name:'Device preset'}).selectOption({index:2});await page.waitForFunction(()=>document.querySelector('[aria-label="Viewport width"]')?.value==='393');
  await page.getByRole('button',{name:'Inspect component list',exact:true}).click();await page.getByRole('button',{name:'h1 A preview worth reviewing.',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.review-component-details')?.textContent.includes('360 × 100 px'));
  await page.screenshot({path:`${output}/live-mobile-wide.png`,fullPage:true});
  await page.getByRole('button',{name:'Close components',exact:true}).click();
  await page.evaluate(()=>{
    const frames=window.reviewLiveFrames=[];
    document.querySelector('.review-viewport img').addEventListener('load',event=>{
      if(event.target.src.startsWith('data:image/jpeg;base64,')){
        frames.push({at:performance.now(),src:event.target.src});
        if(frames.length>24)frames.shift();
      }
    });
  });
  const waitForLiveFrames=()=>page.waitForFunction(()=>{
    const frames=window.reviewLiveFrames;
    return frames.some((frame,index)=>new Set(frames.slice(index).filter(item=>item.at-frame.at<=1600).map(item=>item.src)).size>=6);
  },undefined,{timeout:7500});
  await page.getByRole('button',{name:'Prototype',exact:true}).click();
  await waitForLiveFrames();
  check('Prototype displays six distinct decoded live frames within 1.6 seconds',true);
  const expectLiveStop=()=>page.waitForResponse(response=>response.url().endsWith('/__taro_review')&&response.request().postDataJSON()?.action==='stop-live'&&response.ok());
  const liveStopped=expectLiveStop();
  await page.evaluate(()=>{
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal((await (await liveStopped).json()).stopped,true);
  await page.waitForFunction(()=>document.querySelector('.review-viewport img').src.startsWith('data:image/png;base64,'));
  await page.evaluate(()=>{
    window.reviewLiveFrames.length=0;
    delete document.visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await waitForLiveFrames();
  check('hiding Review stops live capture and returning resumes it',true);
  const viewport=await page.locator('.review-viewport').boundingBox();const scale=viewport.width/393;await page.locator('.review-viewport').click({position:{x:100*scale,y:300*scale}});
  await page.locator('.review-viewport').hover();await page.mouse.wheel(0,350);await page.waitForTimeout(700);
  check('live preview viewport supports prototype input',await page.locator('.review-viewport').isVisible());
  const sessionLiveStopped=expectLiveStop();
  await switchChat('Review one');assert.equal((await (await sessionLiveStopped).json()).stopped,true);
  check('switching chats stops Prototype and restores the saved revisions for that chat',await page.locator('[aria-label="Artifact revision"] option').count()===2);
  await page.addInitScript(()=>{
    if(typeof MediaRecorder==='function')MediaRecorder.isTypeSupported=()=>false;
  });
  await page.reload({waitUntil:'commit'});await page.locator('.reception-recent').filter({hasText:'Review one'}).click();await openReview();
  await page.waitForFunction(()=>document.querySelectorAll('[aria-label="Artifact revision"] option').length===2);
  check('reload retains artifacts and comment history',await page.locator('[aria-label="Artifact revision"] option').count()===2);
  await page.getByRole('button',{name:'Browser evidence',exact:true}).click();
  evidence=page.getByRole('complementary',{name:'Browser evidence',exact:true});
  await evidence.getByRole('button',{name:'document capture Historical revision'}).click();
  assert.equal(await evidence.getByAltText('document capture').getAttribute('src'),fullPage);
  await evidence.locator('.review-evidence-thread').getByText('Check the evidence frame',{exact:true}).waitFor();
  await evidence.getByRole('button',{name:'Motion evidence Historical revision'}).click();
  await evidence.getByText('Filmstrip video export is unavailable in this browser.',{exact:true}).waitFor();
  assert.equal(await evidence.getByRole('button',{name:'Download filmstrip video',exact:true}).count(),0);
  assert.equal(await evidence.getByAltText('Motion evidence').getAttribute('src'),sampledPng);
  check('unsupported encoding preserves the historical sampled PNG evidence',true);
  await evidence.getByRole('button',{name:'Close browser evidence',exact:true}).click();
  check('reload preserves exact historical screenshots and their comments',true);
  await page.getByRole('button',{name:'Show review threads',exact:true}).click();check('reopened thread survives reload',(await page.locator('[aria-label="Review comment threads"]').textContent()).includes('Keep this reply'));
  await page.setViewportSize({width:1050,height:850});await page.screenshot({path:`${output}/comments-narrow.png`,fullPage:true});
  check('no page errors',errors.length===0);
  console.log(JSON.stringify({screenshots:output,errors}));
}catch(error){await page.screenshot({path:`${output}/failure.png`,fullPage:true});console.error(await page.locator('body').innerText());throw error;}
finally{fixture.closeAllConnections();await Promise.all([browser.close(),new Promise((resolve,reject)=>fixture.close(error=>error?reject(error):resolve()))]);}
