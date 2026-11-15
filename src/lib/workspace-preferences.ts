import type {Rule} from "@/data/settings";
import {normalizeWorkspaceRules} from "./workspace-rules";

export type WorkspaceRuleSets=Record<string,Rule[]>;
export const workspaceRuleKey=(root:string|undefined,folderId:string)=>root?`path:${root.replace(/\\/g,"/").replace(/\/+$/,"").toLowerCase()}`:`folder:${folderId}`;
export function restoreWorkspaceRuleSets(value:unknown):WorkspaceRuleSets{
  if(!value||typeof value!=="object"||Array.isArray(value))return {};
  return Object.fromEntries(Object.entries(value).filter(([key])=>key.startsWith("path:")||key.startsWith("folder:")).map(([key,rules])=>[key,normalizeWorkspaceRules(rules,{migrateLegacySeed:true})]));
}
