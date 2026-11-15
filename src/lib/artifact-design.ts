import type { ReviewStorage } from './review-store';

export type ArtifactDirection = 'editorial' | 'product' | 'expressive';
export type ArtifactTheme = 'light' | 'dark';
const colorRoles = ['canvas', 'surface', 'raised', 'text', 'muted', 'border', 'accent', 'onAccent', 'success', 'onSuccess', 'warning', 'onWarning', 'info', 'onInfo', 'danger', 'onDanger', 'focus'] as const;
type Colors = Record<typeof colorRoles[number], string>;
const typeRoles = ['display', 'headline', 'title', 'body', 'caption', 'code'] as const;
export interface ArtifactTypeRole { family: string; size: number; lineHeight: number; weight: number; tracking: number }
export interface ArtifactDesign {
  version: 1; name: string; direction: ArtifactDirection;
  neutral: string[]; themes: Record<ArtifactTheme, Colors>;
  typography: Record<typeof typeRoles[number], ArtifactTypeRole>;
  spacing: Record<string, number>; radius: Record<'control' | 'card' | 'panel' | 'round', number>;
  elevation: Record<'low' | 'high', { y: number; blur: number; opacity: number }>;
  blur: Record<'soft' | 'strong', number>;
  motion: { fast: number; normal: number; slow: number; easing: [number, number, number, number] };
  grid: { columns: number; maxWidth: number; gutter: number; breakpoints: { sm: number; md: number; lg: number } };
  components: { target: number; controlPadding: number; cardPadding: number; focusWidth: number };
  media: { ratio: 'landscape' | 'portrait' | 'square'; fit: 'cover' | 'contain'; treatment: string; emptyState: string };
  guidance: string;
}
const light: Colors = { canvas:'#fafaf8',surface:'#ffffff',raised:'#f0efeb',text:'#18231d',muted:'#536057',border:'#a8b0a9',accent:'#a63716',onAccent:'#ffffff',success:'#216340',onSuccess:'#ffffff',warning:'#845100',onWarning:'#ffffff',info:'#205b90',onInfo:'#ffffff',danger:'#aa2937',onDanger:'#ffffff',focus:'#205b90' };
const dark: Colors = { canvas:'#101b17',surface:'#192820',raised:'#26382e',text:'#f4f5ef',muted:'#b8c5bb',border:'#718379',accent:'#ffac82',onAccent:'#27160d',success:'#8cddb2',onSuccess:'#10291c',warning:'#f3ca80',onWarning:'#302007',info:'#a3cff6',onInfo:'#11243b',danger:'#ffadb5',onDanger:'#36131b',focus:'#a3cff6' };
export function createArtifactDesign(direction: ArtifactDirection = 'editorial'): ArtifactDesign {
  if (!['editorial','product','expressive'].includes(direction)) throw Error('Unknown artifact direction.');
  const display = direction === 'editorial' ? 'Georgia, Cambria, serif' : direction === 'expressive' ? 'Trebuchet MS, Verdana, sans-serif' : 'Inter, Segoe UI, sans-serif';
  const body = direction === 'editorial' ? 'Segoe UI, Helvetica, sans-serif' : 'Inter, Segoe UI, sans-serif';
  const role = (size:number, weight:number, family=body, lineHeight=1.5, tracking=0):ArtifactTypeRole => ({ family,size,weight,lineHeight,tracking });
  return {
    version:1,name:{editorial:'Paper & ember',product:'Clearwater',expressive:'Electric studio'}[direction],direction,
    neutral:['#ffffff','#fafafa','#f4f4f5','#e4e4e7','#d4d4d8','#a1a1aa','#71717a','#52525b','#3f3f46','#27272a','#18181b','#09090b'],
    themes:{light:{...light,...(direction==='product'?{canvas:'#f3f7fc',text:'#14243b',accent:'#175cd3',onAccent:'#ffffff'}:direction==='expressive'?{canvas:'#fff6df',text:'#331c42',accent:'#702c91',onAccent:'#ffffff'}:{})},dark:{...dark,...(direction==='product'?{canvas:'#101b2d',surface:'#192840',raised:'#263955',text:'#f0f5ff',muted:'#b5c6e0',accent:'#a9caff',onAccent:'#112442'}:direction==='expressive'?{canvas:'#25132f',surface:'#34213e',raised:'#493154',text:'#fff6df',muted:'#dbc5e7',accent:'#e8b0ff',onAccent:'#30153d'}:{})}},
    typography:{display:role(direction==='product'?56:80, direction==='editorial'?500:700,display,1.06,-0.03),headline:role(40,600,display,1.15,-0.02),title:role(24,600,body,1.25,-0.01),body:role(16,400),caption:role(13,500),code:role(14,400,'Consolas, Menlo, monospace')},
    spacing:{'0':0,'1':4,'2':8,'3':12,'4':16,'6':24,'8':32,'12':48,'16':64,'24':96},
    radius:{control:direction==='product'?8:4,card:direction==='expressive'?16:12,panel:20,round:999},
    elevation:{low:{y:4,blur:16,opacity:0.08},high:{y:16,blur:48,opacity:0.18}},blur:{soft:8,strong:24},
    motion:{fast:120,normal:240,slow:480,easing:[0.16,1,0.3,1]},
    grid:{columns:12,maxWidth:1200,gutter:24,breakpoints:{sm:480,md:768,lg:1200}},
    components:{target:44,controlPadding:12,cardPadding:24,focusWidth:3},
    media:{ratio:direction==='expressive'?'portrait':'landscape',fit:'cover',treatment:'Use project-owned or licensed imagery with intentional focal points. Reserve aspect ratio, provide responsive sources and useful alt text. Posters precede video; captions remain readable independently of imagery.',emptyState:'Explain what belongs here and offer one real next action. Use illustration only when it helps explain the task; never invent decorative placeholder photography.'},
    guidance:'Preserve incumbent project components and user brand direction. Pair at most two primary type families; code has its own role. Use serif italic as deliberate editorial emphasis, not everywhere. Match component spacing and typography roles across artifacts. Fonts named here are fallback stacks: source and self-host the chosen brand faces when assets are available. Starter content is illustrative and must be replaced with supplied facts.',
  };
}
export function validateArtifactDesign(value: unknown): ArtifactDesign {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid artifact design contract.');
  if (JSON.stringify(value).length>24000) throw Error('Artifact design contract exceeds 24,000 characters.');
  const d = value as ArtifactDesign;
  const shape=(actual:unknown,expected:unknown,path:string)=>{
    if(!expected||typeof expected!=='object'||Array.isArray(expected))return;
    if(!actual||typeof actual!=='object'||Array.isArray(actual))throw Error(`Missing ${path}.`);
    for(const key of Object.keys(actual))if(!Object.prototype.hasOwnProperty.call(expected,key))throw Error(`Unknown ${path}.${key}.`);
    for(const [key,child] of Object.entries(expected))shape((actual as Record<string,unknown>)[key],child,`${path}.${key}`);
  };
  shape(d,createArtifactDesign(),'contract');
  const text=(v:unknown,max:number,label:string)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error(`Invalid ${label}.`);};
  const number=(v:unknown,min:number,max:number,label:string)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(`Invalid ${label}.`);};
  const hex=(v:unknown)=>{if(typeof v!=='string'||!/^#[\da-f]{6}$/i.test(v))throw Error('Colors must use six-digit hexadecimal values.');};
  if(d.version!==1)throw Error('Unsupported artifact design version.');
  text(d.name,200,'name');if(!['editorial','product','expressive'].includes(d.direction))throw Error('Invalid direction.');
  if(!Array.isArray(d.neutral)||d.neutral.length!==12)throw Error('A twelve-step neutral ramp is required.');d.neutral.forEach(hex);
  for(const theme of ['light','dark'] as const)for(const key of colorRoles)hex(d.themes?.[theme]?.[key]);
  for(const key of typeRoles){const r=d.typography?.[key];if(!r)throw Error(`Missing typography ${key}.`);text(r.family,160,'font family');if(!/^[\w\s,'"-]+$/.test(r.family))throw Error('Unsafe font family.');number(r.size,10,120,'font size');number(r.weight,100,900,'font weight');number(r.lineHeight,1,2.2,'line height');number(r.tracking,-0.04,0.2,'tracking');}
  const spaceKeys=['0','1','2','3','4','6','8','12','16','24'];
  if(!d.spacing||Object.keys(d.spacing).length!==spaceKeys.length)throw Error('Invalid spacing scale.');
  for(const key of spaceKeys)number(d.spacing[key],0,256,'spacing');
  if(d.spacing['0']!==0||spaceKeys.some((key,i)=>i>0&&d.spacing[key]<=d.spacing[spaceKeys[i-1]]))throw Error('Spacing must be an increasing scale starting at zero.');
  for(const key of ['control','card','panel','round'] as const)number(d.radius?.[key],0,999,'radius');
  for(const key of ['low','high'] as const){number(d.elevation?.[key]?.y,0,64,'elevation');number(d.elevation?.[key]?.blur,0,128,'elevation blur');number(d.elevation?.[key]?.opacity,0,0.5,'elevation opacity');}
  for(const key of ['soft','strong'] as const)number(d.blur?.[key],0,64,'blur');
  for(const key of ['fast','normal','slow'] as const)number(d.motion?.[key],0,2000,'motion duration');
  if(!Array.isArray(d.motion.easing)||d.motion.easing.length!==4)throw Error('Invalid motion easing.');d.motion.easing.forEach(n=>number(n,0,1,'easing'));
  number(d.grid?.columns,1,24,'grid columns');if(!Number.isInteger(d.grid.columns))throw Error('Grid columns must be an integer.');number(d.grid.maxWidth,320,2560,'grid width');number(d.grid.gutter,8,64,'grid gutter');
  const breaks=['sm','md','lg'] as const;for(const key of breaks)number(d.grid.breakpoints?.[key],320,2560,'breakpoint');if(d.grid.breakpoints.sm>=d.grid.breakpoints.md||d.grid.breakpoints.md>=d.grid.breakpoints.lg)throw Error('Breakpoints must increase.');
  number(d.components?.target,24,64,'minimum target');number(d.components.controlPadding,4,32,'control padding');number(d.components.cardPadding,8,64,'card padding');number(d.components.focusWidth,2,6,'focus width');
  if(!['landscape','portrait','square'].includes(d.media?.ratio)||!['cover','contain'].includes(d.media?.fit))throw Error('Invalid media treatment.');text(d.media.treatment,2000,'media direction');text(d.media.emptyState,1000,'empty state');text(d.guidance,4000,'guidance');
  return JSON.parse(JSON.stringify(d));
}

/** Scoped to artifact documents: never import this stylesheet into Taro chrome. */
export function artifactCss(input: ArtifactDesign): string {
  const d=validateArtifactDesign(input),scope='[data-taro-artifact]';
  const colors=(theme:ArtifactTheme)=>colorRoles.map(key=>`--art-${key.replace(/[A-Z]/g,s=>`-${s.toLowerCase()}`)}:${d.themes[theme][key]}`).join(';');
  const tokens=[...d.neutral.map((v,i)=>`--art-neutral-${i}:${v}`),...Object.entries(d.spacing).map(([k,v])=>`--art-space-${k}:${v}px`),...Object.entries(d.radius).map(([k,v])=>`--art-radius-${k}:${v}px`),...Object.entries(d.elevation).map(([k,v])=>`--art-shadow-${k}:0 ${v.y}px ${v.blur}px rgb(0 0 0 / ${v.opacity})`),...Object.entries(d.blur).map(([k,v])=>`--art-blur-${k}:${v}px`),...(['fast','normal','slow'] as const).map(k=>`--art-motion-${k}:${d.motion[k]}ms`),...Object.entries(d.grid.breakpoints).map(([k,v])=>`--art-breakpoint-${k}:${v}px`),`--art-grid-columns:${d.grid.columns}`,`--art-ease:cubic-bezier(${d.motion.easing.join(',')})`,`--art-target:${d.components.target}px`,`--art-gutter:${d.grid.gutter}px`,`--art-max-width:${d.grid.maxWidth}px`];
  for(const key of typeRoles){const r=d.typography[key];tokens.push(`--art-font-${key}:${r.family}`,`--art-type-${key}:${r.size}px`,`--art-leading-${key}:${r.lineHeight}`,`--art-weight-${key}:${r.weight}`,`--art-tracking-${key}:${r.tracking}em`);}
  return `${scope}{${tokens.join(';')};${colors('light')};color-scheme:light;display:block;min-height:100vh;background:var(--art-canvas);color:var(--art-text);font:var(--art-type-body)/var(--art-leading-body) var(--art-font-body);accent-color:var(--art-accent);caret-color:var(--art-accent);scrollbar-color:var(--art-border) var(--art-canvas)}
${scope}[data-theme=dark]{${colors('dark')};color-scheme:dark}
@media(prefers-color-scheme:dark){${scope}:not([data-theme=light]){${colors('dark')};color-scheme:dark}}
${scope},${scope} *{box-sizing:border-box} ${scope} :where(h1,h2,h3,p){margin:0} ${scope} :where(h1,h2,h3){text-wrap:balance;overflow-wrap:anywhere} ${scope} p{max-width:70ch} ${scope} ::selection{background:var(--art-accent);color:var(--art-on-accent)}
${typeRoles.map(key=>{const fluid=key==='display'||key==='headline';return `${scope} .art-${key}{font-family:var(--art-font-${key});font-size:${fluid?`clamp(${key==='display'?36:28}px,${key==='display'?6:4}vw,var(--art-type-${key}))`:`var(--art-type-${key})`};font-weight:var(--art-weight-${key});line-height:var(--art-leading-${key});letter-spacing:var(--art-tracking-${key})}`;}).join('\n')}
${scope} .art-display em,${scope} .art-headline em{font-family:var(--art-font-display);font-style:italic} ${scope} .art-skip{position:absolute;top:8px;left:16px;transform:translateY(-200%);z-index:1;padding:var(--art-space-2);background:var(--art-surface)} ${scope} .art-skip:focus{transform:none}
${scope} .art-shell{width:min(100%,var(--art-max-width));margin-inline:auto;padding:var(--art-space-6) var(--art-gutter)} ${scope} .art-stack{display:flex;flex-direction:column;gap:var(--art-space-6)} ${scope} .art-cluster{display:flex;flex-wrap:wrap;align-items:center;gap:var(--art-space-3)} ${scope} .art-grid{display:grid;grid-template-columns:repeat(${d.grid.columns},minmax(0,1fr));gap:var(--art-gutter)} ${scope} .art-grid>*{min-width:0;grid-column:span ${Math.max(1,Math.floor(d.grid.columns/3))}} ${scope} .art-split{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:var(--art-space-12);align-items:center}
${scope} .art-section{padding-block:var(--art-space-16)} ${scope} .art-card{padding:${d.components.cardPadding}px;border-radius:var(--art-radius-card);background:var(--art-surface)} ${scope} .art-elevated{box-shadow:var(--art-shadow-low)} ${scope} .art-muted{color:var(--art-muted)} ${scope} .art-rule{border:0;border-top:1px solid var(--art-border);margin:var(--art-space-6) 0}
${scope} :where(button,input,select,textarea){font:inherit;max-width:100%} ${scope} .art-button{display:inline-flex;justify-content:center;align-items:center;gap:var(--art-space-2);min-width:var(--art-target);min-height:var(--art-target);padding:${d.components.controlPadding}px var(--art-space-6);border:1px solid transparent;border-radius:var(--art-radius-control);background:var(--art-accent);color:var(--art-on-accent);text-decoration:none;cursor:pointer;transition:transform var(--art-motion-fast) var(--art-ease),box-shadow var(--art-motion-fast) var(--art-ease)}
${scope} .art-button[data-variant=secondary]{background:var(--art-surface);color:var(--art-text);border-color:var(--art-border)} ${scope} .art-button[data-variant=quiet]{background:transparent;color:var(--art-text)} ${scope} .art-button[data-variant=danger]{background:var(--art-danger);color:var(--art-on-danger)} ${scope} .art-button:hover:enabled{transform:translateY(-1px);box-shadow:var(--art-shadow-low)} ${scope} .art-button:active:enabled{transform:translateY(0)} ${scope} .art-button:disabled,${scope} .art-button[aria-disabled=true]{opacity:.55;cursor:not-allowed} ${scope} [aria-busy=true]{cursor:progress}
${scope} :where(button,a,input,select,textarea,summary):focus-visible{outline:${d.components.focusWidth}px solid var(--art-focus);outline-offset:3px} ${scope} a:not(.art-button){color:var(--art-accent);text-underline-offset:.2em} ${scope} .art-field{display:grid;gap:var(--art-space-2)} ${scope} .art-input{width:100%;min-height:var(--art-target);padding:${d.components.controlPadding}px;border:1px solid var(--art-border);border-radius:var(--art-radius-control);background:var(--art-surface);color:var(--art-text)} ${scope} .art-input::placeholder{color:var(--art-muted)} ${scope} [aria-invalid=true]{border-color:var(--art-danger)} ${scope} .art-error{color:var(--art-danger)}
${scope} .art-media{display:block;width:100%;aspect-ratio:${d.media.ratio==='portrait'?'3/4':d.media.ratio==='square'?'1':'4/3'};object-fit:${d.media.fit};border-radius:var(--art-radius-card);background:var(--art-raised)} ${scope} .art-media-empty{display:grid;place-content:center;padding:var(--art-space-6);color:var(--art-muted)} ${scope} .art-table{width:100%;border-collapse:collapse;text-align:left} ${scope} .art-table :where(th,td){padding:var(--art-space-3);border-bottom:1px solid var(--art-border);overflow-wrap:anywhere} ${scope} .art-number{font-variant-numeric:tabular-nums} ${scope} .art-mobile{max-width:440px;margin:auto} ${scope} .art-mobile nav{display:flex;flex-wrap:wrap;gap:var(--art-space-3)}
@media(max-width:${d.grid.breakpoints.md}px){${scope} .art-split{grid-template-columns:1fr;gap:var(--art-space-8)} ${scope} .art-grid>*{grid-column:span ${Math.max(1,Math.floor(d.grid.columns/2))}} ${scope} .art-section{padding-block:var(--art-space-8)}}
@media(max-width:${d.grid.breakpoints.sm}px){${scope} .art-grid{grid-template-columns:1fr} ${scope} .art-grid>*{grid-column:1} ${scope} .art-shell{padding-inline:var(--art-space-4)} ${scope} .art-card{padding:var(--art-space-4)} ${scope} .art-table :where(th,td){padding:var(--art-space-2);font-size:14px;overflow-wrap:normal}}
@media(prefers-reduced-motion:reduce){${scope},${scope} *,${scope} *::before,${scope} *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}`;
}

export interface SavedArtifactDesign { version:1; revision:number; updatedAt:number; design:ArtifactDesign }
export function artifactProjectKey(workspace:string):string {
  const normalized=workspace.trim().replace(/\\/g,'/');
  const path=normalized.replace(/\/+$/,'')||(normalized.startsWith('/')?'/':'');
  if(!path)throw Error('Select a workspace to save project design memory.');
  return JSON.stringify(/^[a-z]:|^\/\//i.test(path)?path.toLowerCase():path);
}
export interface ArtifactDesignStorage extends ReviewStorage { compareAndSwap?:(key:string,expectedRevision:number,value:string)=>Promise<boolean> }
export function createArtifactDesignRepository(storage:ArtifactDesignStorage) {
  const queues=new Map<string,Promise<unknown>>();
  const read=async(workspace:string):Promise<SavedArtifactDesign|null>=>{
    const raw=await storage.read(artifactProjectKey(workspace));if(raw===null)return null;
    try{const saved=JSON.parse(raw) as SavedArtifactDesign;if(saved.version!==1||!Number.isInteger(saved.revision)||saved.revision<1||!Number.isFinite(saved.updatedAt))throw Error('Invalid envelope');return {...saved,design:validateArtifactDesign(saved.design)};}
    catch{throw Error('Saved project design memory is corrupt or unsupported. Existing data is preserved.');}
  };
  const save=async(workspace:string,design:ArtifactDesign,expectedRevision:number):Promise<SavedArtifactDesign>=>{
    const key=artifactProjectKey(workspace);
    const work=(queues.get(key)??Promise.resolve()).catch(()=>{}).then(async()=>{
      const validated=validateArtifactDesign(design),current=await read(workspace);
      if(!Number.isInteger(expectedRevision)||expectedRevision<0||(current?.revision??0)!==expectedRevision)throw Error('Project design version conflict. Read the latest contract and retry.');
      const next:SavedArtifactDesign={version:1,revision:expectedRevision+1,updatedAt:Date.now(),design:validated};
      if(storage.compareAndSwap){if(!await storage.compareAndSwap(key,expectedRevision,JSON.stringify(next)))throw Error('Project design version conflict. Read the latest contract and retry.');}
      else await storage.write(key,JSON.stringify(next));return next;
    });queues.set(key,work);return work;
  };
  return {read,save};
}
export type ArtifactDesignRepository=ReturnType<typeof createArtifactDesignRepository>;
