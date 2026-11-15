import { describe, expect, it } from 'vitest';
import { validateArtifactAudit } from './artifact-audit';
import { auditFixture } from './test-fixtures/artifact-audit';
import { addPreview, attachArtifactAudit, createReviewRepository, revisePreview } from './review-store';

describe('revision-bound visual evidence',()=>{
  it('rejects missing cases, duplicate cases and unsupported success claims',()=>{
    const report=auditFixture();expect(validateArtifactAudit(report).status).toBe('measured-clear');
    expect(()=>validateArtifactAudit({...report,cases:report.cases.slice(1)})).toThrow();
    expect(()=>validateArtifactAudit({...report,cases:report.cases.map(()=>report.cases[0])})).toThrow();
    report.cases[0].findings.push({rule:'contrast',severity:'error',message:'Failed contrast'});
    expect(()=>validateArtifactAudit(report)).toThrow(/status/i);
  });
  it('retains delayed audit evidence on the original revision after save and reload',async()=>{
    let raw:string|null=null;
    const storage={read:async()=>raw,write:async(_:string,value:string)=>{raw=value;}};
    const repo=createReviewRepository(storage),scope={workspace:'A:/project',sessionId:'chat'};
    await repo.change(scope,state=>addPreview(state,{id:'preview',revisionId:'original',kind:'html',html:'original',title:'Original'}));
    await repo.change(scope,state=>revisePreview(state,'preview',{html:'new'},'new'));
    await repo.change(scope,state=>attachArtifactAudit(state,'preview','original',auditFixture()));
    const reloaded=createReviewRepository(storage);await reloaded.load(scope);
    const preview=reloaded.snapshot(scope).state.previews[0];
    expect(preview.revisionId).toBe('new');
    expect(preview.revisions[0].audits?.[0].id).toBe('audit-1');
    expect(preview.revisions[1].audits).toBeUndefined();
    expect(()=>attachArtifactAudit(repo.snapshot(scope).state,'preview','missing',auditFixture())).toThrow(/revision/i);
  });
});
