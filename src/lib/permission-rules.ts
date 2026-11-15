import type {PermissionChoice} from "@/data/mock";

export interface PermissionRule {
  server:string;
  tool?:string;
  allowed:boolean;
  duration:"session"|"always";
  target:"tool"|"mcp";
  updatedAt?:number;
}

let ruleSequence=0;

export function permissionRuleFromChoice(choice:PermissionChoice,server:string,tool:string):PermissionRule|undefined {
  if(choice.duration==="once")return undefined;
  return {server,tool:choice.target==="tool"?tool:undefined,allowed:choice.allowed,duration:choice.duration,target:choice.target,updatedAt:Date.now()*1000+(ruleSequence++%1000)};
}

export function resolvePermissionRule(rules:PermissionRule[],server:string,tool:string):boolean|undefined {
  return rules.filter(rule=>rule.server===server&&(rule.target==="mcp"||rule.tool===tool)).sort((a,b)=>(b.updatedAt??0)-(a.updatedAt??0)).at(0)?.allowed;
}

const sameRule=(a:PermissionRule,b:PermissionRule)=>a.server===b.server&&a.target===b.target&&a.tool===b.tool&&a.duration===b.duration;
export function upsertPermissionRule(rules:PermissionRule[],rule:PermissionRule):PermissionRule[] {return [...rules.filter(existing=>!sameRule(existing,rule)),rule];}
export function removePermissionRule(rules:PermissionRule[],rule:PermissionRule):PermissionRule[] {return rules.filter(existing=>!sameRule(existing,rule));}
