import * as React from 'react';
import { loadBundledRegistry } from '@/lib/adi/bundled-registry';
import type { AdiContract } from '@/lib/adi/types';
import type { ConventionRegistry } from '@/lib/adi/registry';

export function AdiContractPanel({ contract }: { contract: AdiContract }) {
  const [registry, setRegistry] = React.useState<ConventionRegistry>();
  const [error, setError] = React.useState('');
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    let active = true;
    loadBundledRegistry().then(value => { if (active) { setRegistry(value); setError(''); } })
      .catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; };
  }, [attempt]);
  const sources = Object.entries(contract.selection.sourceVersions);
  return <details className="artifact-audit-case">
    <summary>Design conventions · {contract.selection.requiredRuleIds.length} required</summary>
    <p>{contract.context.platforms.join(', ')} · {contract.context.intent}</p>
    {contract.context.uncertainty.map(item => <p key={item}>{item}</p>)}
    {error && <p role="alert">{error} <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry sources</button></p>}
    {registry && !registry.coverage().complete && <p>Some source sections are unavailable in this release.</p>}
    <ul>{sources.map(([id, version]) => {
      const source = registry?.getSource(id);
      return <li key={id}>{source ? <a href={source.canonicalUrl} target="_blank" rel="noreferrer">{source.title}</a> : id} · {version.edition}</li>;
    })}</ul>
    {contract.selection.conflicts.map((item, index) => <p key={index}>{item.blocking ? 'Blocked' : 'Conflict'} · {item.reason}</p>)}
    <ol>{contract.decisions.map(decision => <li key={decision.id}>
      <strong>{decision.decision}</strong><p>{decision.rationale}</p><p>{decision.ruleIds.join(', ')}</p>
      <p>{decision.targetFiles.join(', ')}</p>
    </li>)}</ol>
  </details>;
}
