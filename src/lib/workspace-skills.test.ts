import {describe,it,expect} from 'vitest';
import {resolveWorkspaceSkills} from './workspace-skills';
describe('shared workspace skills',()=>{
  it('exposes discovered skills without requiring a Settings toggle, preserves disabled choices and excludes other workspaces',()=>{
    const found=[{name:'review',description:'Review code',path:'\\\\?\\A:\\repo\\.taro\\skills\\review\\SKILL.md',source:'Taro workspace'},{name:'global',description:'',path:'C:/user/.codex/skills/global/SKILL.md',source:'Codex'},{name:'other',description:'',path:'A:/other/.taro/skills/other/SKILL.md',source:'Taro workspace'}];
    expect(resolveWorkspaceSkills('A:/repo',[],found).map(s=>s.label)).toEqual(['review']);
    expect(resolveWorkspaceSkills('A:/repo',[{id:'review',label:'review',source:'custom',path:'A:/repo/.taro/skills/review/SKILL.md',enabled:false}],found)[0].enabled).toBe(false);
    expect(resolveWorkspaceSkills('A:/other',[],found).map(s=>s.label)).toEqual(['other']);
  });
  it('uses the same .taro precedence as the native Skill loader and removes missing files',()=>{
    const found=['.claude','.taro'].map(base=>({name:'review',description:base,path:`/repo/${base}/skills/review/SKILL.md`,source:'Taro workspace'}));
    expect(resolveWorkspaceSkills('/repo',[],found)).toHaveLength(1);
    expect(resolveWorkspaceSkills('/repo',[],found)[0].description).toBe('.taro');
    expect(resolveWorkspaceSkills('/repo',[{id:'gone',label:'gone',source:'custom',path:'/repo/.taro/skills/gone/SKILL.md',enabled:true}],[])).toEqual([]);
  });
});
