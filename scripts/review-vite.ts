import type { Plugin } from 'vite';
import { createReviewBrowser } from './review-browser.mjs';

/** Development transport only. Production desktop requests use the native stdio bridge. */
export function reviewBrowserPlugin(): Plugin {
  const browser=createReviewBrowser();
  return {name:'taro-review-browser',configureServer(server){
    server.httpServer?.once('close',()=>{void browser.close();});
    server.middlewares.use('/__taro_review',async(req,res)=>{
      const origin=req.headers.origin;
      if(req.method!=='POST'||req.headers['x-taro-review']!=='1'||!/^127\.0\.0\.1:\d+$|^localhost:\d+$/.test(req.headers.host??'')||(origin&&origin!==`http://${req.headers.host}`)){
        res.writeHead(403,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Review browser requests must originate from this application.'}));return;
      }
      try{
        const chunks:Buffer[]=[];let size=0;
        for await(const chunk of req){size+=chunk.length;if(size>8*1024*1024)throw Error('Preview request exceeds 8 MiB.');chunks.push(Buffer.from(chunk));}
        const value=await browser.request(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));
      }catch(error){res.writeHead(400,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:String(error)}));}
    });
  }};
}
