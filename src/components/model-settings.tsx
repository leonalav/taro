import * as React from "react";
import {invoke, isTauri} from "@tauri-apps/api/core";
import {Plus} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {DropdownMenu} from "@/components/ui/dropdown-menu";
import {Switch} from "@/components/ui/switch";
import {Segmented} from "@/components/ui/segmented";
import {SettingsGroup, SettingsRow} from "@/components/settings/primitives";
import type {SectionProps} from "@/components/settings/sections-personal";
import {builtinModelOptions, MAX_CUSTOM_MODELS, type CustomModel} from "@/data/settings";
import {resolveModelEndpoint} from "@/lib/model-stream";

type SavedModel = CustomModel & {model?:string};
type Draft = {id?:string;label:string;model:string;endpoint:string;key:string};
const emptyDraft = (): Draft => ({label:"",model:"",endpoint:"",key:""});

/** Uses SectionProps. Settings contain model metadata; only native commands see secrets. */
export function ModelsSettings({settings, update}: SectionProps) {
  const models = settings.models;
  const current = React.useRef(models);
  current.current = models;
  const [draft,setDraft] = React.useState<Draft | null>(null);
  const [busy,setBusy] = React.useState(false);
  const [error,setError] = React.useState("");
  const [keys,setKeys] = React.useState<Record<string,boolean | "unavailable">>({});
  const patch = (value:Partial<typeof models>) => update("models",{...current.current,...value});
  const ids = JSON.stringify(models.customModels.map(model=>model.id));
  React.useEffect(()=>{
    let cancelled=false;
    if(isTauri()) for(const id of JSON.parse(ids) as string[]) {
      void invoke<boolean>("has_model_key",{modelId:id}).then(saved=>{
        if(!cancelled)setKeys(existing=>({...existing,[id]:saved}));
      }).catch(()=>{if(!cancelled){setKeys(existing=>({...existing,[id]:"unavailable"}));setError("Could not read saved key status from the operating-system credential store.");}});
    }
    return ()=>{cancelled=true;};
  },[ids]);

  const save = async(event:React.FormEvent) => {
    event.preventDefault();
    if(!draft || busy) return;
    setError("");
    let endpoint:string;
    try {
      resolveModelEndpoint(draft.endpoint);
      endpoint=draft.endpoint.trim().replace(/\/+$/, "");
      if(!draft.label.trim() || !draft.model.trim()) throw new Error("Enter a display name and the provider's model ID.");
      if(!draft.id && current.current.customModels.length >= MAX_CUSTOM_MODELS) throw new Error("The custom model limit has been reached.");
    } catch(cause) {setError(String(cause instanceof Error ? cause.message : cause));return;}
    const id=draft.id ?? `custom-${crypto.randomUUID()}`;
    setBusy(true);
    try {
      if(draft.key.trim()) {
        if(!isTauri()) throw new Error("API keys can be saved only in the desktop app's operating-system credential store.");
        await invoke("store_model_key",{modelId:id,secret:draft.key.trim()});
        setKeys(existing=>({...existing,[id]:true}));
      }
      const saved:SavedModel={id,label:draft.label.trim(),model:draft.model.trim(),endpoint};
      const existing=current.current.customModels;
      patch({customModels:draft.id ? existing.map(model=>model.id===id?saved:model) : [...existing,saved],...(!draft.id ? {defaultModel:id}: {})});
      setDraft(null);
    } catch(cause) {setError(String(cause instanceof Error ? cause.message : cause));}
    finally {setBusy(false);}
  };
  const removeKey = async(id:string) => {
    setBusy(true);setError("");
    try {
      if(!isTauri()) throw new Error("Open the desktop app to remove a stored API key.");
      await invoke("delete_model_key",{modelId:id});
      setKeys(existing=>({...existing,[id]:false}));
      setDraft(existing=>existing ? {...existing,key:""}:null);
    }catch(cause){setError(String(cause instanceof Error?cause.message:cause));}
    finally{setBusy(false);}
  };
  const remove = async(id:string) => {
    setBusy(true);setError("");
    try {
      if(isTauri()) await invoke("delete_model_key",{modelId:id});
      const customModels=current.current.customModels.filter(model=>model.id!==id);
      const fallback=customModels[0]?.id ?? builtinModelOptions[0].value;
      patch({customModels,defaultModel:current.current.defaultModel===id?fallback:current.current.defaultModel,reviewModel:current.current.reviewModel===id?fallback:current.current.reviewModel});
      if(draft?.id===id)setDraft(null);
    } catch(cause){setError(String(cause instanceof Error?cause.message:cause));}
    finally{setBusy(false);}
  };
  const options=[...models.customModels.map(model=>({value:model.id,label:model.label})),...builtinModelOptions.map(model=>({...model,label:`${model.label} · unconfigured`}))];
  const change=(field:keyof Draft,value:string)=>setDraft(existing=>existing?{...existing,[field]:value}:null);
  const keyStatus=(id:string)=>!isTauri()?"Keys available in the desktop app":keys[id]===undefined?"Checking saved key status…":keys[id]==="unavailable"?"Saved key status unavailable":keys[id]?"Key saved on this device":"No saved key · optional for local endpoints";
  return <div className="space-y-8">
    <SettingsGroup title="Model catalog" description="Built-in models need a configured endpoint. Add an OpenAI-compatible model to use chat and tools.">
      <SettingsRow label="Chat model"><DropdownMenu ariaLabel="Chat model" value={models.defaultModel} options={options} onValueChange={defaultModel=>patch({defaultModel})} triggerClassName="w-56"/></SettingsRow>
      <SettingsRow label="Review model"><DropdownMenu ariaLabel="Review model" value={models.reviewModel} options={options} onValueChange={reviewModel=>patch({reviewModel})} triggerClassName="w-56"/></SettingsRow>
      <SettingsRow label="Custom models" description={`${models.customModels.length} of ${MAX_CUSTOM_MODELS} slots used.`}>
        <Button size="sm" variant="secondary" disabled={busy || models.customModels.length >= MAX_CUSTOM_MODELS} onClick={()=>{setError("");setDraft(emptyDraft());}}><Plus/>Add model</Button>
      </SettingsRow>
      {models.customModels.map((saved:SavedModel)=><SettingsRow key={saved.id} label={saved.label} description={<><span className="block break-all font-mono">{saved.model || saved.label} · {saved.endpoint}</span><span>{keyStatus(saved.id)}</span></>}>
        <Button size="sm" variant="ghost" disabled={busy} onClick={()=>{setError("");setDraft({id:saved.id,label:saved.label,model:saved.model || saved.label,endpoint:saved.endpoint,key:""});}}>Edit</Button>
        <Button size="sm" variant="ghost" disabled={busy} aria-label={`Remove ${saved.label}`} onClick={()=>void remove(saved.id)}>Remove</Button>
      </SettingsRow>)}
      {draft && <form className="space-y-3 p-4" onSubmit={event=>void save(event)}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs">Display name<Input aria-label="Display name" value={draft.label} onChange={event=>change("label",event.target.value)} placeholder="My coding model" disabled={busy}/></label>
          <label className="space-y-1 text-xs">Model ID<Input aria-label="Model ID" value={draft.model} onChange={event=>change("model",event.target.value)} placeholder="Provider's exact model ID" disabled={busy}/></label>
          <label className="space-y-1 text-xs sm:col-span-2">Endpoint URL<Input aria-label="Endpoint URL" value={draft.endpoint} onChange={event=>change("endpoint",event.target.value)} placeholder="https://api.example.com/v1 or full /responses URL" disabled={busy}/></label>
          <label className="space-y-1 text-xs sm:col-span-2">API key<Input type="password" autoComplete="new-password" aria-label="API key" value={draft.key} onChange={event=>change("key",event.target.value)} placeholder={draft.id && keys[draft.id]===true ? "Leave blank to keep saved key" : "Optional for local endpoints"} disabled={busy}/></label>
        </div>
        <p className="text-xs text-muted-foreground">Keys stay in your operating-system credential store. Base URLs use chat completions; a full /responses URL uses Responses, including tool calls.</p>
        <div className="flex flex-wrap gap-2"><Button type="submit" size="sm" disabled={busy}>{busy?"Saving…":"Save model"}</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={()=>{setDraft(null);setError("");}}>Cancel</Button>
          {draft.id && keys[draft.id]===true && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={()=>void removeKey(draft.id!)}>Remove saved key</Button>}
        </div>
      </form>}
    </SettingsGroup>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <SettingsGroup title="Thinking effort"><SettingsRow label="Default effort"><Segmented ariaLabel="Thinking effort" value={String(models.effort)} onValueChange={value=>patch({effort:Number(value)})} options={[{value:"0",label:"Low"},{value:"1",label:"Medium"},{value:"2",label:"High"}]}/></SettingsRow></SettingsGroup>
    <SettingsGroup title="Streaming"><SettingsRow label="Stream responses" description="Reveal text as the provider sends it."><Switch aria-label="Stream responses" checked={models.streamResponses} onCheckedChange={streamResponses=>patch({streamResponses})}/></SettingsRow></SettingsGroup>
  </div>;
}
