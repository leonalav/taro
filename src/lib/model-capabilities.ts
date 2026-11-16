import type { CustomModel } from '@/data/settings';
import { resolveModelEndpoint, type streamModel, type stopModel, type ToolCall } from './model-stream';

type Check = 'passed' | 'failed' | 'unknown';
export interface ModelDesignCheck {
  identity: string;
  checkedAt: number;
  image: Check;
  tools: Check;
  handoff: Check;
  detail: string;
}

const swatches = { red: '#e8232b', green: '#138442', blue: '#175dd9', yellow: '#ffe53b' };
const names = Object.keys(swatches) as (keyof typeof swatches)[];
interface CapabilityProbe { colors: string[]; image: string; receipt: string }
const colorsSchema = { type: 'array', items: { type: 'string', enum: names }, minItems: 4, maxItems: 4 };
const schema = (name: string, description: string, properties: Record<string, unknown>) => ({
  type: 'function', function: { name, description, parameters: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false } },
});

function makeProbe() {
  const colors = Array.from(crypto.getRandomValues(new Uint8Array(4)), value => names[value % names.length]);
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 112;
  const context = canvas.getContext('2d');
  if (!context) throw Error('Could not create the model check image.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  colors.forEach((color, index) => {
    context.fillStyle = swatches[color];
    context.fillRect(12 + index * 78, 20, 62, 72);
  });
  return { colors, image: canvas.toDataURL('image/png'), receipt: crypto.randomUUID() };
}

export function modelCapabilityIdentity(model: CustomModel) {
  const { url, protocol } = resolveModelEndpoint(model.endpoint);
  return JSON.stringify([1, model.id, url, protocol, model.model || model.label]);
}

export function currentDesignCheck(model: CustomModel): ModelDesignCheck | undefined {
  try {
    const check = model.designCheck;
    if (check?.identity === modelCapabilityIdentity(model) && Number.isFinite(check.checkedAt) &&
      [check.image, check.tools, check.handoff].every(value => ['passed', 'failed', 'unknown'].includes(value))) return check;
  } catch { /* an invalid endpoint has no current check */ }
}

export function hasDesignCapabilities(model: CustomModel, needsImages: boolean) {
  const check = currentDesignCheck(model);
  return check?.tools === 'passed' && check.handoff === 'passed' && (!needsImages || check.image === 'passed');
}

function argumentsFor(calls: ToolCall[], name: string, keys: string[]): Record<string, unknown> | undefined {
  if (calls.length !== 1 || calls[0].name !== name || !calls[0].id) return;
  try {
    const value = JSON.parse(calls[0].arguments);
    if (value && !Array.isArray(value) && typeof value === 'object' && Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key))) return value;
  } catch { /* malformed provider response */ }
}

function validColors(value: unknown): value is string[] {
  return Array.isArray(value) && value.length === 4 && value.every(color => typeof color==='string'&&Object.prototype.hasOwnProperty.call(swatches, color));
}

function replayTool(call:ToolCall,receipt:string) {
  return [
    { role:'assistant',content:null,tool_calls:[{id:call.id,type:'function',function:{name:call.name,arguments:call.arguments}}] },
    { role:'tool',tool_call_id:call.id,content:receipt },
  ];
}

export async function checkModelCapabilities(model: CustomModel, stream: typeof streamModel, stop: typeof stopModel, probe: CapabilityProbe = makeProbe()): Promise<ModelDesignCheck> {
  const check: ModelDesignCheck = { identity: modelCapabilityIdentity(model), checkedAt: Date.now(), image: 'unknown', tools: 'unknown', handoff: 'unknown', detail: '' };
  const request = async (messages: unknown[], tools: unknown[]) => {
    const requestId = crypto.randomUUID();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        stream({ requestId, endpoint: model.endpoint, model: model.model || model.label, credentialId: model.id, messages, tools }, () => {}),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => { void stop(requestId).catch(() => {}); reject(Error('Model check timed out.')); }, 30_000); }),
      ]);
    } finally { clearTimeout(timeout); }
  };
  const messages: unknown[] = [{ role: 'user', content: [
    { type: 'text', text: 'Call CheckDesignImage once with the four rectangle colors from left to right. Only valid colors are red, green, blue, yellow. Colors may repeat.' },
    { type: 'image_url', image_url: { url: probe.image } },
  ] }];
  const imageTool=schema('CheckDesignImage','Report the visible colors.',{colors:colorsSchema});
  let first:ToolCall[];
  try {
    first=await request(messages,[imageTool]);
  } catch(error) {
    const message=error instanceof Error?error.message:String(error);
    if(!/^HTTP (400|422)\b/.test(message))return {...check,detail:connectionFailure(message)};
    check.image='failed';
    try{
      const begin=schema('CheckDesignTool','Ask for a local test receipt.',{});
      const finish=schema('CheckTextHandoff','Return the exact receipt and ready=true.',{receipt:{type:'string'},ready:{type:'boolean'}});
      const initial=[{role:'user',content:'Call CheckDesignTool once with no fields. Then return the tool receipt by calling CheckTextHandoff with the exact receipt and ready true.'}];
      const calls=await request(initial,[begin]);
      if(!argumentsFor(calls,'CheckDesignTool',[]))return {...check,tools:'failed',detail:'The image request was rejected and the text-only tool check failed.'};
      check.tools='passed';
      const handoff=argumentsFor(await request([...initial,...replayTool(calls[0],probe.receipt)],[begin,finish]),'CheckTextHandoff',['receipt','ready']);
      check.handoff=handoff?.receipt===probe.receipt&&handoff.ready===true?'passed':'failed';
      return {...check,detail:check.handoff==='passed'?'Text-only tools and handoffs passed. This model cannot be assigned to image-based design or review.':'The image request was rejected and the text-only handoff failed.'};
    }catch(cause){return {...check,detail:connectionFailure(cause instanceof Error?cause.message:String(cause))};}
  }
  try {
    const image = argumentsFor(first, 'CheckDesignImage', ['colors']);
    if (!image || !validColors(image.colors)) return { ...check, tools: 'failed', detail: 'The provider did not return the requested image tool call.' };
    check.image = image.colors.every((color, index) => color === probe.colors[index]) ? 'passed' : 'failed';
    const handoffTool = schema('CheckDesignHandoff', 'Return the exact tool receipt and the same colors in a structured handoff.', { receipt: { type: 'string' }, colors: colorsSchema });
    const second = await request([
      ...messages,
      ...replayTool(first[0],probe.receipt),
    ], [imageTool, handoffTool]);
    const handoff = argumentsFor(second, 'CheckDesignHandoff', ['receipt', 'colors']);
    check.tools = 'passed';
    check.handoff = handoff?.receipt === probe.receipt && validColors(handoff.colors) && JSON.stringify(handoff.colors) === JSON.stringify(image.colors) ? 'passed' : 'failed';
    check.detail = check.image === 'passed' && check.handoff === 'passed' ? 'The endpoint passed the design connection checks.' : 'One or more design connection checks failed.';
    return check;
  } catch (error) {
    return { ...check, detail: connectionFailure(error instanceof Error?error.message:String(error)) };
  }
}

function connectionFailure(message:string) {
  if(message==='Model check timed out.')return message;
  if(/^HTTP (401|403)\b/.test(message))return 'The provider rejected authentication. Check the saved key and permissions.';
  if(/^HTTP 404\b/.test(message))return 'The provider could not find the configured endpoint or model.';
  if(/^HTTP 429\b/.test(message))return 'The provider reported a rate limit or exhausted quota.';
  return 'The endpoint could not complete the check. Check the connection and credentials, then retry.';
}
