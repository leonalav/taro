import { artifactProjectKey, type ArtifactDesignStorage } from './artifact-design';

const referenceKinds = ['screenshot', 'region', 'website', 'clip', 'layout'] as const;
export interface DesignReference {
  id: string;
  kind: typeof referenceKinds[number];
  label: string;
  source: string;
  learn: string;
  selector?: string;
  revisionId?: string;
}
export interface DesignObservation {
  referenceId: string;
  region: string;
  composition: string;
  typography: string;
  color: string;
  media: string;
  spacing: string;
  interaction: string;
  motion: string;
}

export interface ProjectDirection {
  audience: string;
  primaryAction: string;
  selectedDirection: string;
  reason: string;
  constraints: string[];
  questions: string[];
  approvedAssetIds: string[];
  nextAction: string;
  references?: DesignReference[];
  observations?: DesignObservation[];
  decisionNotes?: string[];
}

export interface DirectionOption {
  id: string;
  name: string;
  rationale: string;
  composition: 'image-led' | 'type-led' | 'split' | 'scene-led';
  typography: 'serif' | 'sans-serif' | 'monospace';
  headline: string;
  action: string;
  referenceId?: string;
}
export interface DirectionPreview {
  id: string;
  previewId?: string;
  revisionId?: string;
  error?: string;
}
export interface DirectionProposal {
  options: DirectionOption[];
  selectedId: string;
  reason: string;
  observations: DesignObservation[];
}

export interface VisualHandoff {
  preserveRegions?: string[];
  layouts: { layerId: string; alignment: string; growth: string; wrapping: string; mobile: string }[];
  interactions: { id: string; trigger: string; change: string; progress: string; reducedMotion: string; alternative: string; proof?: InteractionProof }[];
  scene?: {
    objects: { name: string; assetId: string; material: string }[];
    camera: string;
    lighting: string;
    controls: string;
    loading: string;
    fallback: string;
    quality: string;
  };
}

export interface InteractionProof {
  type: 'hover'|'click'|'scroll'|'drag'|'text'|'key';
  target: string;
  expect: { selector:string; present?:boolean; inViewport?:boolean; focused?:boolean; text?:string };
}

type Author = 'suggested' | 'approved-plan' | 'user';
export interface SavedProjectDirection {
  version: 1;
  revision: number;
  history: { author: Author; at: number; direction: ProjectDirection }[];
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`Invalid ${label}.`);
  return value as Record<string, unknown>;
}
function field(value: unknown, label: string, max = 400) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw Error(`Invalid ${label}.`);
  return value.trim();
}
function fields<Key extends string>(value: unknown, keys: Key[]): Record<Key,string> {
  const data = record(value, keys[0]);
  return Object.fromEntries(keys.map(key => [key, field(data[key], key)])) as Record<Key,string>;
}
function identifier(value: unknown, label = 'ID') {
  const id = field(value, label, 100);
  if (!/^[a-z0-9][a-z0-9:_-]*$/i.test(id)) throw Error(`Invalid ${label}.`);
  return id;
}
function items<T>(value: unknown, label: string, max: number, parse: (item: unknown) => T, min = 0) {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw Error(`Invalid ${label}.`);
  return value.map(parse);
}
function unique<T>(values: T[], key: (value: T) => string, label: string) {
  if (new Set(values.map(key)).size !== values.length) throw Error(`Duplicate ${label}.`);
  return values;
}

export function parseDesignReferences(value: unknown): DesignReference[] {
  return unique(items(value, 'references', 16, item => {
    const data = record(item, 'reference');
    const kind = data.kind as DesignReference['kind'];
    if (!referenceKinds.includes(kind)) throw Error('Invalid reference kind.');
    let source = field(data.source, 'reference source', 2048);
    if (kind === 'website') {
      try {
        const url = new URL(source);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error();
        source = url.href;
      } catch { throw Error('Use a public HTTP or HTTPS reference URL without credentials.'); }
    } else source = identifier(source, 'saved reference source');
    const selector=data.selector===undefined?undefined:field(data.selector,'selected region',300);
    if(kind==='region'&&!selector)throw Error('A region reference needs the observed element selector.');
    if(kind!=='region'&&selector)throw Error('Only region references accept an element selector.');
    const revisionId=data.revisionId===undefined?undefined:identifier(data.revisionId,'source revision ID');
    if(revisionId&&!['region','layout'].includes(kind))throw Error('Only Review sources have a revision ID.');
    return { id: identifier(data.id), kind, label: field(data.label, 'reference label', 120), learn: field(data.learn, 'reference purpose'), source, ...(selector&&{selector}), ...(revisionId&&{revisionId}) };
  }), item => item.id, 'reference ID');
}

