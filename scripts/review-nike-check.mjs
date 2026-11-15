import assert from 'node:assert/strict';
import { chromium } from '../.verification-2026-11-08/browser-tools/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true,channel:'msedge'}),context=await browser.newContext({viewport:{width:1800,height:1200}}),page=await context.newPage();page.setDefaultTimeout(30000);
const errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.route(/\.mp4(?:\?|$)/,route=>route.abort());
await page.addInitScript(()=>localStorage.setItem('taro-preferences-v1',JSON.stringify({appearance:{reduceMotion:true}})));
try{
 await page.goto('http://127.0.0.1:1427',{waitUntil:'domcontentloaded'});await page.locator('.reception-recent').filter({hasText:'Nike/Brand Discovery'}).click();await page.getByRole('button',{name:'Review mode — live design preview',exact:true}).click();await page.locator('[data-artboard]').waitFor();
 assert.equal(await page.locator('[data-review-component]').count(),4);assert.equal(await page.getByRole('button',{name:/Annotation by/}).count(),3);
 await page.getByRole('button',{name:'Annotation by Theo',exact:true}).click();await page.screenshot({path:'.verification-2026-11-09/review-mode/nike-wide.png',fullPage:true});
 await page.evaluate(async()=>{
   const {executeReviewTool}=await import('/src/lib/review-tools.ts');
   const {reviewRepository}=await import('/src/lib/review-persistence.ts');
   const scope={workspace:'',sessionId:'brand'};
   const context={scope,author:'Aria',role:'Designer'};
   const measured=await executeReviewTool('BrowserInspect',{selector:'[data-review-component="hero"]'},context);
   if(!JSON.parse(measured.text).selection.rect.width)throw Error('No observed hero dimensions');
   await executeReviewTool('BrowserComment',{selector:'[data-review-component="hero"]',body:'**Agent recommendation** on the measured hero.'},context);
   await reviewRepository.load(scope);
 });
 await page.getByRole('button',{name:'Annotation by Aria',exact:true}).last().waitFor();
 const aligned=async()=>page.evaluate(()=>{const hero=document.querySelector('[data-review-component="hero"]').getBoundingClientRect(),pins=[...document.querySelectorAll('[aria-label="Annotation by Aria"]')],pin=pins.at(-1).getBoundingClientRect();return {x:Math.abs(pin.x+pin.width/2-(hero.x+hero.width/2)),y:Math.abs(pin.y+pin.height/2-(hero.y+hero.height/2))};});
 await page.waitForFunction(()=>document.querySelectorAll('[aria-label="Annotation by Aria"]').length===3);
 let delta=await aligned();assert.ok(delta.x<2&&delta.y<2,`agent pin initially anchored ${JSON.stringify(delta)}`);
 await page.evaluate(async()=>{const {executeReviewTool}=await import('/src/lib/review-tools.ts');await executeReviewTool('BrowserViewport',{width:393,height:852},{scope:{workspace:'',sessionId:'brand'},author:'Theo',role:'Type & QA'});});
 await page.waitForTimeout(150);delta=await aligned();assert.ok(delta.x<2&&delta.y<2,`agent pin follows responsive hero ${JSON.stringify(delta)}`);
 await page.screenshot({path:'.verification-2026-11-09/review-mode/nike-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS preserved Nike reference, real agent inspection, Markdown recommendation, and responsive component pin anchoring');
}catch(error){await page.screenshot({path:'.verification-2026-11-09/review-mode/nike-failure.png',fullPage:true});throw error;}
finally{await browser.close();}
