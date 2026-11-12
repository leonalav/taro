import * as React from "react";
import "@fontsource/merriweather/700.css";
import {ArrowRight,ArrowUpRight,BookOpen,Clock3,Command,Folder,FolderOpen,Grid2X2,Layers,Play,Plus,Search,Settings,Sparkles,Zap} from "lucide-react";
import {GitHubMark} from "@/components/github-mark";
import {TaroMark} from "@/components/taro-mark";
import {cn} from "@/utils/cn";
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

export function ReceptionPage({recent,composer,error:externalError,onOpenRecent,onViewAll,onNewProject,onOpenProject,onTemplates,onImportGithub,onSearch,onCommands,onSettings,onDocs,onWhatsNew,onPrompt}:ReceptionPageProps){
  const page=React.useRef<HTMLElement>(null);
  const [error,setError]=React.useState("");
  const run=(action:Action)=>{setError("");void Promise.resolve().then(action).catch(e=>setError(e instanceof Error?e.message:String(e)));};
  const actions=[
    {name:"Open a project…",icon:Folder,keys:["Ctrl","O"],action:onOpenProject},
    {name:"Search in workspace…",icon:Search,keys:["Ctrl","K"],action:onSearch},
    {name:"Command palette…",icon:Command,keys:["Ctrl","Shift","P"],action:onCommands},
    {name:"Settings",icon:Settings,keys:["Ctrl",","],action:onSettings},
  ];
  const projectCount=recent.length;
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
          <RailButton label="What's new" onClick={()=>run(onWhatsNew)}><Sparkles/></RailButton>
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
            <div className="reception-hero-head">
              <p className="reception-eyebrow"><Layers aria-hidden="true"/>New session</p>
              <div className="reception-status">
                <span className="reception-status-item"><i aria-hidden="true"/>Local workspace</span>
                <span className="reception-status-item">{projectCount} {projectCount===1?"project":"projects"}</span>
                <span className="reception-status-item">Design-first</span>
              </div>
            </div>
            <h1 id="reception-title">Welcome to <span>Taro</span></h1>
            <p className="reception-subtitle">Design-first coding agent for turning ideas into production-ready products.</p>
            <div className="reception-composer">{composer}</div>
            <div className="reception-suggestions" aria-label="Ideas for your next project">{suggestions.map(text=><button key={text} type="button" onClick={()=>onPrompt(text)}><ArrowUpRight aria-hidden="true"/>{text}</button>)}</div>
          </section>

          <section className="reception-panel reception-recents" aria-labelledby="reception-recent-title">
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
            <section className="reception-panel reception-start" aria-labelledby="reception-start-title">
              <div className="reception-panel-head">
                <h2 id="reception-start-title">Start something new</h2>
              </div>
              <div className="reception-start-grid">
                <button type="button" className="reception-start-tile reception-start-tile--primary" onClick={()=>run(onNewProject)}><Plus className="reception-tile-icon" aria-hidden="true"/><strong>New project</strong><span>Start from a blank canvas</span></button>
                <button type="button" className="reception-start-tile" onClick={()=>run(onOpenProject)}><Folder className="reception-tile-icon" aria-hidden="true"/><strong>Open project</strong><span>Work on an existing project</span></button>
                <button type="button" className="reception-start-tile" onClick={()=>run(onTemplates)}><Grid2X2 className="reception-tile-icon" aria-hidden="true"/><strong>Use a template</strong><span>Find a starting point for your idea</span></button>
                <button type="button" className="reception-start-tile" onClick={()=>run(onImportGithub)}><GitHubMark className="reception-tile-icon"/><strong>Import from GitHub</strong><span>Bring an existing repo</span></button>
              </div>
            </section>

            <section className="reception-panel reception-templates" aria-labelledby="reception-templates-title">
              <div className="reception-panel-head">
                <h2 id="reception-templates-title">Templates</h2>
                <button type="button" className="reception-text-action" onClick={()=>run(onTemplates)}>Explore<ArrowRight aria-hidden="true"/></button>
              </div>
              <div className="reception-template-list">{[[ "Web App",Grid2X2],["Mobile App",Folder],["AI Tool",Layers]].map(([label,Icon])=><button key={label as string} type="button" onClick={()=>run(onTemplates)}><span className="reception-template-icon" aria-hidden="true">{React.createElement(Icon as typeof Grid2X2,{})}</span><strong>{label as string}</strong><ArrowUpRight aria-hidden="true" className="reception-template-arrow"/></button>)}</div>
            </section>
          </div>

          <section className="reception-panel reception-quick" aria-labelledby="reception-quick-title">
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
