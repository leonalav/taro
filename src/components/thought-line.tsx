import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { animate, useReducedMotion, type AnimationPlaybackControls } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons";

/** Adapted from the supplied React Bits ThoughtLine. Sparkle is a dot alias. */
export type ThoughtLineGlyph = "sparkle" | "dot" | "none" | ReactNode;
export interface ThoughtLineProps {
  label?: string;
  doneLabel?: string;
  renderLabel?: (text: string, working: boolean) => ReactNode;
  glyph?: ThoughtLineGlyph;
  steps?: string[];
  collapsible?: boolean;
  collapseOnSettle?: boolean;
  color?: string;
  glyphColor?: string;
  fontSize?: number;
  breathPeriod?: number;
  breathDepth?: number;
  shimmer?: boolean;
  shimmerDuration?: number;
  settleDuration?: number;
  settleBlur?: number;
  working?: boolean;
  settleAfter?: number;
  elapsed?: number;
  showTimer?: boolean;
  onSettle?: (seconds: number) => void;
  reduceMotion?: boolean;
  className?: string;
  style?: CSSProperties;
}

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const EASE_IN_OUT: [number, number, number, number] = [0.77, 0, 0.175, 1];
const EMPTY_STEPS: string[] = [];
const fmt = (ds: number) => ds < 600 ? `${(ds/10).toFixed(1)}s` : `${Math.floor(ds/600)}m ${((ds%600)/10).toFixed(1)}s`;
const spoken = (ds: number) => ds < 600 ? `${(ds/10).toFixed(1)} seconds` : `${Math.floor(ds/600)} minutes ${((ds%600)/10).toFixed(1)} seconds`;

