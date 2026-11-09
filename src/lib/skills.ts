import { invoke, isTauri } from "@tauri-apps/api/core";
import type { SkillConfig } from "@/data/settings";

export interface InstalledSkill { name:string;description:string;path:string;source:string }
export function discoverInstalledSkills(workspaceRoot?:string,directory?:string):Promise<InstalledSkill[]> {
  if(!isTauri())return Promise.reject(Error("Skill discovery requires the desktop app."));
  return invoke("discover_installed_skills",{workspaceRoot:workspaceRoot||null,directory:directory||null});
}
export function importInstalledSkill(workspaceRoot:string,sourcePath:string):Promise<InstalledSkill> {
  if(!isTauri())return Promise.reject(Error("Skill import requires the desktop app."));
  return invoke("import_installed_skill",{workspaceRoot,sourcePath});
}
export function skillConfiguration(skill:InstalledSkill,enabled=true):SkillConfig {
  return {id:skill.name,label:skill.name,description:skill.description,source:"custom",path:skill.path,enabled};
}
export function mergeSkillConfiguration(skills:SkillConfig[],skill:SkillConfig):SkillConfig[] {
  return [...skills.filter(existing=>existing.id!==skill.id),skill];
}
