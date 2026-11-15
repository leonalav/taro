interface Message {role?:string;content?:unknown;tool_calls?:unknown[];[key:string]:unknown}
const size=(value:unknown)=>JSON.stringify(value).length;
const isImageRead=(message:Message)=>Array.isArray(message.content)&&message.content[0]?.type==="text"&&String(message.content[0]?.text).startsWith("Image read from ");

/** Keep tool-call/result exchanges atomic. Never truncate the current user input. */
export function boundedModelContext(messages:unknown[],budget=64_000):unknown[]{
  const system:Message[]=[],blocks:Message[][]=[];
  for(const value of messages){
    const message=value as Message;
    if(message.role==="system"){system.push(message);continue;}
    if((message.role==="tool"||isImageRead(message))&&blocks.at(-1)?.[0].tool_calls?.length)blocks.at(-1)!.push(message);
    else blocks.push([message]);
  }
  let latestUser=-1;
  blocks.forEach((block,i)=>{if(block[0].role==="user"&&!isImageRead(block[0]))latestUser=i;});
  const keep=new Set([latestUser,blocks.length-1]);
  let used=size(system)+[...keep].filter(i=>i>=0).reduce((n,i)=>n+size(blocks[i]),0);
  for(let i=blocks.length-1;i>=0;i--){if(keep.has(i))continue;const length=size(blocks[i]);if(used+length<=budget){keep.add(i);used+=length;}}
  const omitted=blocks.filter((_,i)=>!keep.has(i)).length;
  return [...system,...(omitted?[{role:"system",content:`${omitted} earlier conversation exchanges were omitted to keep context focused. Use workspace tools to retrieve current facts; do not infer missing results.`}]:[]),...blocks.flatMap((block,i)=>keep.has(i)?block:[])];
}
