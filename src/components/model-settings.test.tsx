// @vitest-environment jsdom
import * as React from "react";
import {act} from "react";
import {createRoot} from "react-dom/client";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const native = vi.hoisted(()=>({invoke:vi.fn(),isTauri:vi.fn(()=>true)}));
vi.mock("@tauri-apps/api/core",()=>native);
import {defaultSettings,type Settings} from "@/data/settings";
import {ModelsSettings} from "./model-settings";
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let host: HTMLDivElement;
let root:ReturnType<typeof createRoot>;
beforeEach(()=>{native.invoke.mockReset().mockResolvedValue(false);native.isTauri.mockReturnValue(true);host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const click = async(text:string)=>{await act(async()=>{[...host.querySelectorAll("button")].find(button=>button.textContent?.trim()===text)!.click();});};
async function fill(label:string,value:string){await act(async()=>{const input=host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true}));});}
function Harness({models=defaultSettings.models,onChange}:{models?:Settings['models'];onChange:(models:Settings['models'])=>void}){
  const [settings,setSettings]=React.useState({...defaultSettings,models});
  return <ModelsSettings settings={settings} update={(key,value)=>{setSettings(current=>({...current,[key]:value}));if(key==='models')onChange(value as Settings['models']);}}/>;
}
describe("model settings and operating-system credentials",()=>{
  it("shows a pending key check until the credential store answers",async()=>{
    native.invoke.mockImplementation(()=>new Promise(()=>{}));
    await act(async()=>root.render(<Harness models={{...defaultSettings.models,customModels:[{id:"m",label:"Saved",endpoint:"https://api.test/v1"}]}} onChange={()=>{}}/>));
    expect(host.textContent).toContain("Checking saved key status");
    expect(host.textContent).not.toContain("No saved key");
  });
  it("saves editable label, API model ID and endpoint while keeping keys out of settings",async()=>{
    const update=vi.fn();
    await act(async()=>root.render(<Harness onChange={update}/>));
    await click("Add model");
    await fill("Display name","My coding model");await fill("Model ID","provider/model-1");await fill("Endpoint URL","https://api.test/v1/responses");await fill("API key","sk-private");
    await click("Save model");
    const saved=update.mock.lastCall![0] as Settings['models'];
    expect(saved.customModels[0]).toMatchObject({label:"My coding model",model:"provider/model-1",endpoint:"https://api.test/v1/responses"});
    expect(JSON.stringify(saved)).not.toContain("sk-private");
    expect(native.invoke).toHaveBeenCalledWith("store_model_key",{modelId:saved.customModels[0].id,secret:"sk-private"});
    await click("Edit");await fill("Display name","Renamed");await fill("Endpoint URL","https://other.test/v1");await click("Save model");
    expect(update.mock.lastCall![0].customModels[0]).toMatchObject({id:saved.customModels[0].id,label:"Renamed",endpoint:"https://other.test/v1"});
  });
  it("keeps configuration unchanged when keyring storage fails and allows retry",async()=>{
    const update=vi.fn();native.invoke.mockRejectedValueOnce("Credential store is locked.");
    await act(async()=>root.render(<Harness onChange={update}/>));
    await click("Add model");await fill("Display name","Local");await fill("Model ID","model");await fill("Endpoint URL","https://api.test/v1");await fill("API key","sk-private");await click("Save model");
    expect(update).not.toHaveBeenCalled();expect(host.querySelector('[role="alert"]')?.textContent).toContain("locked");
    await click("Save model");expect(update).toHaveBeenCalled();
  });
  it("restores key presence without exposing the stored key and deletes it explicitly",async()=>{
    native.invoke.mockResolvedValue(true);const update=vi.fn();
    await act(async()=>root.render(<Harness models={{...defaultSettings.models,customModels:[{id:"m",label:"Saved",endpoint:"https://api.test/v1"}]}} onChange={update}/>));
    expect(native.invoke).toHaveBeenCalledWith("has_model_key",{modelId:"m"});
    expect(host.textContent).toContain("Key saved on this device");
    await click("Edit");await click("Remove saved key");expect(native.invoke).toHaveBeenCalledWith("delete_model_key",{modelId:"m"});
    expect(host.querySelector<HTMLInputElement>('input[aria-label="API key"]')?.value).toBe("");
  });
});
