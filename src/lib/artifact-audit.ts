export interface ArtifactFinding { rule:string; severity:'error'|'warning'|'info'; selector?:string; message:string; ratio?:number; required?:number }
export interface ArtifactAuditCase {
  scheme:'light'|'dark'; mode:'desktop'|'mobile'|'zoom'|'reduced-motion';
  viewport:{width:number;height:number}; zoom:number; reducedMotion:boolean;
  screenshot:string; sourceHash:string; findings:ArtifactFinding[];
  unmeasured:{selector:string;reason:string}[]; truncated:boolean; measuredText:number;
}
export interface ArtifactAuditReport {
  version:1; id:string; createdAt:number; sourceHash:string; sourceKind:'html'|'url';
  status:'issues'|'measured-clear'|'incomplete'; cases:ArtifactAuditCase[];
  manualChecks:string[]; limitations:string[];
}
export function validateArtifactAudit(value:unknown):ArtifactAuditReport {
  const r=value as ArtifactAuditReport;
  if(!r||r.version!==1||typeof r.id!=='string'||!Number.isFinite(r.createdAt)||!['html','url'].includes(r.sourceKind)||!['issues','measured-clear','incomplete'].includes(r.status)||!Array.isArray(r.cases)||r.cases.length!==8||!Array.isArray(r.manualChecks)||!Array.isArray(r.limitations)||!/^([a-f0-9]{64})$/.test(r.sourceHash))throw Error('Invalid or incomplete browser audit evidence.');
  const keys=new Set<string>();
  for(const c of r.cases){
    const key=`${c.scheme}:${c.mode}`;
    if(keys.has(key)||!['light','dark'].includes(c.scheme)||!['desktop','mobile','zoom','reduced-motion'].includes(c.mode)||!c.viewport||![c.viewport.width,c.viewport.height].every(n=>Number.isInteger(n)&&n>0&&n<=4096)||!c.screenshot?.startsWith('data:image/png;base64,')||!/^([a-f0-9]{64})$/.test(c.sourceHash)||!Array.isArray(c.findings)||!Array.isArray(c.unmeasured)||typeof c.truncated!=='boolean'||!Number.isInteger(c.measuredText)||c.measuredText<0||c.zoom!==(c.mode==='zoom'?2:1)||c.reducedMotion!==(c.mode==='reduced-motion'))throw Error('Invalid browser audit case.');
    keys.add(key);
    for(const f of c.findings)if(!f||typeof f.rule!=='string'||typeof f.message!=='string'||!['error','warning','info'].includes(f.severity))throw Error('Invalid audit finding.');
    for(const u of c.unmeasured)if(typeof u?.selector!=='string'||typeof u.reason!=='string')throw Error('Invalid audit coverage.');
  }
  const status=r.cases.some(c=>c.truncated)?'incomplete':r.cases.some(c=>c.findings.some(f=>f.severity!=='info'))?'issues':'measured-clear';
  if(r.status!==status)throw Error('Audit status does not match measured evidence.');
  return JSON.parse(JSON.stringify(r));
}
