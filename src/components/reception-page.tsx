import * as React from "react";
import {ArrowRight,ArrowUpRight,BookOpen,Clock3,Command,Folder,FolderOpen,Grid2X2,Layers,Play,Plus,Search,Settings,Zap} from "lucide-react";
import {GitHubMark} from "@/components/github-mark";
import {TaroMark} from "@/components/taro-mark";
import {cn} from "@/utils/cn";
import {trackSpotlight,useCursorGlow,useEntranceChoreography} from "@/lib/premium-motion";
import "./reception-page.css";

export interface ReceptionRecent {id:string;name:string;updated:string;thumbnail?:string}
type Action=()=>void|Promise<void>;
export interface ReceptionPageProps {
  recent:ReceptionRecent[];
  composer:React.ReactNode;
  reduceMotion:boolean;
  error?:string;
  onOpenRecent:(id:string)=>void|Promise<void>;
  onViewAll:Action;
  onNewProject:Action;
  onOpenProject:Action;
  onTemplates:Action;
  onImportGithub:Action;
  onSearch:Action;
  onCommands:Action;
  onSettings:Action;
  onDocs:Action;
  onWhatsNew:Action;
  onPrompt:(text:string)=>void;
}

const suggestions=["Build a new app","Redesign a landing page","Analyze a brand","Create a campaign"];

function RailButton({label,onClick,accent,children}:{label:string;onClick:()=>void;accent?:boolean;children:React.ReactNode}){
  return <button type="button" aria-label={label} title={label} onClick={onClick} className={cn("reception-rail-button",accent&&"reception-rail-button--accent")}>{children}</button>;
}

