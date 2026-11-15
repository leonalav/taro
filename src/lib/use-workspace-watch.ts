import {useEffect,useRef} from "react";
import {Channel,invoke,isTauri} from "@tauri-apps/api/core";

/** Stable subscription; refresh callbacks can change without restarting the watcher. */
export function useWorkspaceWatch(root:string|undefined,paths:string[],refresh:()=>Promise<void>,onError:(error:string)=>void){
  const latest=useRef({refresh,onError});latest.current={refresh,onError};
  const pathKey=JSON.stringify([...paths].sort());
  useEffect(()=>{
    if(!root||!isTauri())return;
    let disposed=false,id:string|undefined,running=false,queued=false;
    const update=async()=>{
      if(disposed)return;if(running){queued=true;return;}running=true;
      try{do{queued=false;await latest.current.refresh();}while(queued&&!disposed);}catch(error){if(!disposed)latest.current.onError(String(error));}finally{running=false;}
    };
    const channel=new Channel<void>();channel.onmessage=()=>{void update();};
    void invoke<string>("watch_workspace",{workspaceRoot:root,paths:JSON.parse(pathKey),onChange:channel}).then(watchId=>{
      id=watchId;if(disposed)void invoke("unwatch_workspace",{id}).catch(console.error);else void update();
    }).catch(error=>{if(!disposed)latest.current.onError(`Live refresh unavailable: ${String(error)}`);});
    return()=>{disposed=true;if(id)void invoke("unwatch_workspace",{id}).catch(console.error);};
  },[root,pathKey]);
}
