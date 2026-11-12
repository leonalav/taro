import type { ArtifactAuditReport } from '../artifact-audit';
export function auditFixture():ArtifactAuditReport {
  return {version:1,id:'audit-1',createdAt:100,sourceHash:'a'.repeat(64),sourceKind:'html',status:'measured-clear',manualChecks:['Inspect keyboard focus'],limitations:['Solid contrast only'],cases:(['light','dark'] as const).flatMap(scheme=>(['desktop','mobile','zoom','reduced-motion'] as const).map(mode=>({scheme,mode,viewport:{width:mode==='mobile'?320:mode==='zoom'?720:1440,height:900},zoom:mode==='zoom'?2:1,reducedMotion:mode==='reduced-motion',screenshot:'data:image/png;base64,example',sourceHash:'b'.repeat(64),findings:[],unmeasured:[],truncated:false,measuredText:4})))};
}
