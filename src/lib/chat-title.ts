import type {CustomModel} from "@/data/settings";
import type {Thread} from "@/data/mock";
import {streamModel} from "./model-stream";

const TITLE_PROMPT=`Give this coding chat a concise, sentence-case title of 3 to 7 words. Capture the user's main task so the chat is easy to find in a list. Return only JSON in the form {"title":"..."}. Do not use a generic title such as "Code changes".`;

export function parseChatTitle(output:string):string|null {
  const raw=output.trim();
  const fenced=raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  try {
    const value=JSON.parse(fenced?fenced[1]:raw);
    if(typeof value?.title!=="string")return null;
    const title=value.title.replace(/[\r\n\t\x00-\x1f]+/g," ").replace(/\s+/g," ").trim();
    return title && title.length<=80 ? title : null;
  } catch {
    const title=raw.replace(/^["'`]+|["'`]+$/g,"").replace(/\s+/g," ").trim();
    const words=title.split(" ").filter(Boolean).length;
    return !/[{}:\n\r]/.test(raw)&&words>=3&&words<=7&&title.length<=80?title:null;
  }
}

export function canApplyAiTitle(thread:Pick<Thread,"name"|"titleSource">,fallbackTitle:string):boolean {
  return thread.titleSource!=="manual"&&thread.name===fallbackTitle;
}

export async function generateChatTitle(model:Pick<CustomModel,"id"|"label"|"endpoint"|"model">,description:string,requestId:string,stream:typeof streamModel=streamModel):Promise<string|null> {
  if(!description.trim())return null;
  let output="";
  try {
    await stream({requestId,endpoint:model.endpoint,model:model.model||model.label,credentialId:model.id,messages:[{role:"system",content:TITLE_PROMPT},{role:"user",content:description.slice(0,4000)}],tools:undefined},delta=>{output+=delta;});
    return parseChatTitle(output);
  } catch {return null;}
}