export default function ThoughtLine({
  label="Thinking…", doneLabel="", renderLabel, glyph="dot", steps=EMPTY_STEPS,
  collapsible=true, collapseOnSettle=true, color="currentColor", glyphColor="", fontSize=16,
  breathPeriod=1.6, breathDepth=0.45, shimmer=true, shimmerDuration=1.8,
  settleDuration=350, settleBlur=2, working=true, settleAfter=0, elapsed, showTimer=true,
  onSettle, reduceMotion=false, className="", style,
}: ThoughtLineProps) {
  const systemReducedMotion=useReducedMotion();
  const reduce=reduceMotion||systemReducedMotion;
  const traceId=useId();
  const [autoSettled,setAutoSettled]=useState(false);
  const isWorking=working&&!autoSettled;
  const [open,setOpen]=useState(isWorking||!collapseOnSettle);
  const doneText=doneLabel||(showTimer?"Thought for":"Done thinking");
  const hasTrace=steps.length>0;
  const depth=reduce?0:Math.max(0,Math.min(1,breathDepth));
  const trough=1-depth;
  const sheen=shimmer&&!reduce;
  const glyphRef=useRef<HTMLSpanElement>(null);
  const breathRef=useRef<HTMLSpanElement>(null);
  const timerRef=useRef<HTMLSpanElement>(null);
  const stackRef=useRef<HTMLSpanElement>(null);
  const workRef=useRef<HTMLSpanElement>(null);
  const doneRef=useRef<HTMLSpanElement>(null);
  const dsRef=useRef(Math.max(0,Math.round((elapsed??0)*10)));
  const previousPlacement=useRef(isWorking);
  const previousSettle=useRef(isWorking);
  const latest=useRef(onSettle);
  latest.current=onSettle;
  const [announce,setAnnounce]=useState(isWorking?label:showTimer?`${doneText} ${spoken(dsRef.current)}`:doneText);

  useEffect(()=>{if(working)setAutoSettled(false);},[working]);
  useEffect(()=>{if(isWorking)setOpen(true);else if(collapseOnSettle)setOpen(false);},[isWorking,collapseOnSettle]);

  useEffect(()=>{
    const glyphEl=glyphRef.current,breathEl=breathRef.current;
    if(!breathEl)return;
    const running:AnimationPlaybackControls[]=[];
    let cancelled=false;
    const loop=(element:HTMLElement,delay:number)=>animate(element,{opacity:[trough,1,trough]},{duration:Math.max(0.1,breathPeriod),ease:EASE_IN_OUT,repeat:Infinity,delay});
    if(isWorking&&depth>0){
      if(sheen)running.push(animate(breathEl,{opacity:1},{duration:0.2,ease:EASE_OUT}));
      if(glyphEl){
        const lead=animate(glyphEl,{opacity:trough},{duration:0.2,ease:EASE_OUT});running.push(lead);
        lead.then(()=>{if(cancelled)return;running.push(loop(glyphEl,0));if(!sheen)running.push(loop(breathEl,0.14));});
      }else if(!sheen)running.push(loop(breathEl,0.14));
    }else{
      if(glyphEl)running.push(animate(glyphEl,{opacity:isWorking?1:0.55},{duration:reduce?0:settleDuration/1000,ease:EASE_OUT}));
      running.push(animate(breathEl,{opacity:1},{duration:reduce?0:settleDuration/1000,ease:EASE_OUT}));
    }
    return()=>{cancelled=true;running.forEach(animation=>animation.stop());};
  },[isWorking,breathPeriod,depth,trough,settleDuration,glyph,sheen,reduce]);

  useLayoutEffect(()=>{
    const paint=(ds:number)=>{dsRef.current=ds;if(timerRef.current)timerRef.current.textContent=fmt(ds);};
    if(elapsed!=null){
      paint(Math.max(0,Math.round(elapsed*10)));
      if(isWorking&&settleAfter>0&&elapsed>=settleAfter)setAutoSettled(true);
      return;
    }
    if(!isWorking)return;
    const startedAt=performance.now();paint(0);
    const interval=setInterval(()=>{
      const ds=Math.floor((performance.now()-startedAt)/100);paint(ds);
      if(settleAfter>0&&ds>=Math.round(settleAfter*10))setAutoSettled(true);
    },100);
    return()=>clearInterval(interval);
  },[isWorking,elapsed,settleAfter,showTimer]);

  useLayoutEffect(()=>{
    const timer=timerRef.current,stack=stackRef.current;
    if(!timer||!stack)return;
    const place=(glide:boolean)=>{
      const active=isWorking?workRef.current:doneRef.current;if(!active)return;
      if(!glide)timer.style.transition="none";
      timer.style.transform=`translateX(${active.offsetWidth-stack.offsetWidth}px)`;
      if(!glide){void timer.offsetWidth;timer.style.transition="";}
    };
    place(previousPlacement.current!==isWorking);previousPlacement.current=isWorking;
    if(typeof ResizeObserver==="undefined")return;
    const observer=new ResizeObserver(()=>place(false));
    if(workRef.current)observer.observe(workRef.current);if(doneRef.current)observer.observe(doneRef.current);
    return()=>observer.disconnect();
  },[isWorking,label,doneText,fontSize,showTimer]);

  useEffect(()=>{
    const wasWorking=previousSettle.current;previousSettle.current=isWorking;
    if(isWorking){setAnnounce(label);return;}
    setAnnounce(showTimer?`${doneText} ${spoken(dsRef.current)}`:doneText);
    if(wasWorking)latest.current?.(dsRef.current/10);
  },[isWorking,label,doneText,showTimer]);

  const toggle=hasTrace&&collapsible;
  const head=<>
    {glyph!=="none"&&<span ref={glyphRef} data-glyph={glyph==="dot"||glyph==="sparkle"?"dot":"custom"} className="mr-[0.2em] inline-flex h-[1.1em] w-[1.1em] flex-none [color:var(--tl-glyph)] [&>svg]:block [&>svg]:h-full [&>svg]:w-full" aria-hidden="true">{glyph==="dot"||glyph==="sparkle"?<span className="m-auto h-[0.5em] w-[0.5em] rounded-full bg-current"/>:glyph}</span>}
    <span ref={stackRef} className="inline-grid" aria-hidden="true">
      <span ref={workRef} className="thought-line-layer" data-active={isWorking?"":undefined}><span ref={breathRef} className="thought-line-label inline-block" data-shimmer={sheen?"":undefined}>{renderLabel?renderLabel(label,true):label}</span></span>
      <span ref={doneRef} className="thought-line-layer thought-line-done" data-active={isWorking?undefined:""}>{renderLabel?renderLabel(doneText,false):doneText}</span>
    </span>
    {showTimer&&<span ref={timerRef} className="thought-line-timer tabular-nums" data-done={isWorking?undefined:""} aria-hidden="true">{fmt(dsRef.current)}</span>}
    {toggle&&<span className="thought-line-chevron ml-[0.1em] inline-flex opacity-55" aria-hidden="true"><HugeiconsIcon icon={ArrowDown01Icon} size="1em" strokeWidth={2.2}/></span>}
    <span className="sr-only" role="status">{announce}</span>
  </>;

  return <div data-thought-line="true" data-working={isWorking?"":undefined} data-open={open&&hasTrace?"":undefined} className={`thought-line inline-flex max-w-full flex-col items-start font-medium leading-[1.2] ${className}`} style={{"--tl-font":`${fontSize}px`,"--tl-color":color,"--tl-glyph":glyphColor||color,"--tl-settle":`${settleDuration}ms`,"--tl-blur":`${settleBlur}px`,"--tl-shimmer":`${Math.max(0.1,shimmerDuration)}s`,"--tl-done":"0.65","--tl-timer":"0.55",...style} as CSSProperties}>
    {toggle?<button type="button" aria-expanded={open} aria-controls={traceId} onClick={()=>setOpen(value=>!value)} className="thought-line-head cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-taro">{head}</button>:<div className="thought-line-head">{head}</div>}
    {hasTrace&&<div id={traceId} className="thought-line-trace grid w-full min-w-0" data-open={open?"":undefined} aria-hidden={!open}>
      <div className="min-h-0 overflow-x-visible overflow-y-clip"><div className="flex flex-col gap-[0.45em] pt-[0.6em] pb-[0.2em] pl-[1.6em] text-[0.875em] font-normal">
        {steps.map((text,index)=>{const done=!isWorking||index<steps.length-1;return <div key={`${index}-${text}`} className="thought-line-step flex items-start gap-[0.5em]" data-done={done?"":undefined}>
          <span className="mt-[0.1em] inline-grid h-[1em] w-[1em] flex-none place-items-center opacity-55" aria-hidden="true">{done?<HugeiconsIcon icon={Tick02Icon} size="1em" strokeWidth={2.5}/>:<i className="thought-line-current block h-[0.4em] w-[0.4em] rounded-full bg-current"/>}</span>
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">{text}</span>
        </div>;})}
      </div></div>
    </div>}
  </div>;
}
