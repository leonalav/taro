import {describe,expect,it} from "vitest";
import {permissionRuleFromChoice,resolvePermissionRule,upsertPermissionRule,removePermissionRule} from "./permission-rules";

describe("real MCP permission rules",()=>{
  const allow={label:"Always allow tool, this session",allowed:true,target:"tool" as const,duration:"session" as const};
  it("scopes a tool rule to one MCP tool",()=>{
    const rule=permissionRuleFromChoice(allow,"github","get_content")!;
    expect(resolvePermissionRule([rule],"github","get_content")).toBe(true);
    expect(resolvePermissionRule([rule],"github","create_issue")).toBeUndefined();
    expect(resolvePermissionRule([rule],"linear","get_content")).toBeUndefined();
  });
  it("uses the latest matching rule and ignores one-time decisions",()=>{
    const allowServer=permissionRuleFromChoice({label:"Allow MCP",allowed:true,target:"mcp",duration:"always"},"github","get_content")!;
    const denyTool=permissionRuleFromChoice({label:"Deny tool",allowed:false,target:"tool",duration:"session"},"github","get_content")!;
    expect(resolvePermissionRule([allowServer,denyTool],"github","get_content")).toBe(false);
    expect(resolvePermissionRule([allowServer,denyTool],"github","list_content")).toBe(true);
    expect(permissionRuleFromChoice({label:"Allow once",allowed:true,target:"tool",duration:"once"},"github","get_content")).toBeUndefined();
  });
  it("lets a standing gate be changed and removed",()=>{
    const first=permissionRuleFromChoice({label:"Always allow tool",allowed:true,target:"tool",duration:"always"},"workspace","Bash")!;
    const changed=permissionRuleFromChoice({label:"Always deny tool",allowed:false,target:"tool",duration:"always"},"workspace","Bash")!;
    const rules=upsertPermissionRule(upsertPermissionRule([],first),changed);
    expect(rules).toHaveLength(1);
    expect(resolvePermissionRule(rules,"workspace","Bash")).toBe(false);
    expect(removePermissionRule(rules,changed)).toEqual([]);
  });
});