export function ReceptionPage({recent,composer,reduceMotion,error:externalError,onOpenRecent,onViewAll,onNewProject,onOpenProject,onTemplates,onImportGithub,onSearch,onCommands,onSettings,onDocs,onWhatsNew,onPrompt}:ReceptionPageProps){
  const page=React.useRef<HTMLElement>(null);
  const [error,setError]=React.useState("");
  useEntranceChoreography(page,!reduceMotion,timeline=>{
    timeline
      .from(".reception-rail-brand",{opacity:0,scale:.8,duration:.55})
      .from(".reception-rail-button",{opacity:0,x:-10,stagger:.035,duration:.45},"-=0.35")
      .from(".reception-crumb",{opacity:0,y:-6,duration:.5},"-=0.45")
      .from(".reception-search",{opacity:0,y:-6,duration:.5},"<")
      .from(".reception-hero h1",{opacity:0,y:26,filter:"blur(12px)",duration:.95},"-=0.45")
      .from(".reception-subtitle",{opacity:0,y:14,duration:.6},"-=0.6")
      .from(".reception-composer",{opacity:0,y:20,scale:.99,duration:.85},"-=0.5")
      .from(".reception-suggestions button",{opacity:0,y:8,stagger:.04,duration:.45},"-=0.55")
      .from(".reception-recents",{opacity:0,x:18,duration:.75},"-=0.95")
      .from(".reception-recent",{opacity:0,y:8,stagger:.05,duration:.4},"-=0.55")
      .from(".reception-lower",{opacity:0,y:16,duration:.7},"-=0.6")
      .from(".reception-start-tile",{opacity:0,y:10,stagger:.04,duration:.45},"-=0.5")
      .from(".reception-quick",{opacity:0,x:14,duration:.65},"-=0.65")
      .from(".reception-quick-list>button",{opacity:0,y:6,stagger:.04,duration:.35},"-=0.45")
      .from(".reception-footer",{opacity:0,duration:.5},"-=0.25");
  });
  useCursorGlow(page,".reception-hero-glow",!reduceMotion);
  const run=(action:Action)=>{setError("");void Promise.resolve().then(action).catch(e=>setError(e instanceof Error?e.message:String(e)));};
  const actions=[
    {name:"Open a project…",icon:Folder,keys:["Ctrl","O"],action:onOpenProject},
    {name:"Search in workspace…",icon:Search,keys:["Ctrl","K"],action:onSearch},
    {name:"Command palette…",icon:Command,keys:["Ctrl","Shift","P"],action:onCommands},
    {name:"Settings",icon:Settings,keys:["Ctrl",","],action:onSettings},
  ];
  return <main ref={page} className="reception-page" aria-label="Welcome to Taro">
    <div className="reception-frame">
      <nav className="reception-rail" aria-label="Workspace shortcuts">
        <div className="reception-rail-brand" aria-hidden="true"><TaroMark/></div>
        <div className="reception-rail-group">
          <RailButton label="New project" accent onClick={()=>run(onNewProject)}><Plus/></RailButton>
          <RailButton label="Search workspace" onClick={()=>run(onSearch)}><Search/></RailButton>
          <RailButton label="Open project" onClick={()=>run(onOpenProject)}><FolderOpen/></RailButton>
          <RailButton label="Browse templates" onClick={()=>run(onTemplates)}><Grid2X2/></RailButton>
          <RailButton label="Import from GitHub" onClick={()=>run(onImportGithub)}><GitHubMark/></RailButton>
        </div>
        <div className="reception-rail-group reception-rail-group--end">
          <RailButton label="Documentation" onClick={()=>run(onDocs)}><BookOpen/></RailButton>
          <RailButton label="Settings" onClick={()=>run(onSettings)}><Settings/></RailButton>
        </div>
      </nav>

      <div className="reception-canvas">
        <header className="reception-topbar">
          <p className="reception-crumb"><span className="reception-crumb-mark" aria-hidden="true"><TaroMark/></span>Taro<span aria-hidden="true">/</span><strong>Workspace</strong></p>
          <button type="button" className="reception-search" onClick={()=>run(onSearch)}>
            <Search aria-hidden="true"/><span>Search workspace…</span><kbd>Ctrl</kbd><kbd>K</kbd>
          </button>
        </header>

        {(error||externalError)&&<p className="reception-error" role="alert">{error||externalError}</p>}

        <div className="reception-grid">
          <section className="reception-panel reception-hero" aria-labelledby="reception-title">
            <div className="reception-hero-art" aria-hidden="true"/>
            <div className="reception-hero-glow" aria-hidden="true"/>
            <h1 id="reception-title">Welcome to <em>Taro</em></h1>
            <p className="reception-subtitle">Design-first coding agent for turning ideas into production-ready products.</p>
            <div className="reception-composer">{composer}</div>
            <div className="reception-suggestions" aria-label="Ideas for your next project">{suggestions.map(text=><button key={text} type="button" onClick={()=>onPrompt(text)}><ArrowUpRight aria-hidden="true"/>{text}</button>)}</div>
          </section>

          <section className="reception-panel reception-recents" aria-labelledby="reception-recent-title" onPointerMove={trackSpotlight}>
            <div className="reception-panel-head">
              <h2 id="reception-recent-title"><Clock3 aria-hidden="true"/>Recent</h2>
              <button type="button" className="reception-text-action" onClick={()=>run(onViewAll)}>View all<ArrowRight aria-hidden="true"/></button>
            </div>
            <div className="reception-recent-list">{recent.length?recent.slice(0,4).map((project,i)=><button type="button" className="reception-recent" key={project.id} onClick={()=>run(()=>onOpenRecent(project.id))}>
              <span className={`reception-recent-avatar reception-recent-avatar--${i%3}`} aria-hidden="true">{project.thumbnail?<img src={project.thumbnail} alt=""/>:project.name.slice(0,1).toUpperCase()}</span>
              <span className="reception-recent-copy"><strong>{project.name}</strong><span>{project.updated}</span></span>
              <span className="reception-resume" aria-hidden="true"><Play/></span>
            </button>):<div className="reception-recents-empty"><FolderOpen aria-hidden="true"/><p>Your next idea starts here.</p><span>Open a project or create something new.</span></div>}</div>
            <p className="reception-panel-foot">Saved chats from your open folders. Resume one, or start below.</p>
          </section>

          <div className="reception-lower">
            <section className="reception-panel reception-start" aria-labelledby="reception-start-title" onPointerMove={trackSpotlight}>
              <div className="reception-panel-head">
                <h2 id="reception-start-title">Start something new</h2>
              </div>
              <div className="reception-start-grid">
                <button type="button" className="reception-start-tile reception-start-tile--primary" onPointerMove={trackSpotlight} onClick={()=>run(onNewProject)}><Plus className="reception-tile-icon" aria-hidden="true"/><strong>New project</strong><span>Start from a blank canvas</span></button>
                <button type="button" className="reception-start-tile" onPointerMove={trackSpotlight} onClick={()=>run(onOpenProject)}><Folder className="reception-tile-icon" aria-hidden="true"/><strong>Open project</strong><span>Work on an existing project</span></button>
                <button type="button" className="reception-start-tile" onPointerMove={trackSpotlight} onClick={()=>run(onTemplates)}><Grid2X2 className="reception-tile-icon" aria-hidden="true"/><strong>Use a template</strong><span>Find a starting point for your idea</span></button>
                <button type="button" className="reception-start-tile" onPointerMove={trackSpotlight} onClick={()=>run(onImportGithub)}><GitHubMark className="reception-tile-icon"/><strong>Import from GitHub</strong><span>Bring an existing repo</span></button>
              </div>
            </section>

            <section className="reception-panel reception-templates" aria-labelledby="reception-templates-title" onPointerMove={trackSpotlight}>
              <div className="reception-panel-head">
                <h2 id="reception-templates-title">Templates</h2>
                <button type="button" className="reception-text-action" onClick={()=>run(onTemplates)}>Explore<ArrowRight aria-hidden="true"/></button>
              </div>
              <div className="reception-template-list">{[[ "Web App",Grid2X2],["Mobile App",Folder],["AI Tool",Layers]].map(([label,Icon])=><button key={label as string} type="button" onClick={()=>run(onTemplates)}><span className="reception-template-icon" aria-hidden="true">{React.createElement(Icon as typeof Grid2X2,{})}</span><strong>{label as string}</strong><ArrowUpRight aria-hidden="true" className="reception-template-arrow"/></button>)}</div>
            </section>
          </div>

          <section className="reception-panel reception-quick" aria-labelledby="reception-quick-title" onPointerMove={trackSpotlight}>
            <div className="reception-panel-head">
              <h2 id="reception-quick-title"><Zap aria-hidden="true"/>Quick actions</h2>
            </div>
            <div className="reception-quick-list">{actions.map(({name,icon:Icon,keys,action})=><button key={name} type="button" onClick={()=>run(action)}><Icon aria-hidden="true"/><span>{name}</span><span className="reception-shortcut" aria-hidden="true">{keys.map(key=><kbd key={key}>{key}</kbd>)}</span></button>)}</div>
          </section>
        </div>

        <footer className="reception-footer"><button type="button" onClick={()=>run(onViewAll)}>Projects</button><span aria-hidden="true">·</span><button type="button" onClick={()=>run(onTemplates)}>Templates</button><span aria-hidden="true">·</span><button type="button" onClick={()=>run(onDocs)}>Docs</button><span aria-hidden="true">·</span><button type="button" onClick={()=>run(onWhatsNew)}>What’s new<ArrowUpRight aria-hidden="true"/></button></footer>
      </div>
    </div>
  </main>;
}
