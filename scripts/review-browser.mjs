// Isolated Chromium previews. No application credentials, extensions or user profile are shared.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { createHash, randomUUID } from 'node:crypto';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function viewport(value){if(!value||![value.width,value.height].every(n=>Number.isInteger(n)&&n>=100&&n<=4096))throw Error('Viewport must contain integer width and height between 100 and 4096 pixels.');return value;}
function pageUrl(value){let url;try{url=new URL(value);}catch{throw Error('Preview requires a complete HTTP(S) URL.');}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Preview requires an HTTP(S) URL without embedded credentials.');return url.href;}

const REVIEW_EVENTS=80, MAX_CAPTURE_PIXELS=8_000_000, MAX_CAPTURE_LENGTH=4_000_000, MAX_RUN_LENGTH=6_000_000;
const LIVE_LEASE_MS=2000, MAX_LIVE_FRAME_LENGTH=2_000_000;
const defaultEnvironment={deviceScale:1,scheme:'light',reducedMotion:false};
function reviewEnvironment(value=defaultEnvironment){
  if(!value||typeof value!=='object')throw Error('Invalid review environment.');
  const {deviceScale,scheme,reducedMotion}={...defaultEnvironment,...value};
  if(![1,1.5,2,3].includes(deviceScale)||!['light','dark'].includes(scheme)||typeof reducedMotion!=='boolean')throw Error('Review environment requires device scale 1, 1.5, 2 or 3, light/dark scheme, and a motion preference.');
  return {deviceScale,scheme,reducedMotion};
}
function diagnosticUrl(value){
  try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?(url.origin+url.pathname).slice(0,400):undefined;}catch{return undefined;}
}
function diagnostic(page,kind,data={}){
  const event={id:++page.eventId,kind,at:Date.now(),...data};
  page.events.push(event);
  if(page.events.length>REVIEW_EVENTS){page.events.shift();page.eventsTruncated=true;}
}

function isAssetFailure(event){
  return (event.kind==='http'||event.kind==='network')&&(
    ['Image','Font','Media','Script','Stylesheet'].includes(event.resourceType)||
    /\.(?:glb|gltf|bin|hdr|exr|ktx2?|basis|draco|drc|woff2?|ttf|otf|avif|webp|png|jpe?g|svg|mp4|webm)$/i.test(event.url??'')
  );
}

function failedAssets(diagnostics){
  return diagnostics.missingImages.length>0||diagnostics.events.some(isAssetFailure);
}

// Runs in the inspected document. Resolve each selector again before using its geometry.
function browserReviewTarget({selector,relative={x:.5,y:.5},interact=false,optional=false}){
  const matches=document.querySelectorAll(selector);
  if(matches.length>1)throw Error('Review target is ambiguous.');
  const element=matches[0];
  if(!element){if(optional)return null;throw Error('Review target was not found.');}
  const {left,top,width,height}=element.getBoundingClientRect();
  const style=getComputedStyle(element);
  const visible=width>0&&height>0&&style.visibility==='visible'&&element.checkVisibility({opacityProperty:true,visibilityProperty:true});
  const inViewport=visible&&left<innerWidth&&top<innerHeight&&left+width>0&&top+height>0;
  const point={x:left+width*relative.x,y:top+height*relative.y};
  if(interact){
    if(!inViewport||point.x<0||point.y<0||point.x>=innerWidth||point.y>=innerHeight)throw Error('Review target point is outside the visible viewport. Scroll it into view first.');
    const hit=document.elementFromPoint(point.x,point.y);
    if(!hit||!element.contains(hit))throw Error('Review target is covered or cannot receive pointer input.');
  }
  return {point,rect:{x:left+scrollX,y:top+scrollY,width,height},visible,inViewport,focused:document.activeElement===element,text:(element.innerText??'').trim().slice(0,500)};
}

function observeReviewFrames(){
  const entryType='long-animation-frame';
  const result={supported:PerformanceObserver.supportedEntryTypes.includes(entryType),entries:[],truncated:false};
  Object.defineProperty(globalThis,'__taroReviewPerformance',{value:result});
  if(!result.supported)return;
  new PerformanceObserver(list=>{
    for(const entry of list.getEntries()){
      result.entries.push({startMs:Math.round(entry.startTime),durationMs:Math.round(entry.duration),blockingMs:Math.round(entry.blockingDuration)});
      if(result.entries.length>24){result.entries.shift();result.truncated=true;}
    }
  }).observe({type:entryType,buffered:true});
}

