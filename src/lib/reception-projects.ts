import type {Folder,Thread} from "@/data/mock";
export function recentReceptionProjects(folders:Folder[],threads:Thread[]){
  const valid=new Set(folders.map(folder=>folder.id));
  const elapsed=(label:string)=>{if(label==="now")return 0;const match=label.match(/^(\d+)(m|h|d)$/);return match?Number(match[1])*({m:1,h:60,d:1440}[match[2]]??1):Infinity;};
  return threads.filter(thread=>!thread.archived&&valid.has(thread.folderId)&&(thread.messages.length>0||thread.name!=="New thread")).sort((a,b)=>elapsed(a.updated)-elapsed(b.updated)).slice(0,3).map(thread=>({id:thread.id,name:thread.name,updated:thread.updated==="now"?"Just now":`Edited ${thread.updated}${/^\d+[mhd]$/.test(thread.updated)?" ago":""}`}));
}
export function githubImportTarget(value:string){
  const url=new URL(value);
  if(url.protocol!=="https:"||url.hostname!=="github.com"||url.username||url.password||url.search||url.hash)throw Error("Use an HTTPS GitHub repository URL, such as https://github.com/owner/repository.");
  const match=url.pathname.match(/^\/([\w.-]+)\/([\w.-]+)\/?$/);
  if(!match||match[1]==="."||match[1]==="..")throw Error("Enter a repository URL with an owner and repository name.");
  const name=match[2].replace(/\.git$/,"");
  if(!name||name==="."||name===".."||name.startsWith("-"))throw Error("This repository name cannot be used as a project folder.");
  return {url:`https://github.com/${match[1]}/${match[2]}`,name};
}
