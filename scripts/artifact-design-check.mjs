import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { createReviewBrowser } from './review-browser.mjs';

const output=path.resolve('.verification-2026-11-10/artifact-design');
await mkdir(output,{recursive:true});
const vite=await createServer({configFile:false,server:{middlewareMode:true,watch:null},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
const browser=createReviewBrowser();
try{
  const {createArtifactDesign}=await vite.ssrLoadModule('/src/lib/artifact-design.ts');
  const {artifactTemplate}=await vite.ssrLoadModule('/src/lib/artifact-templates.ts');
  const examples=[['editorial','hero','Objects with a point of view'],['product','dashboard','A clearer working day'],['expressive','mobile','Make space for ideas'],['editorial','gallery','Materials in conversation'],['product','form','Start a conversation'],['expressive','pricing','Choose a way to work']];
  const summary=[];
  for(const [direction,kind,title] of examples){
    const design=createArtifactDesign(direction),html=artifactTemplate(design,kind,title),key=`verification-${kind}`;
    await writeFile(path.join(output,`${kind}.html`),html);
    await browser.request({key,action:'open',html});
    const {audit}=await browser.request({key,action:'audit',spacing:Object.values(design.spacing)});
    const issues=audit.cases.flatMap(c=>c.findings.filter(f=>f.severity!=='info').map(f=>({scheme:c.scheme,mode:c.mode,...f})));
    for(const mode of ['desktop','mobile']){
      const capture=audit.cases.find(c=>c.scheme==='light'&&c.mode===mode);
      await writeFile(path.join(output,`${kind}-${mode}.png`),Buffer.from(capture.screenshot.split(',')[1],'base64'));
    }
    await writeFile(path.join(output,`${kind}-audit.json`),JSON.stringify({...audit,cases:audit.cases.map(({screenshot,...c})=>c)},null,2));
    summary.push({direction,kind,status:audit.status,issues,unmeasured:audit.cases.reduce((sum,c)=>sum+c.unmeasured.length,0)});
    await browser.request({key,action:'close'});
  }
  await writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2));
  console.log(JSON.stringify({output,summary},null,2));
  assert.equal(summary.flatMap(item=>item.issues).length,0,'Starter templates must pass measured checks in all eight environments.');
}finally{await browser.close();await vite.close();}
