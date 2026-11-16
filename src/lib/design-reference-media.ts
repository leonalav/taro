import { artifactProjectKey } from './artifact-design';
import { browserEvidenceStorage } from './review-evidence-storage';
import { parseDesignReferences, type DesignReference } from './project-direction';

export interface ReferenceAttachment { id: string; name: string; mime: string; dataUrl?: string }
interface ReferenceMedia { original: string; previews: string[] }
const imageSource = /^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[a-z0-9+/=]+$/i;
const videoSource = /^data:video\/(?:mp4|webm|ogg|quicktime);base64,[a-z0-9+/=]+$/i;
const key = (workspace: string, id: string) => `design-reference:${artifactProjectKey(workspace)}:${id}`;

function canvasFrame(media: CanvasImageSource, width: number, height: number, limit: number) {
  const canvas=document.createElement('canvas');
  const scale=Math.min(1,limit/Math.max(width,height));
  canvas.width=Math.max(1,Math.round(width*scale));
  canvas.height=Math.max(1,Math.round(height*scale));
  const context=canvas.getContext('2d');
  if(!context) throw Error('Could not prepare the reference preview.');
  context.drawImage(media,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/webp',0.68);
}

function waitForMedia(media: EventTarget, event: string, start: () => void) {
  return new Promise<void>((resolve,reject)=>{
    const finish=(error?:Error)=>{
      clearTimeout(timeout);
      media.removeEventListener(event,ready);
      media.removeEventListener('error',failed);
      if(error)reject(error);else resolve();
    };
    const ready=()=>finish(),failed=()=>finish(Error('This reference could not be decoded.'));
    const timeout=setTimeout(()=>finish(Error('The reference took too long to decode.')),5000);
    media.addEventListener(event,ready);
    media.addEventListener('error',failed);
    try{ start(); }catch{ failed(); }
  });
}

export async function compactDesignImage(source: string, limit = 640) {
  if (!imageSource.test(source)) throw Error('Use a supported raster image as a reference.');
  const image=new Image();
  await waitForMedia(image,'load',()=>{image.src=source;});
  return canvasFrame(image,image.naturalWidth,image.naturalHeight,limit);
}

async function sampleClip(source: string) {
  const video=document.createElement('video');
  video.preload='auto';
  video.muted=true;
  try {
    await waitForMedia(video,'loadeddata',()=>{video.src=source;});
    if(!Number.isFinite(video.duration)||video.duration<=0||video.duration>45)throw Error('Use a short clip up to 45 seconds.');
    const frames=[canvasFrame(video,video.videoWidth,video.videoHeight,480)];
    for(const fraction of [0.4,0.8]) {
      await waitForMedia(video,'seeked',()=>{video.currentTime=video.duration*fraction;});
      frames.push(canvasFrame(video,video.videoWidth,video.videoHeight,480));
    }
    return frames;
  } finally {video.removeAttribute('src');video.load();}
}

export async function retainDesignAttachments(workspace: string, attachments: ReferenceAttachment[]): Promise<DesignReference[]> {
  const references: DesignReference[]=[];
  for(const {id,name,dataUrl} of attachments.slice(0,8)) {
    if(!dataUrl)continue;
    const kind=imageSource.test(dataUrl)?'screenshot':videoSource.test(dataUrl)?'clip':undefined;
    if(!kind)continue;
    if(dataUrl.length>14_000_000)throw Error(`Reference ${name} exceeds the saved reference size limit.`);
    const [reference]=parseDesignReferences([{id,kind,label:name.slice(0,120),source:id,learn:'Use as visual reference for the supplied brief.'}]);
    const storageKey=key(workspace,id);
    const existing=await browserEvidenceStorage.read(storageKey);
    if(existing!==null){
      if((JSON.parse(existing) as ReferenceMedia).original!==dataUrl)throw Error('A saved reference ID refers to different media.');
    }else{
      const previews=kind==='clip'?await sampleClip(dataUrl):[await compactDesignImage(dataUrl)];
      await browserEvidenceStorage.write(storageKey,JSON.stringify({original:dataUrl,previews} satisfies ReferenceMedia));
    }
    references.push(reference);
  }
  return references;
}

export async function readDesignReferenceMedia(workspace: string, id: string): Promise<ReferenceMedia | null> {
  if (!/^[a-z0-9][a-z0-9:_-]{0,99}$/i.test(id)) throw Error('Invalid saved reference ID.');
  const stored=await browserEvidenceStorage.read(key(workspace,id));
  if(!stored)return null;
  const data=JSON.parse(stored) as ReferenceMedia;
  if(!Array.isArray(data.previews)||data.previews.length>3||data.previews.some(preview=>!imageSource.test(preview))||!imageSource.test(data.original)&&!videoSource.test(data.original))throw Error('Saved reference media is invalid.');
  return data;
}

export async function retainRenderedReference(workspace:string,id:string,source:string) {
  const existing=await readDesignReferenceMedia(workspace,id);
  if(existing)return existing.previews[0];
  const preview=await compactDesignImage(source);
  await browserEvidenceStorage.write(key(workspace,id),JSON.stringify({original:source,previews:[preview]} satisfies ReferenceMedia));
  return preview;
}

export async function renderedReferenceId(reference:DesignReference,revisionId?:string) {
  const value=JSON.stringify([reference.kind,reference.source,revisionId??reference.revisionId,reference.selector]);
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return `rendered:${Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('')}`;
}