// Runs inside the isolated preview browser. Reads DOM/style/layout without annotating source.
export function browserPageSnapshot(options={}) {
  const selectorFor=element=>{
    if(element===document.documentElement)return 'html';
    const layer=element.getAttribute('data-taro-layer');
    if(layer&&document.querySelectorAll(`[data-taro-layer="${CSS.escape(layer)}"]`).length===1)return `[data-taro-layer="${CSS.escape(layer)}"]`;
    if(element.id&&document.querySelectorAll(`#${CSS.escape(element.id)}`).length===1)return `#${CSS.escape(element.id)}`;
    const parts=[];let current=element;
    while(current&&current!==document.documentElement){
      const tag=current.tagName.toLowerCase(),siblings=current.parentElement?[...current.parentElement.children].filter(s=>s.tagName===current.tagName):[current];
      parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(current)+1})`);current=current.parentElement;
    }
    return `html > ${parts.join(' > ')}`;
  };
  const component=element=>{
    const rect=element.getBoundingClientRect(),style=getComputedStyle(element);
    const styles=Object.fromEntries(['display','position','fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','color','backgroundColor','padding','gap','borderRadius'].map(key=>[key,style[key]]));
    return {selector:selectorFor(element),layerId:element.getAttribute('data-taro-layer')??undefined,tag:element.tagName.toLowerCase(),text:(element.innerText??element.getAttribute('alt')??element.getAttribute('aria-label')??'').slice(0,300),rect:{x:rect.x+scrollX,y:rect.y+scrollY,width:rect.width,height:rect.height},styles};
  };
  let selected;
  if(options.selector){try{selected=document.querySelector(options.selector);}catch{if(!options.allowMissingSelector)throw Error(`Invalid component selector: ${options.selector}`);}if(!selected&&!options.allowMissingSelector)throw Error(`Component not found: ${options.selector}`);}
  if(options.point){selected=document.elementFromPoint(options.point.x,options.point.y);if(!selected)throw Error('No component at that viewport position.');}
  const nodes=[...document.querySelectorAll('header,nav,main,section,article,h1,h2,h3,p,button,a,input,textarea,select,img,[data-component],[data-testid],[data-taro-layer]')];
  const visible=nodes.filter(el=>{const rect=el.getBoundingClientRect(),style=getComputedStyle(el);return rect.width>0&&rect.height>0&&style.visibility!=='hidden';});
  const anchors={};for(const selector of options.anchors??[]){try{const el=document.querySelector(selector);if(el)anchors[selector]=component(el).rect;}catch{ /* a stale anchor is reported as missing */ }}
  const focused=document.activeElement;
  const missingImages=[...document.images].filter(image=>image.complete&&!image.naturalWidth&&(image.currentSrc||image.src));
  return {url:location.href,title:document.title,viewport:{width:innerWidth,height:innerHeight},document:{width:Math.max(document.documentElement.scrollWidth,innerWidth),height:Math.max(document.documentElement.scrollHeight,innerHeight),scrollX,scrollY},components:visible.slice(0,200).map(component),componentsTruncated:visible.length>200,selection:selected?component(selected):undefined,anchors,source:options.source?document.documentElement.outerHTML:undefined,state:{focusedSelector:focused&&focused!==document.body?selectorFor(focused):undefined,missingImages:missingImages.slice(0,20).map(image=>({selector:selectorFor(image),url:image.currentSrc||image.src})),missingImagesTruncated:missingImages.length>20},performance:globalThis.__taroReviewPerformance};
}

// Conservative DOM lint. Complex paint is explicitly unmeasured, never guessed.
export function browserQualitySnapshot(options={}) {
  const findings=[],unmeasured=[];let measuredText=0,truncated=false;
  const all=[...document.querySelectorAll('*')],nodes=all.slice(0,2000);
  if(all.length>nodes.length)truncated=true;
  const selector=el=>{const layer=el.getAttribute('data-taro-layer');if(layer&&document.querySelectorAll(`[data-taro-layer="${CSS.escape(layer)}"]`).length===1)return `[data-taro-layer="${CSS.escape(layer)}"]`;if(el.id)return `#${CSS.escape(el.id)}`;const parts=[];while(el&&el!==document.documentElement){const tag=el.tagName.toLowerCase(),siblings=[...el.parentElement?.children??[]].filter(s=>s.tagName===el.tagName);parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(el)+1})`);el=el.parentElement;}return `html > ${parts.join(' > ')}`;};
  const add=(rule,severity,el,message,extra={})=>{if(findings.length>=300){truncated=true;return;}findings.push({rule,severity,selector:el?selector(el):undefined,message,...extra});};
  const unknown=(el,reason)=>{if(unmeasured.length>=300){truncated=true;return;}unmeasured.push({selector:selector(el),reason});};
  const rgba=value=>{const m=value.match(/^rgba?\(([^)]+)\)$/);if(!m)return null;const n=m[1].split(/[,\s/]+/).filter(Boolean).map(Number);if(n.length<3||n.some(v=>!Number.isFinite(v)))return null;return [n[0]/255,n[1]/255,n[2]/255,n[3]??1];};
  const composite=(front,back)=>{const a=front[3]+back[3]*(1-front[3]);return a?[0,1,2].map(i=>(front[i]*front[3]+back[i]*back[3]*(1-front[3]))/a).concat(a):[0,0,0,0];};
  const luminance=color=>color.slice(0,3).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
  const contrast=(a,b)=>{const l=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (l[0]+.05)/(l[1]+.05);};
  const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);if(!r.width||!r.height||s.visibility!=='visible'||s.display==='none')return false;for(let p=el;p;p=p.parentElement)if(Number(getComputedStyle(p).opacity)===0||p.hidden)return false;return true;};
  const painters=nodes.filter(el=>{
    const s=getComputedStyle(el);
    return visible(el)&&(el.matches('img,svg,video,canvas,iframe,object')||s.backgroundImage!=='none'||(s.position!=='static'&&rgba(s.backgroundColor)?.[3]>0));
  });
  const overlapsPaint=el=>{
    const r=el.getBoundingClientRect();
    return painters.some(p=>{
      if(p===el||p.contains(el)||el.contains(p))return false;
      const b=p.getBoundingClientRect();
      return r.left<b.right&&r.right>b.left&&r.top<b.bottom&&r.bottom>b.top;
    });
  };
  const background=el=>{
    let color=[0,0,0,0];
    for(let p=el;p;p=p.parentElement){const s=getComputedStyle(p);
      if(s.backgroundImage!=='none'||Number(s.opacity)!==1||s.mixBlendMode!=='normal'||s.filter!=='none'||(s.backdropFilter&&s.backdropFilter!=='none'))return null;
      for(const pseudo of ['::before','::after']){const ps=getComputedStyle(p,pseudo);if(ps.content!=='none'&&ps.content!=='normal'&&ps.display!=='none')return null;}
      if(color[3]<1){const c=rgba(s.backgroundColor);if(!c)return null;color=composite(color,c);}
    }
    // UA canvas is white for light scheme and dark for dark scheme; avoid assuming it.
    return color[3]===1?color:null;
  };
  const effectiveWidth=document.documentElement.clientWidth;
  if(Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth??0)>effectiveWidth+1)add('horizontal-overflow','error',document.documentElement,`Document exceeds the ${effectiveWidth}px layout viewport.`);
  for(const el of nodes){if(!visible(el))continue;const s=getComputedStyle(el),r=el.getBoundingClientRect();
    if(['IMG','AREA'].includes(el.tagName)&&!el.hasAttribute('alt'))add('image-alt','error',el,'Image needs useful alt text, or an empty alt attribute when decorative.');
    if(el.tagName==='IMG'&&el.complete&&!el.naturalWidth)add('image-load','warning',el,'Image did not load; inspect its source and fallback.');
    const interactive=el.matches('button,input:not([type=hidden]),select,textarea,a[href],[role=button]');
    if(interactive){const refs=(el.getAttribute('aria-labelledby')??'').split(/\s+/).map(id=>document.getElementById(id)?.textContent??'').join(' ').trim();const name=(el.getAttribute('aria-label')??'').trim()||refs||[...el.labels??[]].map(label=>label.textContent).join(' ').trim()||(el.innerText??'').trim()||(el.getAttribute('alt')??'').trim()||(el.getAttribute('title')??'').trim()||(el.matches('input[type=submit],input[type=button],input[type=reset]')?el.value:'')||(el.matches('input[type=image]')?el.alt:'')||[...el.querySelectorAll('img[alt]')].map(img=>img.alt).join(' ').trim();
      if(!name)add('accessible-name','error',el,'Interactive element has no measured accessible name.');
      const inlineLink=el.tagName==='A'&&s.display==='inline';
      if(!inlineLink&&(r.width<24||r.height<24))add('target-size','warning',el,`Target is ${Math.round(r.width)}×${Math.round(r.height)}px; inspect the WCAG 2.5.8 exceptions before changing it.`);
    }
    const text=[...el.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());
    if(text&&!['SCRIPT','STYLE','NOSCRIPT'].includes(el.tagName)){
      const fg=rgba(s.color),bg=background(el);
      const uncertainPaint=s.textShadow!=='none'||s.webkitTextFillColor!==s.color||s.backgroundClip==='text'||s.webkitBackgroundClip==='text';
      if(!fg||fg[3]!==1||!bg||uncertainPaint||overlapsPaint(el))unknown(el,'Complex, transparent, overlapping, pseudo-element or image paint requires visual contrast review.');
      else{const ratio=contrast(fg,bg),large=parseFloat(s.fontSize)>=24||(parseFloat(s.fontSize)>=18.66&&Number(s.fontWeight)>=700),required=large?3:4.5;measuredText++;if(ratio<required)add('text-contrast','error',el,`Text contrast ${ratio.toFixed(2)}:1 is below ${required}:1.`,{ratio:Number(ratio.toFixed(3)),required});}
    }
    if(el.matches('input,textarea'))unknown(el,'Placeholder and control chrome contrast require visual review.');
    if(options.spacing?.length&&el.matches('main,section,article,[data-component]')){
      for(const property of ['paddingTop','paddingRight','paddingBottom','paddingLeft','rowGap','columnGap']){const n=parseFloat(s[property]);if(Number.isFinite(n)&&n>0&&!options.spacing.some(step=>Math.abs(step-n)<.6))add('spacing-scale','info',el,`${property} is ${n}px, outside this project spacing scale. Confirm intentional optical spacing.`);}
    }
  }
  if(matchMedia('(prefers-reduced-motion:reduce)').matches){const active=document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getTiming().duration!==0);for(const animation of active.slice(0,20))add('reduced-motion','warning',animation.effect?.target instanceof Element?animation.effect.target:null,'Animation remains active under reduced motion; confirm essential purpose or provide a static alternative.');if(active.length>20)truncated=true;}
  return {findings,unmeasured,truncated,measuredText};
}

