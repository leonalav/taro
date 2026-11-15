import * as React from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { activeRevision, type ReviewPreview, type ReviewScope } from '@/lib/review-store';
import { executeReviewTool } from '@/lib/review-tools';
import type { ArtifactAuditCase } from '@/lib/artifact-audit';

export function ArtifactAuditPanel({scope,preview,onClose}:{scope:ReviewScope;preview:ReviewPreview;onClose:()=>void}) {
  const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[reportId,setReportId]=React.useState('');
  const [image,setImage]=React.useState<ArtifactAuditCase|null>(null);
  const revision=activeRevision(preview),reports=revision.audits??[];
  const report=reports.find(r=>r.id===reportId)??reports[reports.length-1];
  const run=async()=>{
    if(busy)return;setBusy(true);setError('');
    try{await executeReviewTool('BrowserAudit',{preview_id:preview.id},{scope,author:'You',role:'Reviewer'});setReportId('');}
    catch(error){setError(String(error));}finally{setBusy(false);}
  };
  const issues=report?.cases.reduce((sum,c)=>sum+c.findings.filter(f=>f.severity!=='info').length,0)??0;
  return <aside className="review-side-panel artifact-audit-panel" aria-label="Artifact visual checks">
    <header><strong>Visual checks</strong><button type="button" aria-label="Close visual checks" onClick={onClose}><X/></button></header>
    <p className="text-xs leading-5 text-muted-foreground">Checks belong to this saved revision. Inspect the screenshots, fix the source, then save and check a new revision.</p>
    <button type="button" className="review-primary artifact-audit-run" disabled={busy} onClick={()=>{void run();}}>{busy&&<Loader2 className="size-3.5 animate-spin"/>}{busy?'Checking eight environments…':'Run visual checks'}</button>
    <div role="status" aria-live="polite" className="text-xs">{busy?'Rendering light and dark at desktop, 320px, 200% zoom equivalent and reduced motion.':report?`${report.status==='incomplete'?'Incomplete coverage':issues?`${issues} findings across eight environments`:'No failures in measured checks'}. Manual review required.`:'No saved checks for this revision.'}</div>
    {error&&<p role="alert" className="review-error">{error} Use Run visual checks to retry.</p>}
    {reports.length>1&&<label className="artifact-audit-report-label">Saved run<select aria-label="Visual check report" value={report?.id??''} onChange={event=>setReportId(event.target.value)}>{reports.map((r,index)=><option key={r.id} value={r.id}>Run {index+1} · {new Date(r.createdAt).toLocaleString()}</option>)}</select></label>}
    {report&&<>
      <p className="text-[11px] text-muted-foreground">{new Date(report.createdAt).toLocaleString()} · {report.sourceKind==='url'?'Live URL observation':'Saved HTML revision'}</p>
      {report.cases.map((item,index)=><details key={`${item.scheme}:${item.mode}`} className="artifact-audit-case">
        <summary>{item.scheme==='light'?'Light':'Dark'} · {item.mode==='zoom'?'200% zoom equivalent':item.mode==='reduced-motion'?'Reduced motion':item.mode==='mobile'?'320px':'Desktop'}<span>{item.findings.filter(f=>f.severity!=='info').length} findings</span></summary>
        <p className="art-audit-detail">{item.viewport.width} × {item.viewport.height} CSS px · {item.measuredText} text samples measured{item.truncated?' · Coverage truncated':''}</p>
        <button type="button" className="artifact-audit-image" onClick={()=>setImage(item)} aria-label={`Open ${item.scheme} ${item.mode} screenshot`}><img src={item.screenshot} loading="lazy" alt={`${item.scheme} ${item.mode} rendered visual check, case ${index+1}`}/><span>Inspect full screenshot</span></button>
        <ul>{item.findings.map((finding,i)=><li key={i}><strong>{finding.severity==='info'?'Observation':finding.severity==='warning'?'Review':'Fix'} · {finding.rule}</strong><p>{finding.message}</p>{finding.selector&&<code>{finding.selector}</code>}</li>)}</ul>
        {item.unmeasured.length>0&&<details><summary>{item.unmeasured.length} contrast samples need visual review</summary><ul>{item.unmeasured.map((entry,i)=><li key={i}><code>{entry.selector}</code><p>{entry.reason}</p></li>)}</ul></details>}
        <p className="artifact-audit-hash">Observed source: <code>{item.sourceHash}</code></p>
      </details>)}
      <section className="artifact-audit-manual"><h3>Finish the review</h3><ul>{report.manualChecks.map(check=><li key={check}>{check}</li>)}</ul></section>
      <details className="artifact-audit-case"><summary>Coverage and limits</summary><ul>{report.limitations.map(limit=><li key={limit}>{limit}</li>)}</ul></details>
    </>}
    {image&&createPortal(<AuditImageViewer item={image} onClose={()=>setImage(null)}/>,document.body)}
  </aside>;
}

function AuditImageViewer({item,onClose}:{item:ArtifactAuditCase;onClose:()=>void}){
  const ref=React.useRef<HTMLDialogElement>(null),[fit,setFit]=React.useState(true);
  React.useEffect(()=>{ref.current?.showModal();},[]);
  return <dialog ref={ref} className="artifact-audit-viewer" aria-label={`${item.scheme} ${item.mode} visual evidence`} onCancel={onClose} onClose={onClose}>
    <header><strong>{item.scheme} · {item.mode} · {item.viewport.width} × {item.viewport.height}</strong><button type="button" aria-pressed={!fit} onClick={()=>setFit(value=>!value)}>{fit?'Actual pixels':'Fit to width'}</button><button type="button" aria-label="Close screenshot" onClick={onClose}><X className="size-4"/></button></header>
    <div className="artifact-audit-image-scroll" tabIndex={0} aria-label="Scrollable screenshot"><img src={item.screenshot} alt={`${item.scheme} ${item.mode} audit screenshot`} style={{width:fit?'100%':'auto',maxWidth:'none'}}/></div>
  </dialog>;
}
