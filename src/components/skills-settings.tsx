import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { SkillConfig } from "@/data/settings";
import { discoverInstalledSkills, importInstalledSkill, mergeSkillConfiguration, skillConfiguration, type InstalledSkill } from "@/lib/skills";
import { SettingsGroup, SettingsRow } from "./settings/primitives";

export interface SkillsSettingsProps {workspaceRoot?:string;skills:SkillConfig[];onChange:(skills:SkillConfig[])=>void}
const button="rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-muted disabled:opacity-50";
export function SkillsSettings({workspaceRoot,skills,onChange}:SkillsSettingsProps){
  const [found,setFound]=useState<InstalledSkill[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const generation=useRef(0),latest=useRef({workspaceRoot,skills,onChange});latest.current={workspaceRoot,skills,onChange};
  const scan=async(directory?:string)=>{const token=++generation.current;setBusy(true);setError("");try{const values=await discoverInstalledSkills(workspaceRoot,directory);if(token===generation.current){setFound(values);window.dispatchEvent(new Event("taro:skills-changed"));}}catch(error){if(token===generation.current)setError(String(error));}finally{if(token===generation.current)setBusy(false);}};
  useEffect(()=>{setFound([]);void scan();return()=>{generation.current++;};},[workspaceRoot]);
  const choose=async()=>{try{const directory=await open({directory:true,multiple:false,title:"Choose a skill or skills directory"});if(typeof directory==="string")await scan(directory);}catch(error){setError(String(error));}};
  const add=async(skill:InstalledSkill)=>{const root=workspaceRoot;if(!root)return;setBusy(true);setError("");try{const imported=await importInstalledSkill(root,skill.path);if(latest.current.workspaceRoot!==root)return;latest.current.onChange(mergeSkillConfiguration(latest.current.skills,skillConfiguration(imported)));await scan();}catch(error){if(latest.current.workspaceRoot===root)setError(String(error));}finally{setBusy(false);}};
  const workspaceSkills=found.filter(skill=>skill.source.endsWith("workspace"));
  const configured=skills.filter(skill=>skill.path);
  const installed=found.filter(skill=>!skill.source.endsWith("workspace"));
  const rows=[...configured,...workspaceSkills.filter(skill=>!configured.some(config=>config.id===skill.name)).map(skill=>skillConfiguration(skill))];
  return <div className="space-y-4">
    <SettingsGroup title="Skills" description="Load real SKILL.md instructions from this workspace or import installed Claude Code, Codex and OpenCode skills." action={<div className="flex gap-2"><button className={button} disabled={busy} onClick={()=>void choose()}>Select directory</button><button className={button} disabled={busy} onClick={()=>void scan()}>Refresh</button></div>}>
      {!workspaceRoot&&<SettingsRow label="Select a workspace to import skills."/>}
      {rows.length===0&&<SettingsRow label="No workspace skills configured" description="Installed skills appear below. Import a skill to copy its instructions and supporting files into this workspace."/>}
      {rows.map(skill=><SettingsRow key={skill.id} label={skill.label} description={<>{skill.description&&<>{skill.description}<br/></>}<span className="break-all">{skill.path}</span></>}><input type="checkbox" aria-label={`Enable ${skill.label}`} checked={skill.enabled} onChange={event=>onChange(mergeSkillConfiguration(skills,{...skill,enabled:event.target.checked}))}/></SettingsRow>)}
    </SettingsGroup>
    <SettingsGroup title="Installed skills" description="Import copies files only. Skill instructions retain normal agent and tool permissions.">
      {installed.length===0&&<SettingsRow label={busy?"Scanning skill directories…":"No other installed skills discovered"} description="Use Select directory to locate another installation or an individual skill folder."/>}
      {installed.map(skill=><SettingsRow key={skill.path} label={skill.name} description={<>{skill.source}{skill.description&&` · ${skill.description}`}<br/><span className="break-all">{skill.path}</span></>}><button className={button} disabled={busy||!workspaceRoot||rows.some(row=>row.id===skill.name)} onClick={()=>void add(skill)}>Import</button></SettingsRow>)}
    </SettingsGroup>
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}
