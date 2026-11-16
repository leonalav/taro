import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

let vite,browser,page;
before(async()=>{
  vite=await createServer({configFile:false,logLevel:'warn',optimizeDeps:{noDiscovery:true},server:{host:'127.0.0.1',port:0,watch:null}});
  await vite.listen();
  browser=await chromium.launch({headless:true,channel:process.env.TARO_BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined)});
  page=await browser.newPage();
  await page.route('**/motion-export-test',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Filmstrip fixture</title>'}));
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/motion-export-test`);
});
after(async()=>{await browser?.close();await vite?.close();});

test('encodes saved sampled motion as a playable filmstrip with unequal sample intervals',async()=>{
  const outcome=await page.evaluate(async()=>{
    const { encodeReviewMotionVideo }=await import('/src/lib/review-motion-video.ts');
    const canvas=document.createElement('canvas');
    canvas.width=80;canvas.height=48;
    const context=canvas.getContext('2d');
    const samples=[
      {color:'#ff0000',elapsedMs:100},
      {color:'#00ff00',elapsedMs:300},
      {color:'#0000ff',elapsedMs:750},
    ].map(({color,elapsedMs})=>{
      context.fillStyle=color;context.fillRect(0,0,80,48);
      return {screenshot:canvas.toDataURL('image/png'),elapsedMs};
    });
    const {blob,extension}=await encodeReviewMotionVideo(samples);
    const video=document.createElement('video');
    video.muted=true;
    document.body.append(video);
    const url=URL.createObjectURL(blob);
    video.src=url;
    const observed=[];
    const finish=new Promise((resolve,reject)=>{
      const deadline=setTimeout(()=>reject(Error('The saved filmstrip did not complete playback.')),5000);
      video.addEventListener('ended',()=>{clearTimeout(deadline);resolve();},{once:true});
    });
    video.requestVideoFrameCallback(function inspect(_now,metadata){
      context.drawImage(video,0,0);
      const color=[...context.getImageData(40,24,1,1).data].slice(0,3);
      const channel=color.indexOf(Math.max(...color));
      if(observed.at(-1)?.channel!==channel)observed.push({channel,time:metadata.mediaTime});
      video.requestVideoFrameCallback(inspect);
    });
    try{
      await video.play();await finish;
      return {extension,type:blob.type,size:blob.size,width:video.videoWidth,height:video.videoHeight,observed,duration:video.currentTime};
    }finally{video.remove();URL.revokeObjectURL(url);}
  });
  assert.ok(['webm','mp4'].includes(outcome.extension));
  assert.ok(outcome.size>500);
  assert.deepEqual([outcome.width,outcome.height],[80,48]);
  assert.deepEqual(outcome.observed.map(item=>item.channel),[0,1,2],JSON.stringify(outcome));
  assert.ok(Math.abs(outcome.observed[1].time-.2)<.13,JSON.stringify(outcome));
  assert.ok(Math.abs(outcome.observed[2].time-.65)<.13,JSON.stringify(outcome));
  assert.ok(outcome.duration>outcome.observed[2].time,JSON.stringify(outcome));
});

test('reports an unavailable exporter when the browser has no video encoder',async()=>{
  const unavailable=await page.evaluate(async()=>{
    const { reviewMotionVideoFormat,encodeReviewMotionVideo }=await import('/src/lib/review-motion-video.ts');
    const supported=MediaRecorder.isTypeSupported;
    MediaRecorder.isTypeSupported=()=>false;
    try{
      if(reviewMotionVideoFormat()!==undefined)return 'unexpected format';
      await encodeReviewMotionVideo([]);
      return 'unexpected video';
    }catch(error){return error.message;}
    finally{MediaRecorder.isTypeSupported=supported;}
  });
  assert.match(unavailable,/unavailable in this browser/i);
});
