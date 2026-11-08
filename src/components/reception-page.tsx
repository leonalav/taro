import * as React from "react";
import AcidSquares from "@/components/acid-squares";
import {ArrowRight,ArrowUpRight,Clock3,Command,Folder,FolderOpen,Grid2X2,Layers,Play,Plus,Search,Settings,Zap} from "lucide-react";
import {GitHubMark} from "@/components/github-mark";
import {TaroMark} from "@/components/taro-mark";
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

export function ReceptionPage({recent,composer,reduceMotion,error:externalError,onOpenRecent,onViewAll,onNewProject,onOpenProject,onTemplates,onImportGithub,onSearch,onCommands,onSettings,onDocs,onWhatsNew,onPrompt}:ReceptionPageProps){
  const page=React.useRef<HTMLElement>(null);
  const [error,setError]=React.useState("");
  const run=(action:Action)=>{setError("");void Promise.resolve().then(action).catch(e=>setError(e instanceof Error?e.message:String(e)));};
  const actions=[
    {name:"Open a project…",icon:Folder,keys:["Ctrl","O"],action:onOpenProject},
    {name:"Search in workspace…",icon:Search,keys:["Ctrl","K"],action:onSearch},
    {name:"Command palette…",icon:Command,keys:["Ctrl","Shift","P"],action:onCommands},
    {name:"Settings",icon:Settings,keys:["Ctrl",","],action:onSettings},
  ];
  return <main ref={page} className="reception-page" aria-label="Welcome to Taro">
    <div className="reception-atmosphere" aria-hidden="true"><AcidSquares color="#120f17" accentColor="#ff4fb8" secondaryColor="#3b6bff" tileSize={1} gap={0.12} roundness={0.25} rotation={35} waves={1} pulse={1} lighting="split" tilt={0.7} grain={0.12} intro={!reduceMotion} mouseInteraction={!reduceMotion} paused={reduceMotion}/></div>
    <div className="reception-content">
      <section className="reception-hero" aria-labelledby="reception-title">
        <div className="reception-symbol" aria-hidden="true"><TaroMark/></div>
        <h1 id="reception-title">Welcome to <span>Taro</span></h1>
        <p className="reception-subtitle">Design-first coding agent for turning ideas into production-ready products.</p>
        <div className="reception-composer"><span className="reception-composer-mark" aria-hidden="true"><Layers/></span>{composer}</div>
        <div className="reception-suggestions" aria-label="Ideas for your next project">{suggestions.map(text=><button key={text} type="button" onClick={()=>onPrompt(text)}><ArrowUpRight aria-hidden="true"/>{text}</button>)}</div>
      </section>

      {(error||externalError)&&<p className="reception-error" role="alert">{error||externalError}</p>}
      <div className="reception-workbench">
        <section className="reception-panel reception-recents" aria-labelledby="reception-recent-title">
          <div className="reception-section-head"><h2 id="reception-recent-title"><Clock3 aria-hidden="true"/>Continue where you left off</h2><button type="button" className="reception-text-action" onClick={()=>run(onViewAll)}>View all<ArrowRight aria-hidden="true"/></button></div>
          <div className="reception-recent-list">{recent.length?recent.slice(0,3).map((project,i)=><button type="button" className="reception-recent" key={project.id} onClick={()=>run(()=>onOpenRecent(project.id))}>
            <span className={`reception-thumbnail reception-thumbnail--${i%3}`} aria-hidden="true">{project.thumbnail?<img src={project.thumbnail} alt=""/>:<FolderOpen/>}</span>
            <span className="reception-recent-copy"><strong>{project.name}</strong><span>{project.updated}</span></span>
            <span className="reception-resume"><Play aria-hidden="true"/></span>
          </button>):<div className="reception-recents-empty"><FolderOpen aria-hidden="true"/><p>Your next idea starts here.</p><span>Open a project or create something new.</span></div>}</div>
        </section>

        <section className="reception-panel reception-start" aria-labelledby="reception-start-title">
          <div className="reception-section-head"><h2 id="reception-start-title"><Layers aria-hidden="true"/>Start something new</h2></div>
          <div className="reception-start-grid">
            <button type="button" className="reception-start-tile reception-start-tile--primary" onClick={()=>run(onNewProject)}><Plus className="reception-tile-icon" aria-hidden="true"/><strong>New project</strong><span>Start from a blank canvas</span></button>
            <button type="button" className="reception-start-tile" onClick={()=>run(onTemplates)}><Grid2X2 className="reception-tile-icon" aria-hidden="true"/><strong>Use a template</strong><span>Find a starting point for your idea</span></button>
            <button type="button" className="reception-start-tile" onClick={()=>run(onImportGithub)}><GitHubMark className="reception-tile-icon"/><strong>Import from GitHub</strong><span>Bring an existing repo</span></button>
          </div>
        </section>

        <section className="reception-panel reception-quick" aria-labelledby="reception-quick-title">
          <div className="reception-section-head"><h2 id="reception-quick-title"><Zap aria-hidden="true"/>Quick actions</h2></div>
          <div className="reception-quick-list">{actions.map(({name,icon:Icon,keys,action})=><button key={name} type="button" onClick={()=>run(action)}><Icon aria-hidden="true"/><span>{name}</span><span className="reception-shortcut" aria-hidden="true">{keys.map(key=><kbd key={key}>{key}</kbd>)}</span></button>)}</div>
        </section>
      </div>
      <footer className="reception-footer"><button type="button" onClick={()=>run(onViewAll)}>Projects</button><span aria-hidden="true">·</span><button type="button" onClick={()=>run(onTemplates)}>Templates</button><span aria-hidden="true">·</span><button type="button" onClick={()=>run(onDocs)}>Docs</button><span aria-hidden="true">·</span><button type="button" onClick={()=>run(onWhatsNew)}>What’s new<ArrowUpRight aria-hidden="true"/></button></footer>
    </div>
  </main>;
}
