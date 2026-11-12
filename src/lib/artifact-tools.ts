import type { ToolOutput } from './agent-tools';
import { artifactCss, createArtifactDesign, validateArtifactDesign, type ArtifactDesign, type ArtifactDesignRepository, type ArtifactDirection } from './artifact-design';
import { artifactDesignRepository } from './artifact-design-persistence';
import { artifactTemplate, type ArtifactTemplateKind } from './artifact-templates';

export interface ArtifactServices { repository:ArtifactDesignRepository }
export interface ArtifactContext { workspace:string;readOnly:boolean;planning:boolean;signal?:AbortSignal;designIntent?:ArtifactDesign }
export const artifactComponentContract={
  button:{variants:['primary','secondary','quiet','danger'],states:['default','hover','active','focus-visible','disabled','loading'],rules:['Use a button for an action and a link for navigation.','Loading uses aria-busy plus readable progress; disable duplicate submissions.','Disabled uses native disabled on buttons; disabled links need aria-disabled and prevented navigation.','Keep accessible names when replacing labels with icons.']},
  field:{states:['empty','filled','focus-visible','invalid','disabled','read-only'],rules:['Use visible labels and correct input types/autocomplete.','Connect helper/error text with aria-describedby; use aria-invalid on invalid fields.','Explain recovery and retain the entered value.']},
  card:{rules:['Use semantic article/section where meaningful.','Use contract cardPadding and card radius, reduced to spacing 4 below the small breakpoint.','Choose border OR elevation for separation; do not nest containers without a purpose.']},
  focus:{rules:['Use the contract focusWidth and semantic focus color.','Keyboard order follows the visual reading order; never remove focus outlines.','Focus must remain visible, unobscured and contrast with adjacent surfaces.']},
  media:{rules:['Use supplied or licensed imagery, responsive srcset/sizes and reserved aspect ratio.','Write useful alt text, or empty alt when decorative.','Keep text contrast independent of image content or provide a deliberate scrim.','Video needs an intentional poster, controls and captions where relevant.','Empty states explain the next action and do not masquerade as content.']},
};
export async function executeArtifactTool(input:Record<string,unknown>,context:ArtifactContext,services:ArtifactServices={repository:artifactDesignRepository}):Promise<ToolOutput> {
  const active=()=>{if(context.signal?.aborted)throw Error('Artifact design tool stopped.');};active();
  const action=input.action??'read';if(!['read','save','export','template'].includes(String(action)))throw Error('Unknown artifact design action.');
  const output=(value:unknown):ToolOutput=>({text:typeof value==='string'?value:JSON.stringify(value),artifact:{kind:'artifact-design',action}});
  if(action==='save'){
    if(context.designIntent)throw Error('The design job owns project memory updates after verification.');
    if(context.readOnly)throw Error('Project design memory cannot be changed by a read-only agent.');
    if(context.planning)throw Error('Project design memory cannot be changed in plan mode.');
    const design=validateArtifactDesign(input.design);active();
    const saved=await services.repository.save(context.workspace,design,input.expected_revision as number);active();
    return output({saved:true,...saved,componentContract:artifactComponentContract});
  }
  const saved=!context.designIntent&&context.workspace.trim()?await services.repository.read(context.workspace):null;active();
  if(context.designIntent&&input.design!==undefined)throw Error('Use the approved job contract for this export.');
  const design=context.designIntent??(input.design!==undefined?validateArtifactDesign(input.design):saved?.design??createArtifactDesign((input.direction??'editorial') as ArtifactDirection));
  if(action==='export')return output(artifactCss(design));
  if(action==='template')return output(artifactTemplate(design,input.template as ArtifactTemplateKind,input.title===undefined?design.name:String(input.title)));
  return output({saved:!!saved,revision:saved?.revision??0,design,source:context.designIntent?'approved-design-intent':saved?'project-memory':'starter',componentContract:artifactComponentContract,templateKinds:['hero','dashboard','gallery','form','pricing','mobile'],note:context.designIntent?'Use the approved design intent for this job.':saved?'Preserve this project identity unless the user requests a change.':'Inspect existing project styles before adopting a starter. Save the adapted contract to retain it across chats.'});
}
