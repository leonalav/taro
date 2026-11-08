import {beforeEach,describe,expect,it,vi} from "vitest";
const invoke=vi.hoisted(()=>vi.fn());
vi.mock("@tauri-apps/api/core",()=>({invoke}));
import {createUserTerminal,closeUserTerminal,userTerminals,writeUserTerminal} from "./terminal-sessions";

describe("user terminal ownership",()=>{
  beforeEach(()=>{invoke.mockReset();});
  it("keeps workspace sessions separate and never writes to an agent task",async()=>{
    invoke.mockResolvedValueOnce({id:"user-a",owner:"user",shell:"powershell",workspaceRoot:"A:\\one",cols:80,rows:24});
    await createUserTerminal("A:\\one","powershell");
    expect(userTerminals("a:/one/")).toHaveLength(1);
    expect(userTerminals("A:/two")).toHaveLength(0);
    await expect(writeUserTerminal("shell-agent","exit\r")).rejects.toThrow(/user terminal/);
    await writeUserTerminal("user-a","echo hello\r");
    expect(invoke).toHaveBeenLastCalledWith("terminal_write",{id:"user-a",data:"echo hello\r"});
    await closeUserTerminal("user-a");
    expect(userTerminals("A:/one")).toHaveLength(0);
  });
});
