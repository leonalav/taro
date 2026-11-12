// @vitest-environment jsdom
import {act} from "react";
import {createRoot} from "react-dom/client";
import {afterEach,describe,expect,it,vi} from "vitest";
import {ReceptionPage,type ReceptionPageProps} from "./reception-page";

Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
const callbacks=()=>({onOpenRecent:vi.fn(),onViewAll:vi.fn(),onNewProject:vi.fn(),onOpenProject:vi.fn(),onTemplates:vi.fn(),onImportGithub:vi.fn(),onSearch:vi.fn(),onCommands:vi.fn(),onSettings:vi.fn(),onDocs:vi.fn(),onWhatsNew:vi.fn(),onPrompt:vi.fn()});
describe("reception entry actions",()=>{
  let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
  afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
  async function mount(props:Partial<ReceptionPageProps>={}){
    const handlers=callbacks();host=document.createElement("div");document.body.append(host);root=createRoot(host);
    await act(async()=>root.render(<ReceptionPage {...handlers} recent={[{id:"saved",name:"Saved project",updated:"Last active 4m ago"}]} composer={<div>Existing composer</div>} reduceMotion={true} {...props}/>));
    return handlers;
  }
  const click=async(text:string)=>{const button=[...host.querySelectorAll("button")].find(button=>button.textContent?.includes(text));expect(button).toBeDefined();await act(async()=>button!.click());};
  it("opens the saved project and routes distinct new-work actions and starter prompts",async()=>{
    const handlers=await mount();
    await click("Saved project");expect(handlers.onOpenRecent).toHaveBeenCalledWith("saved");
    await click("New project");expect(handlers.onNewProject).toHaveBeenCalledOnce();
    await click("Use a template");expect(handlers.onTemplates).toHaveBeenCalledOnce();
    await click("Import from GitHub");expect(handlers.onImportGithub).toHaveBeenCalledOnce();
    await click("Build a new app");expect(handlers.onPrompt).toHaveBeenCalledWith("Build a new app");
    expect(host.textContent).toContain("Last active 4m ago");expect(host.textContent).not.toContain("Edited Last active");
  });
  it("keeps the workspace rail, status and section headings accessible",async()=>{
    await mount();
    const rail=host.querySelector('nav[aria-label="Workspace shortcuts"]');
    expect(rail).not.toBeNull();
    const labels=[...rail!.querySelectorAll("button")].map(button=>button.getAttribute("aria-label"));
    expect(labels).toEqual(expect.arrayContaining(["New project","Search workspace","Open project","Browse templates","Import from GitHub","Settings"]));
    expect(host.textContent).toContain("Local workspace");
    expect(host.textContent).toContain("1 project");
    expect([...host.querySelectorAll("h2")].map(heading=>heading.textContent)).toEqual(expect.arrayContaining(["Recent","Start something new","Templates"]));
  });
  it("keeps an empty project history honest and surfaces action errors",async()=>{
    await mount({recent:[],onOpenProject:async()=>{throw Error("Folder is unavailable");}});
    expect(host.textContent).toContain("Your next idea starts here.");expect(host.textContent).not.toContain("Nike");
    await click("Open a project");expect(host.querySelector('[role="alert"]')?.textContent).toBe("Folder is unavailable");
  });
});