function readObservations(value: unknown, references: DesignReference[]): DesignObservation[] {
  return unique(items(value, 'reference observations', 24, item => {
    const data = record(item, 'reference observation');
    const reference = references.find(entry => entry.id === data.referenceId);
    if (!reference) throw Error('Reference observation names an unknown source.');
    return {
      ...fields(data, ['region','composition','typography','color','media','spacing','interaction']),
      referenceId: reference.id,
      motion: reference.kind==='clip' ? field(data.motion, 'observed motion or uncertainty') : 'Unknown from a still image.',
    } as DesignObservation;
  }), observation => `${observation.referenceId}\0${observation.region.toLowerCase()}`, 'observed region');
}

export function parseProjectDirection(value: unknown, assignedReferences?:DesignReference[]): ProjectDirection {
  const data = record(value, 'project direction');
  const references = assignedReferences ?? (data.references === undefined ? undefined : parseDesignReferences(data.references));
  return {
    ...fields(data, ['audience','primaryAction','selectedDirection','reason','nextAction']),
    constraints: items(data.constraints, 'constraints', 20, item => field(item, 'constraint')),
    questions: items(data.questions, 'questions', 20, item => field(item, 'question')),
    approvedAssetIds: unique(items(data.approvedAssetIds, 'approved assets', 30, item => identifier(item, 'asset ID')), item => item, 'asset ID'),
    ...(references && { references }),
    ...(data.observations !== undefined && { observations: readObservations(data.observations, references ?? []) }),
    ...(data.decisionNotes !== undefined && { decisionNotes: items(data.decisionNotes, 'decisions', 20, item => field(item, 'decision')) }),
  } as ProjectDirection;
}

export function parseDirectionProposal(value: unknown, references: DesignReference[], minimum = 2): DirectionProposal {
  const data = record(value, 'direction proposal');
  const options = unique(items(data.options, 'direction options', 3, item => {
    const option = record(item, 'direction option');
    const composition = option.composition as DirectionOption['composition'];
    const typography = option.typography as DirectionOption['typography'];
    if (!['image-led','type-led','split','scene-led'].includes(composition) || !['serif','sans-serif','monospace'].includes(typography)) throw Error('Select a supported option composition and typography.');
    const referenceId = option.referenceId === undefined ? undefined : identifier(option.referenceId, 'reference ID');
    if (referenceId && !references.some(reference => reference.id === referenceId)) throw Error('The option names an unknown reference.');
    return { id: identifier(option.id), name: field(option.name, 'option name', 70), rationale: field(option.rationale, 'rationale'), headline: field(option.headline, 'headline', 150), action: field(option.action, 'action', 60), composition, typography, ...(referenceId && { referenceId }) };
  }, minimum), option => option.id, 'option ID');
  unique(options, option => `${option.composition}:${option.typography}`, 'option composition and typography. Supply distinct alternatives');
  const selectedId = identifier(data.selectedId, 'selected option');
  if (!options.some(option => option.id === selectedId)) throw Error('The selected option was not proposed.');
  const observations = readObservations(data.observations, references);
  return { options, selectedId, reason: field(data.reason, 'selection reason'), observations };
}

