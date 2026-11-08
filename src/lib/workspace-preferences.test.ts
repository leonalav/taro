import {describe,expect,it} from "vitest";
import {restoreWorkspaceRuleSets,workspaceRuleKey} from "./workspace-preferences";
describe("workspace rule preferences",()=>{
  it("restores distinct workspaces, including an intentionally empty rule list",()=>{
    const first=workspaceRuleKey("A:\\work\\first\\","a");
    expect(first).toBe(workspaceRuleKey("a:/work/first","b"));
    const map=restoreWorkspaceRuleSets({[first]:[],[workspaceRuleKey(undefined,"new")]:[{id:"custom",scope:"Code",text:"Use local conventions",enabled:false}],bad:[]});
    expect(map[first]).toEqual([]);
    expect(map["folder:new"][0].enabled).toBe(false);
    expect(map.bad).toBeUndefined();
  });
});