export function createReviewBrowser() {
  let child,profile,starting,socket,sequence=0,closed=false,browserVersion,queue=Promise.resolve();
  const pending=new Map(),targets=new Map(),sessions=new Map();
  const enqueue=work=>{const result=queue.catch(()=>{}).then(work);queue=result;return result;};
  const command=(method,params={},sessionId)=>new Promise((resolve,reject)=>{
    if(!socket||socket.readyState!==1)return reject(Error('Preview browser disconnected. Reopen the preview.'));
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(`Browser timed out: ${method}`));},20000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });
  function receiveEvent({sessionId,method,params}){
    const page=sessions.get(sessionId);
    if(!page)return;
    switch(method){
      case 'Page.screencastFrame': {
        const live=page.live;
        if(!live)break;
        // Chromium limits unacknowledged frames. Keep just the latest image until the viewer pulls it.
        live.acks.push(params.sessionId);
        if(params.data.length<=MAX_LIVE_FRAME_LENGTH)live.frame={screenshot:`data:image/jpeg;base64,${params.data}`,viewport:page.viewport,receivedAt:Date.now()};
        break;
      }
      case 'Page.frameNavigated':
        if(!params.frame.parentId){
          if(page.opened)page.navigationId=randomUUID();
          page.events=[];page.eventsTruncated=false;
          if(page.live)page.live.frame=undefined;
        }
        break;
      case 'Page.navigatedWithinDocument':
        if(params.frameId===page.frameId)page.navigationId=randomUUID();
        break;
      case 'Runtime.consoleAPICalled':
        if(['warning','error','assert'].includes(params.type)){
          const frame=params.stackTrace?.callFrames?.[0];
          diagnostic(page,'console',{level:params.type,url:diagnosticUrl(frame?.url),line:frame?frame.lineNumber+1:undefined});
        }
        break;
      case 'Runtime.exceptionThrown':
        diagnostic(page,'exception',{level:'error',url:diagnosticUrl(params.exceptionDetails.url),line:params.exceptionDetails.lineNumber+1});
        break;
      case 'Network.requestWillBeSent':
        if(page.requests.size>=256){page.requests.delete(page.requests.keys().next().value);page.eventsTruncated=true;}
        page.requests.set(params.requestId,diagnosticUrl(params.request.url));
        break;
      case 'Network.responseReceived':
        if(params.response.status>=400)diagnostic(page,'http',{level:'error',status:params.response.status,url:diagnosticUrl(params.response.url),resourceType:params.type});
        break;
      case 'Network.loadingFailed':
        if(!params.canceled)diagnostic(page,'network',{level:'error',reason:/^net::ERR_[A-Z0-9_]+$/.test(params.errorText)?params.errorText:'Request failed',url:page.requests.get(params.requestId),resourceType:params.type});
        page.requests.delete(params.requestId);
        break;
      case 'Network.loadingFinished':
        page.requests.delete(params.requestId);
        break;
      case 'Page.javascriptDialogOpening':
        diagnostic(page,'dialog',{level:'warning',reason:'Preview dialogs are dismissed automatically.',dialogType:params.type});
        void command('Page.handleJavaScriptDialog',{accept:false},sessionId).catch(()=>{});
        break;
    }
  }
  async function start(){
    if(closed)throw Error('Preview browser service is closed.');
    if(socket?.readyState===1)return;
    if(starting)return starting;
    starting=(async()=>{
      if(typeof WebSocket==='undefined')throw Error('Review previews require Node.js 22 or newer.');
      const candidates=[process.env.TARO_REVIEW_BROWSER,
        ...[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean).flatMap(base=>[path.join(base,'Microsoft/Edge/Application/msedge.exe'),path.join(base,'Google/Chrome/Application/chrome.exe')]),
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge','/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome','/usr/bin/microsoft-edge'];
      const executable=candidates.find(candidate=>candidate&&existsSync(candidate));
      if(!executable)throw Error('Install Microsoft Edge or Google Chrome, or set TARO_REVIEW_BROWSER to a Chromium executable.');
      profile=await mkdtemp(path.join(process.env.TARO_REVIEW_PROFILE_ROOT??tmpdir(),'taro-review-'));
      child=spawn(executable,['--headless=new','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','about:blank'],{windowsHide:true,stdio:'ignore'});
      let failure;child.on('error',error=>{failure=error;});
      let connection;
      for(let i=0;i<150;i++){if(failure)throw failure;if(child.exitCode!==null)throw Error('Chromium exited before the preview could open.');try{connection=await readFile(path.join(profile,'DevToolsActivePort'),'utf8');break;}catch{await pause(100);}}
      if(!connection)throw Error('Chromium startup timed out. Check the configured browser executable.');
      const [port,endpoint]=connection.trim().split(/\r?\n/);socket=new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
      await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',()=>reject(Error('Could not connect to the isolated preview browser.')),{once:true});});
      socket.addEventListener('message',event=>{
        const value=JSON.parse(String(event.data));
        if(value.method){receiveEvent(value);return;}
        const waiting=pending.get(value.id);if(!waiting)return;
        pending.delete(value.id);clearTimeout(waiting.timer);value.error?waiting.reject(Error(value.error.message)):waiting.resolve(value.result??{});
      });
      socket.addEventListener('close',()=>{for(const waiting of pending.values()){clearTimeout(waiting.timer);waiting.reject(Error('Preview browser disconnected. Reopen the preview.'));}pending.clear();clearTargets();});
      await command('Browser.setDownloadBehavior',{behavior:'deny'});
      browserVersion=(await command('Browser.getVersion')).product;
    })().catch(async error=>{child?.kill();socket?.close();clearTargets();throw error;}).finally(()=>{starting=undefined;});
    return starting;
  }
  async function target(key,isolated=false){
    if(targets.has(key))return targets.get(key);
    const browserContextId=isolated?(await command('Target.createBrowserContext',{disposeOnDetach:true})).browserContextId:undefined;
    const {targetId}=await command('Target.createTarget',{url:'about:blank',...(browserContextId?{browserContextId}:{})});
    const {sessionId}=await command('Target.attachToTarget',{targetId,flatten:true});
    const value={targetId,sessionId,browserContextId,viewport:{width:920,height:720},environment:defaultEnvironment,opened:false,events:[],eventsTruncated:false,eventId:0,requests:new Map()};
    targets.set(key,value);sessions.set(sessionId,value);
    try{
      if(browserContextId)await command('Browser.setDownloadBehavior',{behavior:'deny',browserContextId});
      await command('Page.enable',{},sessionId);await command('Runtime.enable',{},sessionId);await command('Network.enable',{},sessionId);
      await command('Page.addScriptToEvaluateOnNewDocument',{source:`(${observeReviewFrames.toString()})()`},sessionId);
      return value;
    }catch(error){await closeTarget(key).catch(()=>{});throw error;}
  }
  async function closeTarget(key){
    const page=targets.get(key);
    if(!page)return;
    clearTimeout(page.live?.timer);
    targets.delete(key);sessions.delete(page.sessionId);
    try{await command('Target.closeTarget',{targetId:page.targetId});}
    finally{if(page.browserContextId)await command('Target.disposeBrowserContext',{browserContextId:page.browserContextId});}
  }
  function clearTargets(){
    for(const page of targets.values())clearTimeout(page.live?.timer);
    targets.clear();sessions.clear();
  }
  async function stopLive(page){
    clearTimeout(page.live.timer);
    page.live=undefined;
    await command('Page.stopScreencast',{},page.sessionId);
  }
  async function liveFrame(page,id){
    if(page.live&&page.live.id!==id)throw Error('Another viewer is already following this preview.');
    if(!page.live){
      await command('Page.bringToFront',{},page.sessionId);
      page.live={id,acks:[]};
      try{await command('Page.startScreencast',{format:'jpeg',quality:75,maxWidth:1280,maxHeight:1024,everyNthFrame:1},page.sessionId);}
      catch(error){page.live=undefined;throw error;}
    }
    const live=page.live;
    clearTimeout(live.timer);
    const timer=setTimeout(()=>{void enqueue(async()=>{if(page.live?.timer===timer&&sessions.has(page.sessionId))await stopLive(page);}).catch(()=>{});},LIVE_LEASE_MS);
    timer.unref();
    live.timer=timer;
    const frame=live.frame??{};
    live.frame=undefined;
    await Promise.all(live.acks.splice(0).map(sessionId=>command('Page.screencastFrameAck',{sessionId},page.sessionId)));
    return frame;
  }
  async function evaluate(page,expression){
    const value=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},page.sessionId);
    if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description??value.exceptionDetails.text);
    return value.result?.value;
  }
  async function resize(page,size){
    const {width,height}=viewport(size);
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:page.environment.deviceScale,mobile:false},page.sessionId);
    page.viewport={width,height};
    if(page.live)page.live.frame=undefined;
  }
  async function open(page,content,size,environment){
    const send=(method,params)=>command(method,params,page.sessionId);
    page.content=content;page.environment=reviewEnvironment(environment);page.navigationId=randomUUID();page.opened=false;
    page.events=[];page.eventsTruncated=false;page.requests.clear();
    await resize(page,size);
    await send('Emulation.setEmulatedMedia',{features:[
      {name:'prefers-color-scheme',value:page.environment.scheme},
      {name:'prefers-reduced-motion',value:page.environment.reducedMotion?'reduce':'no-preference'},
    ]});
    const navigated=await send('Page.navigate',{url:content.html!==undefined?'about:blank':content.url});
    if(navigated.errorText)throw Error(`Preview navigation failed: ${navigated.errorText}`);
    page.frameId=navigated.frameId;
    if(content.html!==undefined)await send('Page.setDocumentContent',{frameId:page.frameId,html:content.html});
    for(let i=0;i<150;i++){
      if(await evaluate(page,'document.readyState')==='complete')break;
      if(i===149)throw Error('Preview navigation timed out.');
      await pause(100);
    }
    await evaluate(page,'document.fonts ? Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,1500))]).then(()=>true) : true');
    page.opened=true;
  }
  async function settled(page){await evaluate(page,'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');}
  async function resolveTarget(page,selector,options={}){
    if(typeof selector!=='string'||!selector.trim()||selector.length>500)throw Error('Supply an observed component selector under 500 characters.');
    return evaluate(page,`(${browserReviewTarget.toString()})(${JSON.stringify({selector,...options})})`);
  }
  async function capture(page,request){
    // Chromium suspends animation frames in inactive targets. Focus before waiting
    // for layout so inspecting a second session cannot strand the first one.
    await command('Page.bringToFront',{},page.sessionId);
    await settled(page);
    const {performance:frames,state,...snapshot}=await evaluate(page,`(${browserPageSnapshot.toString()})(${JSON.stringify({selector:request.selector,point:request.point,anchors:request.anchors,allowMissingSelector:request.action!=='inspect',source:request.action==='open'||request.action==='save'})})`);
    const options=request.capture??{},mode=options.mode??'viewport';
    let bounds={x:snapshot.document.scrollX,y:snapshot.document.scrollY,...snapshot.viewport};
    if(mode==='document'){
      const {cssContentSize}=await command('Page.getLayoutMetrics',{},page.sessionId);
      bounds={x:0,y:0,width:Math.max(bounds.width,cssContentSize.width),height:Math.max(bounds.height,cssContentSize.height)};
    }else if(mode==='element'){
      const element=await resolveTarget(page,options.selector);
      if(!element.visible)throw Error('Capture target is not visible.');
      bounds=element.rect;
    }else if(mode==='region')bounds=options.rect;
    else if(mode!=='viewport')throw Error('Unsupported browser capture mode.');
    if(!bounds||![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite)||bounds.width<=0||bounds.height<=0||bounds.x<0||bounds.y<0)throw Error('Capture requires positive document bounds.');
    const clip=mode==='viewport'?undefined:{...bounds,scale:1};
    if(request.capture&&(Math.max(bounds.width,bounds.height)*page.environment.deviceScale>8192||bounds.width*bounds.height*page.environment.deviceScale**2>MAX_CAPTURE_PIXELS))throw Error('Capture exceeds 8 megapixels or 8192 pixels per side. Capture a smaller region.');
    const {data}=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:!!clip,...(clip?{clip}:{})},page.sessionId);
    if(request.capture&&data.length>MAX_CAPTURE_LENGTH)throw Error('Capture exceeds the saved image size limit. Capture a smaller region.');
    const captureId=randomUUID(),capturedAt=Date.now();
    return {...snapshot,captureId,capturedAt,navigationId:page.navigationId,screenshot:`data:image/png;base64,${data}`,
      state:{focusedSelector:state.focusedSelector,actionDurationMs:request.actionDurationMs},
      evidence:{mode,bounds,viewport:snapshot.viewport,scroll:{x:snapshot.document.scrollX,y:snapshot.document.scrollY},...page.environment,browserVersion,capturedAt,navigationId:page.navigationId,url:diagnosticUrl(snapshot.url),selector:options.selector,sceneState:request.sceneState,renderer:request.renderer},
      diagnostics:{events:[...page.events],truncated:page.eventsTruncated||state.missingImagesTruncated||frames?.truncated===true,missingImages:state.missingImages.map(image=>({...image,url:diagnosticUrl(image.url)})),slowFramesSupported:frames?.supported===true,slowFrames:frames?.entries??[]}};
  }
  function validateInput(input){
    if(!input||!['hover','click','scroll','drag','text','key'].includes(input.type))throw Error('Unsupported prototype input.');
    if(input.type==='text'&&(typeof input.text!=='string'||input.text.length>10000))throw Error('Typed text must be under 10000 characters.');
    if(input.type==='scroll'&&![input.deltaX??0,input.deltaY??0].every(value=>Number.isFinite(value)&&Math.abs(value)<=20000))throw Error('Scroll deltas must be between -20000 and 20000.');
    if(input.durationMs!==undefined&&(!Number.isFinite(input.durationMs)||input.durationMs<0||input.durationMs>1500))throw Error('Drag duration must be between 0 and 1500 milliseconds.');
  }
  async function performInput(page,input){
    validateInput(input);
    const send=(method,params)=>command(method,params,page.sessionId);
    const {width,height}=page.viewport;
    const point=async(selector,relative,coords,fallback)=>{
      if(selector!==undefined){
        if(coords!==undefined&&(coords.x!==undefined||coords.y!==undefined))throw Error('Supply a selector or viewport coordinates.');
        if(relative&&![relative.x,relative.y].every(value=>Number.isFinite(value)&&value>=0&&value<=1))throw Error('Relative coordinates must be between zero and one.');
        return (await resolveTarget(page,selector,{interact:true,relative})).point;
      }
      if(relative)throw Error('Relative coordinates require a selector.');
      const value=fallback&&coords?.x===undefined&&coords?.y===undefined?{x:width/2,y:height/2}:coords;
      if(!value||![value.x,value.y].every(Number.isFinite)||value.x<0||value.x>=width||value.y<0||value.y>=height)throw Error('Input must be inside the viewport.');
      return {x:value.x,y:value.y};
    };
    const modifiers=(input.alt?1:0)|(input.ctrl?2:0)|(input.meta?4:0)|(input.shift?8:0);
    const dispatchMouse=(type,location,extra)=>send('Input.dispatchMouseEvent',{type,...location,modifiers,...extra});
    const eventId=page.eventId,started=performance.now();
    if((input.type==='text'||input.type==='key')&&input.selector!==undefined){
      const target=await resolveTarget(page,input.selector);
      if(!target.focused)throw Error(`Input target is not focused: ${input.selector}.`);
    }
    if(input.type==='hover'&&input.leave===true)await dispatchMouse('mouseMoved',{x:-1,y:-1},{});
    else if(input.type==='text')await send('Input.insertText',{text:input.text});
    else if(input.type==='key'){
      const keys={Enter:13,Tab:9,Backspace:8,Delete:46,Escape:27,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,Home:36,End:35,PageUp:33,PageDown:34,' ':32};
      const key=input.key==='Space'?' ':input.key;
      const character=typeof key==='string'&&/^[A-Za-z0-9]$/.test(key);
      const windowsVirtualKeyCode=character?key.toUpperCase().charCodeAt(0):keys[key];
      if(!Number.isInteger(windowsVirtualKeyCode))throw Error('Unsupported preview key.');
      const code=character?(/[A-Za-z]/.test(key)?`Key${key.toUpperCase()}`:`Digit${key}`):key===' '?'Space':key;
      const params={key,code,windowsVirtualKeyCode,modifiers};
      const text=!input.alt&&!input.ctrl&&!input.meta&&(key==='Enter'?'\r':character||key===' '?key:undefined);
      await send('Input.dispatchKeyEvent',{type:text?'keyDown':'rawKeyDown',...params,...(text?{text}:{})});
      await send('Input.dispatchKeyEvent',{type:'keyUp',...params});
    }else{
      let location=await point(input.selector,input.relative,input,input.type==='scroll');
      if(input.type==='scroll')await dispatchMouse('mouseWheel',location,{deltaX:input.deltaX??0,deltaY:input.deltaY??0});
      else{
        const destination=input.type==='drag'?await point(input.toSelector,input.toRelative,input.to):undefined;
        await dispatchMouse('mouseMoved',location,{});
        if(input.type!=='hover'){
          const press={button:'left',clickCount:1};
          // Release even if a move fails. A subsequent input starts with the button up.
          try{
            await dispatchMouse('mousePressed',location,{...press,buttons:1});
            if(destination){
              const start=location,duration=input.durationMs??220,steps=Math.max(6,Math.ceil(duration/24));
              for(let step=1;step<=steps;step++){
                await pause(duration/steps);
                location={x:start.x+(destination.x-start.x)*step/steps,y:start.y+(destination.y-start.y)*step/steps};
                await dispatchMouse('mouseMoved',location,{button:'left',buttons:1});
              }
              await dispatchMouse('mouseMoved',location,{button:'left',buttons:1});
            }
          }finally{await dispatchMouse('mouseReleased',location,{...press,buttons:0});}
        }
      }
    }
    // Compositor wheel scrolling and input-triggered UI updates can complete just after CDP replies.
    if(input.type!=='hover')await pause(75);
    const duration=Math.round(performance.now()-started);
    const dialog=page.events.some(event=>event.id>eventId&&event.kind==='dialog');
    return {duration,eventId,dialog};
  }
  async function matchesState(page,expect){
    const result=await resolveTarget(page,expect.selector,{optional:true});
    return (result!==null)===(expect.present??true)&&
      (expect.text===undefined||result?.text===expect.text)&&
      (expect.inViewport===undefined||result?.inViewport===expect.inViewport)&&
      (expect.focused===undefined||result?.focused===expect.focused);
  }
  async function expectState(page,expect,deadline){
    if(!expect)return;
    do{
      if(await matchesState(page,expect))return;
      await pause(75);
    }while(performance.now()<deadline);
    throw Error(`Expected state was not reached for ${expect.selector}.`);
  }
  function collectFrame(run,capture,details={}){
    const existing=run.frames.reduce((total,frame)=>total+frame.screenshot.length,0);
    if(existing+capture.screenshot.length>MAX_RUN_LENGTH){run.truncated=true;return;}
    run.frames.push({id:capture.captureId,screenshot:capture.screenshot,evidence:capture.evidence,...details});
  }
  function createRun(kind,name){
    return {id:randomUUID(),kind,name,createdAt:Date.now(),status:'passed',frames:[],steps:[],truncated:false};
  }
  async function replay(page,request){
    const plan=request.replay,name=plan?.name;
    if(typeof name!=='string'||!name.trim()||name.length>100||!Array.isArray(plan.steps)||!plan.steps.length||plan.steps.length>6)throw Error('Replay requires a name and one to six steps.');
    for(const step of plan.steps){
      validateInput(step?.input);
      const expect=step.expect;
      if(expect!==undefined&&(!expect||typeof expect.selector!=='string'||expect.selector.length>500||
        (expect.text!==undefined&&(typeof expect.text!=='string'||expect.text.length>500))||
        ['present','inViewport','focused'].some(key=>expect[key]!==undefined&&typeof expect[key]!=='boolean')))throw Error('Replay expectations require a component selector and optional state conditions.');
    }
    const run=createRun('replay',name),key=`replay:${run.id}`;
    const isolated=await target(key,true);
    let observed;
    try{
      await command('Page.bringToFront',{},isolated.sessionId);
      await open(isolated,page.content,request.viewport??page.viewport,request.environment??page.environment);
      const deadline=performance.now()+12000;
      const frame=async sceneState=>capture(isolated,{action:'capture',capture:{mode:'viewport'},sceneState});
      observed=await frame('Initial state');
      collectFrame(run,observed,{label:'Initial state'});
      if(failedAssets(observed.diagnostics))run.status='failed';
      for(const [index,step] of plan.steps.entries()){
        const result={index,label:typeof step.label==='string'?step.label.slice(0,100):step.input.type,status:'passed'};
        let eventId=isolated.eventId;
        try{
          if(performance.now()>=deadline)throw Error('Replay reached its time limit.');
          const alreadyMatched=step.expect&&await matchesState(isolated,step.expect);
          const action=await performInput(isolated,step.input);
          eventId=action.eventId;result.durationMs=action.duration;
          if(action.dialog)throw Error('Preview dialog was dismissed automatically.');
          await expectState(isolated,step.expect,Math.min(deadline,performance.now()+1200));
          if(step.expect)result.transitioned=!alreadyMatched;
        }catch(error){result.status='failed';result.error=String(error.message).split('\n')[0].slice(0,500);run.status='failed';}
        observed=await frame(result.label);
        result.events=observed.diagnostics.events.filter(event=>event.id>eventId);
        if(result.status==='passed'&&failedAssets(observed.diagnostics)){
          result.status='failed';
          result.error='A page resource failed to load during replay.';
          run.status='failed';
        }
        result.frameId=observed.captureId;
        run.steps.push(result);
        collectFrame(run,observed,{label:result.label,step:index});
        if(result.status==='failed')break;
      }
      return {...observed,run};
    }finally{
      await closeTarget(key).catch(()=>{});
      await command('Page.bringToFront',{},page.sessionId).catch(()=>{});
    }
  }
  async function captureMotion(page,request){
    const options=request.motion??{},checkpoints=options.checkpoints;
    if(options.sceneCheckpoints!==undefined)return captureScene(page,request,options.sceneCheckpoints);
    const observedMode=checkpoints===undefined;
    const run=createRun(observedMode?'observed-motion':'animation-checkpoints','Motion evidence');
    const count=observedMode?options.frames??4:checkpoints?.length;
    if(!Number.isInteger(count)||count<2||count>6)throw Error('Capture between two and six motion frames.');
    const interval=options.intervalMs??150;
    if(!Number.isInteger(interval)||interval<50||interval>750)throw Error('Motion frame interval must be between 50 and 750 milliseconds.');
    if(!observedMode&&(!Array.isArray(checkpoints)||!checkpoints.every(value=>Number.isFinite(value)&&value>=0&&value<=1)))throw Error('Animation checkpoints must be between zero and one.');
    const runKey=`__taroMotion_${run.id.replaceAll('-','')}`;
    const store=`globalThis[${JSON.stringify(runKey)}]`;
    let latest;
    if(!observedMode){
      await resolveTarget(page,options.selector);
      await evaluate(page,`(() => {
        const element=document.querySelector(${JSON.stringify(options.selector)});
        const animations=element.getAnimations().filter(animation=>animation.timeline===document.timeline&&Number.isFinite(animation.effect?.getComputedTiming().duration));
        if(!animations.length)throw Error('No active time-based browser animation was found at this selector.');
        ${store}=animations.map(animation=>({animation,time:animation.currentTime,playing:animation.playState==='running'}));
        for(const item of ${store})item.animation.pause();
      })()`);
    }
    const start=performance.now();
    try{
      for(let i=0;i<count;i++){
        if(observedMode&&i)await pause(interval);
        if(!observedMode)await evaluate(page,`(() => {
          for(const {animation} of ${store}){
            const {delay,duration}=animation.effect.getComputedTiming();
            animation.currentTime=delay+Math.min(${checkpoints[i]}*duration,Math.max(0,duration-0.001));
          }
        })()`);
        latest=await capture(page,{action:'capture',capture:{mode:'viewport'},sceneState:observedMode?'Observed live':`Animation checkpoint ${checkpoints[i]}`});
        collectFrame(run,latest,observedMode?{elapsedMs:Math.round(performance.now()-start)}:{checkpoint:checkpoints[i]});
      }
    }finally{
      if(!observedMode)await evaluate(page,`(() => {
        for(const {animation,time,playing} of ${store}??[]){animation.currentTime=time;if(playing)animation.play();}
        delete ${store};
      })()`).catch(()=>{});
    }
    return {...latest,run};
  }
  async function captureScene(page,request,names){
    if(page.content.html===undefined)throw Error('Named checkpoints require a saved HTML scene.');
    if(!Array.isArray(names)||names.length<1||names.length>6||names.some(name=>typeof name!=='string'||!name.trim()||name.length>80))throw Error('Supply between one and six named scene checkpoints.');
    if(request.motion.checkpoints!==undefined)throw Error('Choose named scene states or animation checkpoints.');
    const run=createRun('scene-checkpoints','Scene checkpoints'),key=`scene:${run.id}`;
    const isolated=await target(key,true);
    let latest;
    try{
      await command('Page.bringToFront',{},isolated.sessionId);
      await open(isolated,page.content,request.viewport??page.viewport,request.environment??page.environment);
      if(request.motion.prepareSelector!==undefined)await performInput(isolated,{type:'click',selector:request.motion.prepareSelector});
      for(const name of names){
        const renderer=await evaluate(isolated,`(async name => {
          const stage=document.querySelector('[data-recipe-stage]');
          if(!stage||typeof globalThis.taroRecipeCheckpoint!=='function')throw Error('This scene has no named checkpoint hook.');
          const before=stage.dataset.recipeFrame;
          if(globalThis.taroRecipeCheckpoint(name,{load:true})!==true)throw Error('Unknown named checkpoint.');
          const started=performance.now();
          do{
            await new Promise(resolve=>requestAnimationFrame(resolve));
            if(stage.dataset.recipeRenderer==='fallback'||stage.dataset.recipeFrame!==before)break;
          }while(performance.now()-started<1200);
          if(stage.dataset.recipeCheckpoint!==name)throw Error('The named checkpoint did not become active.');
          const renderer=stage.dataset.recipeRenderer;
          if(renderer!=='fallback'&&renderer!=='pending'&&stage.dataset.recipeFrame===before)throw Error('The scene did not render a frame at the named checkpoint.');
          return ['fallback','pending','webgl'].includes(renderer)?renderer:'page';
        })(${JSON.stringify(name)})`);
        latest=await capture(isolated,{action:'capture',capture:{mode:'viewport'},sceneState:name,renderer});
        if(renderer==='fallback'||renderer==='pending')run.status='incomplete';
        collectFrame(run,latest,{label:name});
      }
      return {...latest,run};
    }finally{
      await closeTarget(key).catch(()=>{});
      await command('Page.bringToFront',{},page.sessionId).catch(()=>{});
    }
  }
  async function execute(request){
    if(typeof request.key!=='string'||!request.key||request.key.length>4096)throw Error('A scoped preview key is required.');
    if(request.action==='live-frame'||request.action==='stop-live'){
      if(typeof request.liveId!=='string'||!/^[-\w]{1,80}$/.test(request.liveId))throw Error('A live viewer ID is required.');
      const page=targets.get(request.key);
      if(request.action==='stop-live'){
        if(!page?.live||page.live.id!==request.liveId)return {stopped:false};
        await stopLive(page);return {stopped:true};
      }
      if(!page?.opened)throw Error('Open a preview before viewing live frames.');
      return liveFrame(page,request.liveId);
    }
    if(!['open','inspect','capture','save','viewport','input','back','forward','reload','close','audit','replay','motion'].includes(request.action))throw Error('Unknown preview browser action.');
    if(request.viewport)viewport(request.viewport);
    if(request.action==='open'&&request.html===undefined)pageUrl(request.url);
    if(request.html!==undefined&&(typeof request.html!=='string'||Buffer.byteLength(request.html)>6*1024*1024))throw Error('HTML previews must be text under 6 MiB.');
    if(request.isolated!==undefined&&typeof request.isolated!=='boolean')throw Error('Invalid browser isolation option.');
    if(request.action!=='open'&&!targets.get(request.key)?.opened)throw Error('Open a preview before inspecting or interacting.');
    await start();const page=await target(request.key,request.isolated),send=(method,params)=>command(method,params,page.sessionId);
    await send('Page.bringToFront',{});
    if(request.action==='close'){await closeTarget(request.key);return {closed:true};}
    if(request.action==='open'){
      const content=request.html!==undefined?{html:request.html}:{url:pageUrl(request.url)};
      await open(page,content,request.viewport??page.viewport,request.environment??page.environment);
    }
    if(request.action==='replay')return replay(page,request);
    if(request.action==='motion')return captureMotion(page,request);
    if(request.action==='audit'){
      if(request.spacing!==undefined&&(!Array.isArray(request.spacing)||request.spacing.length>32||request.spacing.some(n=>!Number.isFinite(n)||n<0||n>256)))throw Error('Invalid project spacing scale.');
      const hash=text=>createHash('sha256').update(text).digest('hex');
      const sourceHash=hash(await evaluate(page,'document.documentElement.outerHTML'));
      const resourceSnapshot=async target=>evaluate(target,`JSON.stringify({
        styles:[...document.styleSheets].map(sheet=>{try{return [sheet.href,[...sheet.cssRules].map(rule=>rule.cssText)];}catch{return [sheet.href,null];}}),
        resources:performance.getEntriesByType('resource').map(entry=>[entry.name,entry.decodedBodySize]).sort(),
        fonts:document.fonts?.status,
      })`);
      const resourceFingerprint=hash(await resourceSnapshot(page));
      const auditKey=`audit:${randomUUID()}`,cases=[];
      try{
        const isolated=await target(auditKey,true);
        for(const scheme of ['light','dark'])for(const mode of ['desktop','mobile','zoom','reduced-motion']){
          const size=mode==='mobile'?{width:320,height:852}:mode==='zoom'?{width:720,height:450}:{width:1440,height:900};
          const reducedMotion=mode==='reduced-motion',zoom=mode==='zoom'?2:1;
          await execute({key:auditKey,action:'open',...page.content,viewport:size,environment:{deviceScale:zoom,scheme,reducedMotion}});
          const measured=await evaluate(isolated,`(${browserQualitySnapshot.toString()})(${JSON.stringify({spacing:request.spacing??[0,4,8,12,16,24,32,48,64,96]})})`);
          const observed=await capture(isolated,{action:'capture'});
          if(failedAssets(observed.diagnostics))measured.findings.unshift({rule:'asset-load-failure',severity:'error',message:'A page image, font, script, stylesheet, or scene resource did not load. Inspect the preview diagnostics for the failed request.'});
          if(isolated.eventsTruncated)measured.truncated=true;
          const observedHash=hash(await evaluate(isolated,'document.documentElement.outerHTML'));
          cases.push({scheme,mode,viewport:size,zoom,reducedMotion,screenshot:observed.screenshot,sourceHash:observedHash,resourceFingerprint:hash(await resourceSnapshot(isolated)),...measured});
        }
      }finally{await closeTarget(auditKey).catch(()=>{});await command('Page.bringToFront',{},page.sessionId).catch(()=>{});}
      const audit={version:1,id:randomUUID(),createdAt:Date.now(),sourceHash,resourceFingerprint,sourceKind:page.content.html!==undefined?'html':'url',status:cases.some(c=>c.truncated||c.sourceHash!==sourceHash||c.resourceFingerprint!==resourceFingerprint)?'incomplete':cases.some(c=>c.findings.some(f=>f.severity!=='info'))?'issues':'measured-clear',cases,
        manualChecks:['Inspect all screenshots for hierarchy, typography, imagery and brand fit.','Exercise keyboard focus order, visible focus and all interaction states.','Review overlapping paint, pseudo-elements, placeholder text, complex contrast and intentional spacing.','Revise the source, save a new revision and rerun checks before claiming completion.'],
        limitations:['These bounded DOM checks are not a complete accessibility certification.','Zoom is a 200% browser-zoom-equivalent layout: half the desktop CSS viewport and double device scale, not native browser UI zoom.','Screenshots cover the initial viewport; inspect content below the fold and interaction states separately.','Contrast uses supported opaque text on solid/composited backgrounds; unsupported paint is explicitly unmeasured.',...(page.content.html===undefined?['Live URLs may change between cases; source fingerprints identify each observed document.']:[])]};
      return {...await capture(page,{action:'capture'}),audit};
    }
    if(request.action==='viewport')await resize(page,request.viewport);
    if(['back','forward'].includes(request.action)){const history=await send('Page.getNavigationHistory');const entry=history.entries[history.currentIndex+(request.action==='back'?-1:1)];if(entry)await send('Page.navigateToHistoryEntry',{entryId:entry.id});await pause(120);}
    if(request.action==='reload'){await send('Page.reload',{});await pause(200);}
    if(request.action==='input'){
      const result=await performInput(page,request.input);
      return capture(page,{...request,actionDurationMs:result.duration});
    }
    return capture(page,request);
  }
  return {
    request(request){return enqueue(()=>execute(request));},
    async close(){closed=true;try{if(socket?.readyState===1)await command('Browser.close');}catch{/* process may already be closed */}socket?.close();child?.kill();clearTargets();
      if(profile&&path.dirname(profile)===path.resolve(process.env.TARO_REVIEW_PROFILE_ROOT??tmpdir())&&path.basename(profile).startsWith('taro-review-')){for(let i=0;i<10;i++){try{await rm(profile,{recursive:true,force:true});break;}catch{await pause(100);}}}
    },
  };
}

if(process.argv.includes('--stdio')){
  const browser=createReviewBrowser();
  const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
  for await(const line of lines){try{const value=await browser.request(JSON.parse(line));process.stdout.write(`${JSON.stringify({ok:true,value})}\n`);}catch(error){process.stdout.write(`${JSON.stringify({ok:false,error:String(error?.message??error)})}\n`);}}
  await browser.close();
}
