import {chromium} from './browser-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true,chromiumSandbox:true,args:['--no-proxy-server']});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page=await context.newPage(); page.setDefaultTimeout(10000);
const errors=[],checks=[]; page.on('pageerror',e=>errors.push(e.message));
const check=(name,value,detail)=>{checks.push({name,passed:!!value,detail});console.log(value?'PASS':'FAIL',name,detail??'');};
const capture=async name=>page.screenshot({path:`.verification-2026-11-08/${name}.png`,timeout:10000});
try{
 await page.goto('http://127.0.0.1:1420',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Nike/Brand Discovery Edited',exact:false}).click();
 await page.getByRole('button',{name:/View states · Agent foundation sample gallery/}).waitFor();
 const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('taro-chat-v1')));
 const before=await saved(); const original=before.threads.find(t=>t.id==='brand');
 const gallery=page.getByRole('button',{name:/View states · Agent foundation sample gallery/});
 check('Gallery defaults collapsed',await gallery.getAttribute('aria-expanded')==='false');
 await gallery.focus(); await page.keyboard.press('Enter');
 check('Enter expands gallery and retains focus',await gallery.getAttribute('aria-expanded')==='true'&&await gallery.evaluate(e=>e===document.activeElement));
 await page.keyboard.press('Space');
 check('Space collapses gallery',await gallery.getAttribute('aria-expanded')==='false');
 await page.keyboard.press('Enter');
 const summaries=page.locator('summary').filter({hasText:/ · \d+ states$/});
 check('All 16 sample families exist',await summaries.count()===16);
 for(const s of await summaries.all()){await s.focus();await page.keyboard.press('Enter');}
 check('All family disclosures expand',await summaries.evaluateAll(ns=>ns.every(n=>n.parentElement.open)));
 const galleryBody=page.locator(`[id="${await gallery.getAttribute('aria-controls')}"]`);
 check('237 gallery rows',await galleryBody.locator('[data-foundation-row]').count()===237);
 check('No nested buttons',await page.locator('button button').count()===0);
 const spinner=galleryBody.locator('[data-foundation-state="running"] svg.animate-spin').first();
 check('Reduced motion disables spinner animation',await spinner.evaluate(e=>getComputedStyle(e).animationName)==='none');
 const confirm=page.getByRole('button',{name:'Confirm restore',exact:true}).first();
 await confirm.click();
 check('Sample restore stays local and retains focus',await page.getByText('Sample only · Confirm restore. No files, processes, or task allowances were changed.',{exact:true}).count()===1&&await confirm.evaluate(e=>e===document.activeElement));
 check('Sample action leaves persisted chats unchanged',JSON.stringify(await saved())===JSON.stringify(before));
 await gallery.focus();await page.keyboard.press('Enter');
 const planGroup=page.getByRole('button',{name:/^Design plan · Agent foundation artifacts.*1 activity$/});
 await planGroup.focus(); await page.keyboard.press('Enter');
 const planBody=page.locator(`[id="${await planGroup.getAttribute('aria-controls')}"]`);
 await planBody.getByRole('button',{name:'Open',exact:true}).click();
 const panel=page.locator('[data-docs-panel]');await panel.waitFor();
 check('Plan opens existing Markdown editor',await panel.locator('[data-doc-body]').count()===1);
 const heading=panel.locator('[data-block-type="heading"] [role="textbox"]').first();
 await heading.fill('Agent foundation verification 2026-11-08');await heading.press('Enter');
 await capture('foundation-editor');
 await panel.getByRole('button',{name:'Close document',exact:true}).click();
 await page.reload({waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:/^Design plan · Agent foundation artifacts.*1 activity$/}).waitFor();
 const after=await saved(); const brand=after.threads.find(t=>t.id==='brand');
 check('Four sample messages remain unique',brand.messages.filter(m=>m.id.startsWith('nike-foundation-v1-')).length===4&&new Set(brand.messages.map(m=>m.id)).size===brand.messages.length);
 check('Existing history preserved',JSON.stringify(brand.messages.filter(m=>!m.id.startsWith('nike-foundation-v1-')))===JSON.stringify(original.messages.filter(m=>!m.id.startsWith('nike-foundation-v1-'))));
 check('Unrelated chats preserved',JSON.stringify(after.threads.filter(t=>t.id!=='brand'))===JSON.stringify(before.threads.filter(t=>t.id!=='brand')));
 const pg=page.getByRole('button',{name:/^Design plan · Agent foundation artifacts.*1 activity$/});if(await pg.getAttribute('aria-expanded')!=='true')await pg.click();
 await page.locator(`[id="${await pg.getAttribute('aria-controls')}"]`).getByRole('button',{name:'Open',exact:true}).click();
 check('Edited plan survives reload',await page.locator('[data-doc-body] [data-block-type="heading"]').first().innerText()==='Agent foundation verification 2026-11-08');
 await page.locator('[data-docs-panel]').getByRole('button',{name:'Close document',exact:true}).click();
 for(const {name,width,zoom} of [{name:'foundation-wide',width:1440,zoom:1},{name:'foundation-narrow',width:320,zoom:1},{name:'foundation-zoom',width:640,zoom:2}]){
  await page.setViewportSize({width,height:1000}); await page.evaluate(z=>document.documentElement.style.zoom=String(z),zoom);
  const flow=page.getByRole('button',{name:/^Agent foundation · sample workflow/});await flow.scrollIntoViewIfNeeded();
  const metrics=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,zoom:getComputedStyle(document.documentElement).zoom}));
  check(`${name} document overflow`,metrics.scroll<=metrics.width,metrics);await capture(name);
 }
 check('No browser runtime errors',errors.length===0,errors);
}catch(e){checks.push({name:'Harness exception',passed:false,detail:String(e)});console.error(e);await capture('foundation-failure').catch(()=>{});}
finally{await fs.writeFile('.verification-2026-11-08/foundation-browser-results.json',JSON.stringify({browser:browser.version(),checks,errors},null,2));await browser.close();}
process.exitCode=checks.every(c=>c.passed)?0:1;
