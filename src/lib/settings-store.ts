import {defaultSettings,type Settings} from '@/data/settings';
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
/** Upgrade each settings group without resetting saved endpoints, roles or imports. */
export function restoreSettings(value:unknown):Settings {
  const saved=record(value)?value:{};
  const group=<K extends keyof Settings>(key:K):Settings[K]=>({...defaultSettings[key] as object,...(record(saved[key])?saved[key]:{})}) as Settings[K];
  const models=group('models');
  models.customModels=Array.isArray(models.customModels)?models.customModels.filter(model=>model&&typeof model.id==='string'&&typeof model.endpoint==='string'&&typeof model.label==='string'):[];
  const agents=Array.isArray(saved.agents)?saved.agents.filter(a=>record(a)&&typeof a.id==='string'&&typeof a.role==='string') as Settings['agents']:defaultSettings.agents.map(a=>({...a}));
  if(!Array.isArray(saved.agents)){const defaultModel=models.customModels.find(model=>model.id===models.defaultModel);if(defaultModel)for(const agent of agents)agent.model=defaultModel.id;}
  if(!agents.some(a=>/orchestrator/i.test(a.role)))agents.push({...defaultSettings.agents.find(a=>a.id==='planner')!});
  return {...defaultSettings,...saved,account:group('account'),appearance:group('appearance'),models,sourceControl:{...group('sourceControl'),signedIn:false},browser:group('browser'),agents,
    plugins:Array.isArray(saved.plugins)?saved.plugins.filter(p=>record(p)&&typeof p.id==='string'&&p.transport&&(p.command||p.url)) as Settings['plugins']:[],
    skills:Array.isArray(saved.skills)?saved.skills.filter(s=>record(s)&&typeof s.label==='string'&&s.source==='custom'&&typeof s.path==='string') as Settings['skills']:[],
    rules:Array.isArray(saved.rules)?saved.rules as Settings['rules']:defaultSettings.rules.map(r=>({...r})),
  } as Settings;
}
export function settingsForStorage(settings:Settings):Settings {
  return {...settings,models:{...settings.models,customModels:settings.models.customModels.map(({apiKey:_,...model})=>model)},sourceControl:{...settings.sourceControl,signedIn:false,repos:[],branches:[]}};
}
export async function migrateLegacyModelKeys(settings:Settings,store:(id:string,secret:string)=>Promise<void>):Promise<Settings>{
  for(const model of settings.models.customModels)if(model.apiKey)await store(model.id,model.apiKey);
  return {...settings,models:{...settings.models,customModels:settings.models.customModels.map(({apiKey:_,...model})=>model)}};
}
