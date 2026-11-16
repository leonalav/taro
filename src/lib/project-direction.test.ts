import { describe, expect, it } from 'vitest';
import { createProjectDirectionRepository, parseDesignReferences, parseDirectionProposal, parseVisualHandoff } from './project-direction';

const still = { id:'attachment-1', kind:'screenshot', label:'Gallery overview', learn:'Study layout', source:'attachment-1' };
const option = {id:'folio', name:'Folio', rationale:'Typography leaves room for the work', composition:'image-led', typography:'serif', headline:'Work in proportion', action:'View work'};

describe('project direction', () => {
  it('keeps immutable decision history, rejects stale edits, survives a repository restart, and isolates projects', async () => {
    const data = new Map<string,string>();
    const storage = { read: async (key:string) => data.get(key) ?? null, write: async (key:string,value:string) => { data.set(key,value); } };
    const first = createProjectDirectionRepository(storage);
    const decisions = { audience:'Gallery curators', primaryAction:'View the work', selectedDirection:'Folio', reason:'Keep the work prominent', constraints:['Keep the supplied serif'], questions:['Which case study leads?'], approvedAssetIds:['font-one'], nextAction:'Check the narrow layout' };
    await first.save('A:\\Studio\\', decisions, 'suggested', 0);
    const results = await Promise.allSettled([
      first.save('a:/studio', {...decisions, nextAction:'Review the lead image'}, 'user', 1),
      first.save('a:/studio', {...decisions, nextAction:'Overwrite the choice'}, 'suggested', 1),
    ]);
    expect(results.map(result=>result.status)).toEqual(['fulfilled','rejected']);
    const restarted = createProjectDirectionRepository(storage);
    expect((await restarted.read('a:/studio'))?.history.map(item=>[item.author,item.direction.nextAction])).toEqual([['suggested','Check the narrow layout'],['user','Review the lead image']]);
    expect(await restarted.read('a:/different')).toBeNull();
  });

  it('keeps screenshot motion unknown and supports independent regions of the same source', () => {
    const references = parseDesignReferences([still]);
    const proposal = parseDirectionProposal({ options:[option,{...option,id:'type',composition:'type-led'}], selectedId:'folio', reason:'Focus on the work', observations:[
      {referenceId:still.id,region:'Top left',composition:'Wide lead project',typography:'Large serif',color:'Warm monochrome',media:'Project photo',spacing:'Wide gutter',interaction:'A details link is visible',motion:'Observed rotation'},
    ] }, references);
    expect(proposal.observations[0].motion).toBe('Unknown from a still image.');
    expect(()=>parseDirectionProposal({options:[option,{...option,id:'copy'}],selectedId:'folio',reason:'Same layout',observations:[]},references)).toThrow(/distinct/);
    expect(()=>parseDesignReferences([{...still,kind:'website',source:'javascript:alert(1)'}])).toThrow(/HTTP/);
    expect(()=>parseDesignReferences([still,still])).toThrow(/duplicate/i);
  });

  it('rejects broken layer links, unapproved asset references and undocumented interaction fallbacks', () => {
    const entry = {layouts:[{layerId:'hero',alignment:'left',growth:'grows',wrapping:'wrap at 40ch',mobile:'stack'}], interactions:[{id:'rotate',trigger:'drag',change:'rotate product',progress:'follows pointer',reducedMotion:'instant',alternative:'buttons'}], scene:{objects:[{name:'Product',assetId:'actual-model',material:'Brushed metal'}],camera:'Eye level',lighting:'Softbox',controls:'Drag',loading:'Show poster',fallback:'Show still',quality:'Lower pixel ratio'}};
    expect(parseVisualHandoff(entry,['hero'],['actual-model'])).toEqual(entry);
    expect(()=>parseVisualHandoff(entry,['different'],['actual-model'])).toThrow(/layer/i);
    expect(()=>parseVisualHandoff(entry,['hero'],[])).toThrow(/asset/i);
    expect(()=>parseVisualHandoff({...entry,interactions:[{...entry.interactions[0],alternative:''}]},['hero'],['actual-model'])).toThrow(/alternative/i);
  });
});