export function parseVisualHandoff(value: unknown, layerIds: string[], assetIds?: string[]): VisualHandoff {
  const data = record(value, 'visual handoff');
  const layouts = unique(items(data.layouts, 'layout relationships', 80, item => {
    const layout = fields(item, ['layerId','alignment','growth','wrapping','mobile']) as VisualHandoff['layouts'][number];
    if (!layerIds.includes(layout.layerId)) throw Error('Layout relationship names an unknown layer.');
    return layout;
  }, 1), layout => layout.layerId, 'layout layer');
  const interactions = unique(items(data.interactions, 'interactions', 25, item => {
    const value=record(item,'interaction');
    const interaction = fields(item, ['id','trigger','change','progress','reducedMotion','alternative']) as VisualHandoff['interactions'][number];
    identifier(interaction.id, 'interaction ID');
    if(value.proof!==undefined){
      const proof=record(value.proof,'interaction proof');
      const type=proof.type as InteractionProof['type'];
      if(!['hover','click','scroll','drag','text','key'].includes(type))throw Error('Invalid replay action for the interaction.');
      const expect=record(proof.expect,'expected state');
      const selector=field(expect.selector,'result selector',300);
      const outcome:InteractionProof['expect']={selector};
      for(const key of ['present','inViewport','focused'] as const){
        if(expect[key]===undefined)continue;
        if(typeof expect[key]!=='boolean')throw Error('Expected browser state must use boolean values.');
        outcome[key]=expect[key];
      }
      if(expect.text!==undefined)outcome.text=field(expect.text,'expected exact text',300);
      if(Object.keys(outcome).length<2||['body','html','main','*'].includes(selector.toLowerCase())&&!outcome.text)throw Error('Use an expected state specific to the interaction.');
      interaction.proof={type,target:field(proof.target,'interaction target selector',300),expect:outcome};
    }
    return interaction;
  }), interaction => interaction.id, 'interaction ID');
  const preserveRegions=data.preserveRegions===undefined?undefined:unique(items(data.preserveRegions,'stable regions to preserve',6,item=>field(item,'preserved region selector',300)),selector=>selector,'preserved selector');
  const handoff={layouts,interactions,...(preserveRegions&&{preserveRegions})};
  if (data.scene === undefined) return handoff;
  const scene = record(data.scene, 'scene');
  const objects = items(scene.objects, 'scene objects', 30, item => {
    const object = fields(item, ['name','assetId','material']) as NonNullable<VisualHandoff['scene']>['objects'][number];
    identifier(object.assetId, 'scene asset ID');
    if (assetIds && !assetIds.includes(object.assetId)) throw Error('Scene object must use a registered asset.');
    return object;
  }, 1);
  return { ...handoff, scene: { ...fields(scene, ['camera','lighting','controls','loading','fallback','quality']), objects } as VisualHandoff['scene'] };
}

export function createProjectDirectionRepository(storage: ArtifactDesignStorage) {
  const queues = new Map<string, Promise<unknown>>();
  const key = (workspace: string) => `direction:${artifactProjectKey(workspace)}`;
  const read = async (workspace: string): Promise<SavedProjectDirection | null> => {
    const raw = await storage.read(key(workspace));
    if (raw === null) return null;
    try {
      const saved = JSON.parse(raw) as SavedProjectDirection;
      if (saved.version !== 1 || !Number.isSafeInteger(saved.revision) || saved.revision < 1 || !Array.isArray(saved.history) || saved.history.length !== saved.revision) throw Error();
      return { ...saved, history: saved.history.map(item => {
        if (!['suggested','approved-plan','user'].includes(item.author) || !Number.isFinite(item.at)) throw Error();
        return { author: item.author, at: item.at, direction: parseProjectDirection(item.direction) };
      }) };
    } catch { throw Error('Could not read project direction. Existing records were preserved.'); }
  };
  const save = (workspace: string, direction: ProjectDirection, author: Author, expectedRevision: number): Promise<SavedProjectDirection> => {
    const storageKey = key(workspace);
    const work = (queues.get(storageKey) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const current = await read(workspace);
      const conflict = () => Error('Project direction changed. Read the latest decision before saving.');
      if ((current?.revision ?? 0) !== expectedRevision) throw conflict();
      const next: SavedProjectDirection = { version: 1, revision: expectedRevision + 1, history: [...current?.history ?? [], { author, at: Date.now(), direction: parseProjectDirection(direction) }] };
      const payload = JSON.stringify(next);
      if (storage.compareAndSwap) {
        if (!await storage.compareAndSwap(storageKey, expectedRevision, payload)) throw conflict();
      } else await storage.write(storageKey, payload);
      return next;
    });
    queues.set(storageKey, work);
    return work;
  };
  return { read, save };
}

export type ProjectDirectionRepository = ReturnType<typeof createProjectDirectionRepository>;
