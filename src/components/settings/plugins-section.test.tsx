// @vitest-environment jsdom
import * as React from 'react';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const bridge=vi.hoisted(()=>({listMcpTools:vi.fn(),invoke:vi.fn(),isTauri:vi.fn(()=>true)}));
vi.mock('@/lib/agent-tools',()=>({listMcpTools:bridge.listMcpTools}));
vi.mock('@tauri-apps/api/core',()=>({invoke:bridge.invoke,isTauri:bridge.isTauri}));
vi.mock('@/components/skills-settings',()=>({SkillsSettings:()=>null}));
import {defaultSettings,type Settings,type Plugin} from '@/data/settings';
import {PluginsSection} from './sections-workspace';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{bridge.listMcpTools.mockReset();bridge.invoke.mockReset().mockResolvedValue(undefined);bridge.isTauri.mockReturnValue(true);host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const plugin:Plugin={id:'custom-server',name:'My server',description:'Configured server',kind:'MCP',enabled:false,status:'off',transport:'stdio',command:'C:\\Program Files\\MCP\\server.exe',args:['--folder','A:\\my project']};
function Harness({plugins=[plugin],update=()=>{}}:{plugins?:Plugin[];update?:(settings:Settings)=>void}){
  const [settings,setSettings]=React.useState({...defaultSettings,workspaceRoot:'A:\\workspace',plugins});
  return <PluginsSection settings={settings} update={(key,value)=>setSettings(current=>{const next={...current,[key]:value};update(next);return next;})}/>;
}
const click=async(label:string)=>{await act(async()=>{host.querySelector<HTMLElement>(`[aria-label="${label}"]`)!.click();});};
const button=async(label:string)=>{await act(async()=>{[...host.querySelectorAll('button')].find(element=>element.textContent?.trim()===label)!.click();});};
async function fill(label:string,value:string){await act(async()=>{const input=host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});}
describe('MCP settings use real tool discovery',()=>{
  it('ignores a successful response from a previous workspace',async()=>{
    let resolve!:(value:unknown)=>void;bridge.listMcpTools.mockImplementation(()=>new Promise(done=>{resolve=done;}));
    const update=vi.fn();const settings={...defaultSettings,workspaceRoot:'A:\\first',plugins:[{...plugin,enabled:true}]};
    await act(async()=>root.render(<PluginsSection settings={settings} update={update}/>));await click('Test My server connection');
    await act(async()=>root.render(<PluginsSection settings={{...settings,workspaceRoot:'A:\\second'}} update={update}/>));
    await act(async()=>resolve({tools:[{name:'old'}]}));
    expect(host.textContent).toContain('Not tested');expect(host.textContent).not.toContain('Connected');expect(update).not.toHaveBeenCalled();
  });
  it('does not call an enabled server connected before a successful test',async()=>{
    const update=vi.fn();await act(async()=>root.render(<Harness update={update}/>));
    await click('Enable My server');
    expect(host.textContent).not.toContain('Connected');
    expect(update.mock.lastCall![0].plugins[0]).toMatchObject({enabled:true,status:'off'});
    let resolve!:(value:unknown)=>void;bridge.listMcpTools.mockImplementation(()=>new Promise(done=>{resolve=done;}));
    await click('Test My server connection');expect(host.textContent).toContain('Testing');
    expect(bridge.listMcpTools).toHaveBeenCalledWith(expect.objectContaining({command:plugin.command,args:plugin.args}),'A:\\workspace');
    await act(async()=>resolve({tools:[{name:'read'}]}));
    expect(host.textContent).toContain('Connected · 1 tool');
    expect(update.mock.lastCall![0].plugins[0].status).toBe('connected');
  });
  it('retains a failed connection state and permits a real retry',async()=>{
    bridge.listMcpTools.mockRejectedValueOnce(Error('MCP returned HTTP 401')).mockResolvedValueOnce({tools:[]});
    await act(async()=>root.render(<Harness plugins={[{...plugin,enabled:true,status:'needs-auth'}]}/>));
    expect(host.textContent).not.toContain('ConnectConnect');
    await click('Test My server connection');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('401');
    expect(host.textContent).not.toContain('Connected');
    await click('Test My server connection');expect(host.textContent).toContain('Connected · 0 tools');
    expect(bridge.listMcpTools).toHaveBeenCalledTimes(2);
  });
  it('preserves executable paths and JSON arguments without suggesting HTTP keys apply to stdio',async()=>{
    const update=vi.fn();await act(async()=>root.render(<Harness plugins={[]} update={update}/>));
    await button('Add MCP server');await button('Custom (mcp.json)');
    await fill('MCP server name','Local MCP');await fill('MCP executable path','C:\\Program Files\\MCP\\server.exe');
    const args=['--folder','A:\\my project','literal "quoted" value'];await fill('MCP arguments JSON',JSON.stringify(args));
    expect(host.querySelector('[aria-label="MCP API key"]')).toBeNull();
    const add=[...host.querySelectorAll('button')].filter(element=>element.textContent?.trim()==='Add MCP server').at(-1)!;
    await act(async()=>add.click());
    expect(update.mock.lastCall![0].plugins[0]).toMatchObject({command:'C:\\Program Files\\MCP\\server.exe',args,status:'off'});
    expect(bridge.invoke).not.toHaveBeenCalled();
  });
  it('stores HTTP bearer credentials in the keyring and redacts the JSON preview',async()=>{
    const update=vi.fn();await act(async()=>root.render(<Harness plugins={[]} update={update}/>));
    await button('Add MCP server');await button('Custom (mcp.json)');await button('Streamable HTTP');
    await fill('MCP server name','Remote');await fill('MCP server URL','https://mcp.test/server');await fill('MCP API key','sk-mcp-private');
    expect(host.querySelector('pre')?.textContent).not.toContain('sk-mcp-private');expect(host.querySelector('pre')?.textContent).toContain('[stored in OS credential store]');
    const add=[...host.querySelectorAll('button')].filter(element=>element.textContent?.trim()==='Add MCP server').at(-1)!;await act(async()=>add.click());
    expect(bridge.invoke).toHaveBeenCalledWith('store_model_key',expect.objectContaining({secret:'sk-mcp-private'}));
    expect(JSON.stringify(update.mock.lastCall![0])).not.toContain('sk-mcp-private');
  });
  it('rejects malformed arguments without storing keys or metadata',async()=>{
    const update=vi.fn();await act(async()=>root.render(<Harness plugins={[]} update={update}/>));
    await button('Add MCP server');await button('Custom (mcp.json)');await fill('MCP server name','Bad');await fill('MCP executable path','node');await fill('MCP arguments JSON','["unfinished"');
    const add=[...host.querySelectorAll('button')].filter(element=>element.textContent?.trim()==='Add MCP server').at(-1)!;await act(async()=>add.click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('JSON array');expect(update).not.toHaveBeenCalled();expect(bridge.invoke).not.toHaveBeenCalled();
  });
});
