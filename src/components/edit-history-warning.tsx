import * as React from "react";
import {AlertTriangle} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Dialog} from "@/components/ui/dialog";

const SKIP_KEY="taro-skip-edit-history-warning";

export function shouldWarnOnEdit():boolean {
  try{return localStorage.getItem(SKIP_KEY)!=="true";}catch{return true;}
}

export function EditHistoryWarning({open,onCancel,onContinue}:{open:boolean;onCancel:()=>void;onContinue:()=>void}) {
  const [skip,setSkip]=React.useState(false);
  React.useEffect(()=>{if(open)setSkip(false);},[open]);
  const confirm=()=>{
    if(skip)try{localStorage.setItem(SKIP_KEY,"true");}catch(consoleError){console.error(consoleError);}
    onContinue();
  };
  return <Dialog open={open} onOpenChange={value=>{if(!value)onCancel();}} labelledBy="edit-history-title" className="w-full max-w-[420px] p-5">
    <div className="mb-4 flex size-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400"><AlertTriangle className="size-4.5"/></div>
    <h2 id="edit-history-title" className="text-base font-semibold text-foreground">Send edited message?</h2>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">This will replace this message and remove all later messages in this chat. Earlier messages will stay.</p>
    <label className="mt-5 flex cursor-pointer items-center gap-2.5 text-sm text-foreground/85"><input type="checkbox" checked={skip} onChange={event=>setSkip(event.target.checked)} className="size-4 accent-[var(--taro)]"/>Don’t ask again</label>
    <div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button onClick={confirm}>Send edited message</Button></div>
  </Dialog>;
}
