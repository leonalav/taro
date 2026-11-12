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
  return {url:location.href,title:document.title,viewport:{width:innerWidth,height:innerHeight},document:{width:Math.max(document.documentElement.scrollWidth,innerWidth),height:Math.max(document.documentElement.scrollHeight,innerHeight),scrollX,scrollY},components:visible.slice(0,200).map(component),componentsTruncated:visible.length>200,selection:selected?component(selected):undefined,anchors,source:options.source?document.documentElement.outerHTML:undefined};
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
      if(!inlineLink&&(r.width<24||r.height<24))add('target-size','warning',el,`Target is ${Math.round(r.width)}×${Math.round(r.height)}px; inspect spacing exceptions and increase to at least 24px, preferably 44px.`);
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
  let child,profile,starting,socket,sequence=0,closed=false,queue=Promise.resolve();
  const pending=new Map(),targets=new Map();
  const command=(method,params={},sessionId)=>new Promise((resolve,reject)=>{
    if(!socket||socket.readyState!==1)return reject(Error('Preview browser disconnected. Reopen the preview.'));
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(`Browser timed out: ${method}`));},20000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });
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
      socket.addEventListener('message',event=>{const value=JSON.parse(String(event.data));const waiting=pending.get(value.id);if(!waiting)return;pending.delete(value.id);clearTimeout(waiting.timer);value.error?waiting.reject(Error(value.error.message)):waiting.resolve(value.result??{});});
      socket.addEventListener('close',()=>{for(const waiting of pending.values()){clearTimeout(waiting.timer);waiting.reject(Error('Preview browser disconnected. Reopen the preview.'));}pending.clear();targets.clear();});
      await command('Browser.setDownloadBehavior',{behavior:'deny'});
    })().catch(async error=>{child?.kill();socket?.close();targets.clear();throw error;}).finally(()=>{starting=undefined;});
    return starting;
  }
  async function target(key,isolated=false){
    if(targets.has(key))return targets.get(key);
    const browserContextId=isolated?(await command('Target.createBrowserContext',{disposeOnDetach:true})).browserContextId:undefined;
    const {targetId}=await command('Target.createTarget',{url:'about:blank',...(browserContextId?{browserContextId}:{})});
    const {sessionId}=await command('Target.attachToTarget',{targetId,flatten:true});
    const value={targetId,sessionId,browserContextId,viewport:{width:920,height:720},opened:false};targets.set(key,value);
    await command('Page.enable',{},sessionId);await command('Runtime.enable',{},sessionId);return value;
  }
  async function evaluate(page,expression){
    const value=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},page.sessionId);
    if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description??value.exceptionDetails.text);
    return value.result?.value;
  }
  async function resize(page,size){page.viewport=viewport(size);await command('Emulation.setDeviceMetricsOverride',{...size,deviceScaleFactor:1,mobile:false},page.sessionId);}
  async function settled(page){await evaluate(page,'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');}
  async function capture(page,request){
    // Chromium suspends animation frames in inactive targets. Focus before waiting
    // for layout so inspecting a second session cannot strand the first one.
    await command('Page.bringToFront',{},page.sessionId);
    await settled(page);
    const snapshot=await evaluate(page,`(${browserPageSnapshot.toString()})(${JSON.stringify({selector:request.selector,point:request.point,anchors:request.anchors,allowMissingSelector:request.action!=='inspect',source:request.action==='open'||request.action==='save'})})`);
    const {data}=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},page.sessionId);
    return {...snapshot,screenshot:`data:image/png;base64,${data}`};
  }
  async function execute(request){
    if(typeof request.key!=='string'||!request.key||request.key.length>4096)throw Error('A scoped preview key is required.');
    if(!['open','inspect','capture','save','viewport','input','back','forward','reload','close','audit'].includes(request.action))throw Error('Unknown preview browser action.');
    if(request.viewport)viewport(request.viewport);
    if(request.action==='open'&&request.html===undefined)pageUrl(request.url);
    if(request.html!==undefined&&(typeof request.html!=='string'||Buffer.byteLength(request.html)>6*1024*1024))throw Error('HTML previews must be text under 6 MiB.');
    if(request.isolated!==undefined&&typeof request.isolated!=='boolean')throw Error('Invalid browser isolation option.');
    if(request.action!=='open'&&!targets.get(request.key)?.opened)throw Error('Open a preview before inspecting or interacting.');
    await start();const page=await target(request.key,request.isolated),send=(method,params)=>command(method,params,page.sessionId);
    await send('Page.bringToFront',{});
    if(request.action==='close'){try{await command('Target.closeTarget',{targetId:page.targetId});}finally{targets.delete(request.key);if(page.browserContextId)await command('Target.disposeBrowserContext',{browserContextId:page.browserContextId});}return {closed:true};}
    if(request.action==='open'){
      page.content=request.html!==undefined?{html:request.html}:{url:pageUrl(request.url)};
      page.opened=false;await resize(page,request.viewport??page.viewport);
      const navigated=await send('Page.navigate',{url:request.html!==undefined?'about:blank':pageUrl(request.url)});
      if(navigated.errorText)throw Error(`Preview navigation failed: ${navigated.errorText}`);
      if(request.html!==undefined){const {frameTree}=await send('Page.getFrameTree');await send('Page.setDocumentContent',{frameId:frameTree.frame.id,html:request.html});}
      for(let i=0;i<150;i++){if(await evaluate(page,'document.readyState')==='complete')break;if(i===149)throw Error('Preview navigation timed out.');await pause(100);}
      await evaluate(page,'document.fonts ? Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,1500))]) .then(()=>true) : true');
      page.opened=true;
    }
    if(request.action==='audit'){
      if(request.spacing!==undefined&&(!Array.isArray(request.spacing)||request.spacing.length>32||request.spacing.some(n=>!Number.isFinite(n)||n<0||n>256)))throw Error('Invalid project spacing scale.');
      const hash=text=>createHash('sha256').update(text).digest('hex');
      const sourceHash=hash(await evaluate(page,'document.documentElement.outerHTML'));
      const auditKey=`audit:${randomUUID()}`,cases=[];
      try{
        const isolated=await target(auditKey,true);
        for(const scheme of ['light','dark'])for(const mode of ['desktop','mobile','zoom','reduced-motion']){
          const size=mode==='mobile'?{width:320,height:852}:mode==='zoom'?{width:720,height:450}:{width:1440,height:900};
          const reducedMotion=mode==='reduced-motion',zoom=mode==='zoom'?2:1;
          await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:scheme},{name:'prefers-reduced-motion',value:reducedMotion?'reduce':'no-preference'}]},isolated.sessionId);
          await execute({key:auditKey,action:'open',...page.content,viewport:size});
          await command('Emulation.setDeviceMetricsOverride',{...size,deviceScaleFactor:zoom,mobile:false},isolated.sessionId);
          const measured=await evaluate(isolated,`(${browserQualitySnapshot.toString()})(${JSON.stringify({spacing:request.spacing??[0,4,8,12,16,24,32,48,64,96]})})`);
          const observed=await capture(isolated,{action:'capture'});
          const observedHash=hash(await evaluate(isolated,'document.documentElement.outerHTML'));
          cases.push({scheme,mode,viewport:size,zoom,reducedMotion,screenshot:observed.screenshot,sourceHash:observedHash,...measured});
        }
      }finally{const isolated=targets.get(auditKey);if(isolated){await command('Target.closeTarget',{targetId:isolated.targetId}).catch(()=>{});if(isolated.browserContextId)await command('Target.disposeBrowserContext',{browserContextId:isolated.browserContextId}).catch(()=>{});targets.delete(auditKey);}await command('Page.bringToFront',{},page.sessionId).catch(()=>{});}
      const audit={version:1,id:randomUUID(),createdAt:Date.now(),sourceHash,sourceKind:page.content.html!==undefined?'html':'url',status:cases.some(c=>c.truncated)?'incomplete':cases.some(c=>c.findings.some(f=>f.severity!=='info'))?'issues':'measured-clear',cases,
        manualChecks:['Inspect all screenshots for hierarchy, typography, imagery and brand fit.','Exercise keyboard focus order, visible focus and all interaction states.','Review overlapping paint, pseudo-elements, placeholder text, complex contrast and intentional spacing.','Revise the source, save a new revision and rerun checks before claiming completion.'],
        limitations:['These bounded DOM checks are not a complete accessibility certification.','Zoom is a 200% browser-zoom-equivalent layout: half the desktop CSS viewport and double device scale, not native browser UI zoom.','Screenshots cover the initial viewport; inspect content below the fold and interaction states separately.','Contrast uses supported opaque text on solid/composited backgrounds; unsupported paint is explicitly unmeasured.',...(page.content.html===undefined?['Live URLs may change between cases; source fingerprints identify each observed document.']:[])]};
      return {...await capture(page,{action:'capture'}),audit};
    }
    if(request.action==='viewport')await resize(page,request.viewport);
    if(['back','forward'].includes(request.action)){const history=await send('Page.getNavigationHistory');const entry=history.entries[history.currentIndex+(request.action==='back'?-1:1)];if(entry)await send('Page.navigateToHistoryEntry',{entryId:entry.id});await pause(120);}
    if(request.action==='reload'){await send('Page.reload',{});await pause(200);}
    if(request.action==='input'){
      const input=request.input??{};
      if(input.type==='click'){
        if(![input.x,input.y].every(Number.isFinite)||input.x<0||input.y<0||input.x>page.viewport.width||input.y>page.viewport.height)throw Error('Click must be inside the viewport.');
        await send('Input.dispatchMouseEvent',{type:'mousePressed',x:input.x,y:input.y,button:'left',clickCount:1});
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:input.x,y:input.y,button:'left',clickCount:1});
      }else if(input.type==='scroll'){
        if(![input.deltaX??0,input.deltaY??0].every(Number.isFinite))throw Error('Scroll deltas must be finite.');
        const x=input.x??page.viewport.width/2,y=input.y??page.viewport.height/2;
        if(![x,y].every(Number.isFinite))throw Error('Scroll position must be finite.');
        await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:Math.max(0,Math.min(page.viewport.width-1,x)),y:Math.max(0,Math.min(page.viewport.height-1,y)),deltaX:input.deltaX??0,deltaY:input.deltaY??0});
      }else if(input.type==='text'){
        if(typeof input.text!=='string'||input.text.length>10000)throw Error('Typed text must be under 10000 characters.');await send('Input.insertText',{text:input.text});
      }else if(input.type==='key'){
        const keys={Enter:13,Tab:9,Backspace:8,Delete:46,Escape:27,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,Home:36,End:35};
        if(!keys[input.key])throw Error('Unsupported preview key.');
        await send('Input.dispatchKeyEvent',{type:'keyDown',key:input.key,windowsVirtualKeyCode:keys[input.key]});await send('Input.dispatchKeyEvent',{type:'keyUp',key:input.key,windowsVirtualKeyCode:keys[input.key]});
      }else throw Error('Unsupported prototype input.');
      await pause(60);
    }
    return capture(page,request);
  }
  return {
    request(request){const result=queue.catch(()=>{}).then(()=>execute(request));queue=result;return result;},
    async close(){closed=true;try{if(socket?.readyState===1)await command('Browser.close');}catch{/* process may already be closed */}socket?.close();child?.kill();targets.clear();
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
