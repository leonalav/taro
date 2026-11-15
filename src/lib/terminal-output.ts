interface TerminalSink {
  write(data:Uint8Array|string,done:()=>void):void;
  buffer:{active:{type?:string;baseY:number;cursorY:number;getLine(index:number):{isWrapped:boolean}|undefined}};
}

/** Serialize parser writes so wrap metadata is current before handling a redraw. */
export class TerminalOutputWriter {
  private pendingCR=false;
  constructor(private terminal:TerminalSink){}
  private paint(data:Uint8Array|string){return new Promise<void>(resolve=>this.terminal.write(data,resolve));}
  private async redraw(){
    const buffer=this.terminal.buffer.active;
    if(buffer.type==="alternate"){await this.paint("\r");return;}
    let up=0;
    while(up<buffer.cursorY&&buffer.getLine(buffer.baseY+buffer.cursorY-up)?.isWrapped)up++;
    // Clear only the logical line being redrawn, preserving all other log rows.
    await this.paint(up?"\x1b[2K\x1b[1A".repeat(up)+"\r\x1b[2K":"\r");
  }
  async write(bytes:Uint8Array){
    let start=0;
    for(let i=0;i<bytes.length;i++){
      if(this.pendingCR){
        this.pendingCR=false;
        if(bytes[i]===10){await this.paint(new Uint8Array([13,10]));start=i+1;continue;}
        if(bytes[i]!==13)await this.redraw();
      }
      if(bytes[i]===13){if(i>start)await this.paint(bytes.slice(start,i));this.pendingCR=true;start=i+1;}
    }
    if(start<bytes.length)await this.paint(bytes.slice(start));
  }
  async finish(){if(this.pendingCR){this.pendingCR=false;await this.paint("\r");}}
}

/** Pipe-based agent logs use CR to replace the current progress line. */
export function terminalLogText(output:string){
  return output.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,"").split("\n").map(line=>line.replace(/\r$/,"").split("\r").at(-1)??"").join("\n");
}
