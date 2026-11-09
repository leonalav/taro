import {describe,it,expect} from 'vitest';
import {restoreSettings,settingsForStorage,migrateLegacyModelKeys} from './settings-store';
import {defaultSettings} from '@/data/settings';
describe('persistent workspace preferences',()=>{
  it('migrates legacy keys before removing them and retains them when the keyring fails',async()=>{
    const settings={...defaultSettings,models:{...defaultSettings.models,customModels:[{id:'old',label:'old',endpoint:'http://localhost/v1',apiKey:'legacy-secret'}]}};
    const keys=new Map<string,string>();
    const migrated=await migrateLegacyModelKeys(settings,async(id,key)=>{keys.set(id,key);});
    expect(keys.get('old')).toBe('legacy-secret');expect(migrated.models.customModels[0].apiKey).toBeUndefined();
    await expect(migrateLegacyModelKeys(settings,async()=>{throw Error('locked');})).rejects.toThrow('locked');
    expect(settings.models.customModels[0].apiKey).toBe('legacy-secret');
  });
  it('retains endpoints and roles and adds the orchestrator when upgrading',()=>{
    const saved={...defaultSettings,agents:defaultSettings.agents.filter(a=>a.id!=='planner'),models:{...defaultSettings.models,customModels:[{id:'c',label:'local',model:'actual',endpoint:'http://localhost:1234/responses'}]}};
    const restored=restoreSettings(saved);
    expect(restored.models.customModels[0]).toMatchObject({model:'actual',endpoint:'http://localhost:1234/responses'});
    expect(restored.agents.some(a=>a.role==='Orchestrator agent')).toBe(true);
  });
  it('never persists secrets or inferred authentication and retires fictional skills',()=>{
    const saved={...defaultSettings,models:{...defaultSettings.models,customModels:[{id:'c',label:'m',endpoint:'https://api.test/v1',apiKey:'secret'}]},sourceControl:{...defaultSettings.sourceControl,signedIn:true},skills:[{id:'fake',label:'fake',source:'builtin' as const,enabled:true}]};
    const stored=settingsForStorage(saved);
    expect(JSON.stringify(stored)).not.toContain('secret');
    expect(stored.sourceControl.signedIn).toBe(false);
    expect(restoreSettings(saved).skills).toEqual([]);
  });
});
