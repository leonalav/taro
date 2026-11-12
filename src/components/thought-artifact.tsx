import { useEffect, useState } from "react";
import type { ThoughtMessage } from "@/lib/agent-progress";
import ThoughtLine from "./thought-line";
import { useSettings } from "./settings/settings-context";
import "./artifact-sheet.css";

export function ThoughtArtifact({ message }: {message:ThoughtMessage}) {
  const working=message.status==="working";
  const {reduceMotion}=useSettings().appearance;
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{
    if(!working)return;
    setNow(Date.now());
    const timer=window.setInterval(()=>setNow(Date.now()),100);
    return()=>window.clearInterval(timer);
  },[working,message.startedAt]);
  const elapsed=working?Math.max(0,now-message.startedAt)/1000:message.durationMs/1000;
  const doneLabel=message.status==="stopped"?"Stopped after":message.status==="failed"?"Failed after":message.status==="interrupted"?"Interrupted after":"Thought for";
  return <div className="min-w-0 font-mono">
    <ThoughtLine working={working} label={message.label} doneLabel={doneLabel} steps={message.steps} elapsed={elapsed} glyph="dot" fontSize={12} color="var(--artifact-muted, #a8a3b3)" reduceMotion={reduceMotion} collapseOnSettle showTimer/>
  </div>;
}
