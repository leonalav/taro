// Independent of runtime imports to avoid catalog cycles.
const string={type:'string'},number={type:'number'},boolean={type:'boolean'};
const object=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object',properties,required,additionalProperties:false});
const choice=(...values:string[])=>({type:'string',enum:values});
const point=object({x:number,y:number},['x','y']);
const viewportSize={type:'integer',minimum:100,maximum:4096};
const environment=object({deviceScale:{type:'number',enum:[1,1.5,2,3]},scheme:choice('light','dark'),reducedMotion:boolean});
const input=object({
  type:choice('hover','click','scroll','drag','text','key'),selector:string,x:number,y:number,relative:point,
  to:point,toSelector:string,toRelative:point,durationMs:number,deltaX:number,deltaY:number,text:string,key:string,
  shift:boolean,ctrl:boolean,alt:boolean,meta:boolean,
},['type']);
const tool=(name:string,description:string,properties:Record<string,unknown>,required:string[]=[])=>({type:'function',function:{name,description,parameters:object(properties,required)}});
export const reviewToolDefinitions=[
  tool('BrowserAudit','Run visual checks on a saved preview revision in isolated Chromium: light/dark, desktop, 320px, 200% zoom-equivalent layout and reduced motion. Saves screenshots and findings against that revision. Inspect evidence, revise source, save a new BrowserPreview revision and rerun before claiming completion. run=false reads saved reports; run=false with case_index returns that screenshot for visual critique.',{preview_id:string,run:boolean,case_index:{type:'integer',minimum:0,maximum:7},spacing:{type:'array',items:{type:'number',minimum:0,maximum:256},maxItems:32}}),
  tool('BrowserPreview','Open a real browser preview in this chat Review mode. Supply an HTTP(S) URL or complete HTML artifact. For implementation verification use file_path for planned standalone HTML or a loopback URL; original HTML and every revision are preserved. Omit all arguments to list saved previews. preview_id alone reopens a saved preview; preview_id with new content saves a revision. Returns observed screenshot and component geometry.',{url:string,html:string,file_path:string,title:string,preview_id:string,width:{type:'integer',minimum:100,maximum:4096},height:{type:'integer',minimum:100,maximum:4096}}),
  tool('BrowserInspect','Inspect the active browser preview and get actual component selectors, CSS pixel bounds, computed styles, viewport and screenshot. Optional selector selects one component. Never assume unseen geometry.',{preview_id:string,selector:string}),
  tool('BrowserViewport','Set browser viewport in real CSS pixels. Reflows the page and returns fresh geometry and screenshot.',{preview_id:string,width:{type:'integer',minimum:100,maximum:4096},height:{type:'integer',minimum:100,maximum:4096}},['width','height']),
  tool('BrowserAction','Send real input to the current live preview. Prefer a unique selector observed by BrowserInspect, or use viewport CSS pixels for canvas gestures. Drag takes a destination point or toSelector, with optional toRelative fractions inside its bounds. Key input supports modifiers including Shift+Tab; text inserts into the focused control. Returns fresh state, screenshot and lab diagnostics.',{preview_id:string,expected_revision_id:string,input},['input']),
  tool('BrowserCapture','Save a viewport, full document, element, or document-coordinate region. Save sampled live motion, CSS/Web Animation checkpoints at normalized progress, or named scene checkpoints from authored HTML. Use prepare_selector to click a visible setup control in the isolated named-scene run when needed. Omit mode to list saved evidence. Read one image using evidence_id and optional zero-based frame_index. Sampled frames describe observed states and timing.',{
    preview_id:string,expected_revision_id:string,evidence_id:string,frame_index:{type:'integer',minimum:0,maximum:6},
    mode:choice('viewport','document','element','region','observed-motion','animation-checkpoints','scene-checkpoints'),
    selector:string,rect:object({x:number,y:number,width:number,height:number},['x','y','width','height']),
    checkpoints:{type:'array',items:{type:'number',minimum:0,maximum:1},minItems:2,maxItems:6},
    scene_checkpoints:{type:'array',items:string,minItems:1,maxItems:6},prepare_selector:string,
    frames:{type:'integer',minimum:2,maximum:6},interval_ms:{type:'integer',minimum:50,maximum:750},width:viewportSize,height:viewportSize,environment,
  }),
  tool('BrowserReplay','Run one to six named interaction steps from the saved source in a fresh, isolated browser target. Use observed selectors and explicit expectations for meaningful checks. Stops at the first failed step and saves a before/after filmstrip and diagnostics for the current revision. Use run_id to repeat a saved sequence on the latest revision. Supply text_values for prior text steps keyed by zero-based step index.',{
    preview_id:string,expected_revision_id:string,name:string,run_id:string,width:viewportSize,height:viewportSize,environment,
    steps:{type:'array',minItems:1,maxItems:6,items:object({label:string,input,expect:object({selector:string,present:boolean,inViewport:boolean,focused:boolean,text:string},['selector'])},['input'])},
    text_values:{type:'object',additionalProperties:string},
  }),
  tool('BrowserComment','Add a recommendation pinned to a measured component selector or document x/y. Use evidence_id and frame_index to pin document coordinates to a saved browser state. body supports Markdown bold, italic, links, lists, inline/fenced code. thread_id with body replies; thread_id with resolved resolves/reopens without deleting history. Author/session come from agent context.',{preview_id:string,body:string,selector:string,x:number,y:number,evidence_id:string,frame_index:{type:'integer',minimum:0,maximum:6},thread_id:string,resolved:boolean,client_mutation_id:string,expected_generation:number,expected_revision_id:string,verified_resolution:boolean,evidence_ids:{type:"array",items:string},explanation:string,disposition:{type:"string",enum:["fixed","no-change"]}}),
  tool('BrowserComments','Read saved review threads, authors, replies, positions and Markdown. Open threads by default; include_resolved returns all preserved threads.',{preview_id:string,include_resolved:boolean}),
];
export const reviewToolNames=new Set(reviewToolDefinitions.map(d=>d.function.name));
