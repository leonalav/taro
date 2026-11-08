import {Terminal} from "@xterm/headless";
import {describe,expect,it} from "vitest";
import {TerminalOutputWriter,terminalLogText} from "./terminal-output";
const bytes=(text:string)=>new TextEncoder().encode(text);
function text(term:Terminal){return Array.from({length:term.buffer.active.length},(_,i)=>term.buffer.active.getLine(i)?.translateToString(true)??"").filter(Boolean).join("\n");}
describe("terminal progress redraws",()=>{
  it("replaces wrapped progress at narrow widths without dropping ordinary log lines",async()=>{
    const term=new Terminal({allowProposedApi:true,cols:40,rows:24}),writer=new TerminalOutputWriter(term);
    await writer.write(bytes("Cloning repository\r\n"));
    for(let i=1;i<=25;i++)await writer.write(bytes(`Receiving objects: ${i}% (1000/65599), 123 KiB | 160 KiB/s\r`));
    await writer.write(bytes("Receiving objects: done\r\nBuild output\r\n"));await writer.finish();
    const rendered=text(term);
    expect(rendered.match(/Receiving objects:/g)).toHaveLength(1);
    expect(rendered).toContain("Cloning repository");expect(rendered).toContain("Build output");expect(rendered).toContain("done");term.dispose();
  });
  it("preserves wrapped normal lines, split CRLF, unicode and ANSI colors",async()=>{
    const term=new Terminal({allowProposedApi:true,cols:20,rows:24}),writer=new TerminalOutputWriter(term);
    await writer.write(bytes("A normal long output line that wraps\r"));
    await writer.write(bytes("\n\x1b[31mError: café\x1b[0m\r\n"));await writer.finish();
    expect(text(term)).toContain("that wraps");expect(text(term)).toContain("Error: café");term.dispose();
  });
  it("keeps only current CR progress in agent logs and retains errors and newlines",()=>{
    expect(terminalLogText("start\r\n1%\r2%\r100%\r\n\x1b[31merror\x1b[0m\n")).toBe("start\n100%\nerror\n");
  });
  it("leaves alternate-screen cursor behavior to interactive applications",async()=>{
    const term=new Terminal({allowProposedApi:true,cols:20,rows:24}),writer=new TerminalOutputWriter(term);
    await writer.write(bytes("\x1b[?1049h1234567890123456789012345\rX"));
    expect(text(term)).toContain("X2345");term.dispose();
  });
});
