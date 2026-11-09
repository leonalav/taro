import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
const names=(await fs.readdir('scripts')).filter(n=>/check.*\.mjs$/.test(n));
const results=[];
for(const name of names){
 let code=await fs.readFile(`scripts/${name}`,'utf8');
 code=code.replace('from "playwright"','from "./browser-tools/node_modules/playwright/index.mjs"');
 code=code.replace('headless: true, args: ["--no-sandbox"]','channel: "msedge", headless: true, chromiumSandbox: true, args: ["--no-proxy-server"]');
 code=code.replaceAll('"/tmp/','"A:/taro/.verification-2026-11-08/');
 await fs.writeFile(`.verification-2026-11-08/legacy-${name}`,code);
 const log=await fs.open(`.verification-2026-11-08/legacy-${name}.log`,'w');
 const exit=await new Promise(resolve=>{const child=spawn(process.execPath,[`.verification-2026-11-08/legacy-${name}`],{stdio:['ignore',log.fd,log.fd]});child.on('exit',resolve);});
 await log.close(); results.push({name,exit}); console.log(name,exit);
}
await fs.writeFile('.verification-2026-11-08/legacy-results.json',JSON.stringify(results,null,2));
process.exitCode=results.some(r=>r.exit!==0)?1:0;
