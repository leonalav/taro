import {useEffect,useMemo,useState} from 'react';
import {isTauri} from '@tauri-apps/api/core';
import type {SkillConfig} from '@/data/settings';
import {discoverInstalledSkills,skillConfiguration,type InstalledSkill} from './skills';
const normalize=(value:string)=>{const path=value.replace(/\\/g,'/').replace(/^\/\/\?\//,'').replace(/\/+$/,'');return /^[a-z]:\//i.test(path)?path.toLowerCase():path;};
const directories=['.taro','.claude','.agents','.codex','.opencode'];
export function resolveWorkspaceSkills(root:string|undefined,configured:SkillConfig[],found:InstalledSkill[]):SkillConfig[]{
  if(!root)return [];
  const prefix=normalize(root)+'/';
  const candidates=found.filter(skill=>skill.source.endsWith('workspace')&&normalize(skill.path).startsWith(prefix)).map(skill=>({skill,relative:normalize(skill.path).slice(prefix.length)})).filter(({relative})=>/^\.(?:taro|claude|agents|codex|opencode)\/skills\/[^/]+\/skill\.md$/i.test(relative)).sort((a,b)=>directories.indexOf(a.relative.split('/')[0])-directories.indexOf(b.relative.split('/')[0]));
  const seen=new Set<string>();
  return candidates.flatMap(({skill})=>{
    if(seen.has(skill.name))return [];seen.add(skill.name);
    const preference=configured.find(item=>item.path&&normalize(item.path).startsWith(prefix)&&(item.id===skill.name||item.label===skill.name));
    return [skillConfiguration(skill,preference?.enabled??true)];
  });
}
/** The composer, Settings and agent receive the same current workspace inventory. */
export function useWorkspaceSkills(root:string|undefined,configured:SkillConfig[]){
  const [inventory,setInventory]=useState<{root:string;found:InstalledSkill[]}>();
  useEffect(()=>{
    if(!root||!isTauri())return;
    let alive=true,sequence=0;
    const refresh=()=>{const request=++sequence;void discoverInstalledSkills(root).then(found=>{if(alive&&request===sequence&&Array.isArray(found))setInventory({root,found});}).catch(()=>{if(alive&&request===sequence)setInventory({root,found:[]});});};
    refresh();window.addEventListener('focus',refresh);window.addEventListener('taro:skills-changed',refresh);window.addEventListener('taro:workspace-changed',refresh);
    return()=>{alive=false;window.removeEventListener('focus',refresh);window.removeEventListener('taro:skills-changed',refresh);window.removeEventListener('taro:workspace-changed',refresh);};
  },[root]);
  return useMemo(()=>resolveWorkspaceSkills(root,configured,inventory&&inventory.root===root?inventory.found:[]),[root,configured,inventory]);
}
