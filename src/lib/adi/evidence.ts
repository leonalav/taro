import type { ArtifactAuditReport } from '../artifact-audit';
import type { VerificationIdentity } from './completion';
import type { AdiContract, EvidenceRecord } from './types';

const measuredRules = {
  'image-alt': 'wcag-2.2:1.1.1',
  'text-contrast': 'wcag-2.2:1.4.3',
  'horizontal-overflow': 'wcag-2.2:1.4.10',
  'target-size': 'wcag-2.2:2.5.8',
  'accessible-name': 'wcag-2.2:4.1.2',
} as const;

export function validateEvidenceBinding(record: EvidenceRecord, current: VerificationIdentity) {
  if (record.workspaceIdentity !== current.workspaceIdentity || record.sourceFingerprint !== current.sourceFingerprint ||
      record.contractDigest !== current.contractDigest || record.previewId !== current.previewId || record.revisionId !== current.revisionId ||
      !record.captureId || !record.artifactRefs.length) throw Error('Design evidence belongs to another contract, workspace or rendered revision.');
}

/** A bounded DOM audit can record findings. Coverage of each whole criterion needs more evidence. */
export function registerBrowserEvidence(runId: string, contract: AdiContract, identity: VerificationIdentity, report: ArtifactAuditReport): EvidenceRecord[] {
  if (!identity.previewId || !identity.revisionId || contract.digest !== identity.contractDigest) throw Error('Missing audit identity.');
  const evidence: EvidenceRecord[] = [];
  for (const item of report.cases) {
    for (const [checkId, ruleId] of Object.entries(measuredRules)) {
      if (!contract.selection.requiredRuleIds.includes(ruleId)) continue;
      const findings = item.findings.filter(finding => finding.rule === checkId);
      const result = findings.some(finding => finding.severity === 'error') && !['horizontal-overflow', 'accessible-name'].includes(checkId)
        ? 'fail' : 'unmeasured';
      evidence.push({
        id: crypto.randomUUID(), runId, contractDigest: contract.digest, workspaceIdentity: identity.workspaceIdentity,
        sourceFingerprint: identity.sourceFingerprint, previewId: identity.previewId, revisionId: identity.revisionId,
        captureId: report.id + ':' + item.scheme + ':' + item.mode, checkId, ruleIds: [ruleId],
        provenance: 'machine', result, artifactRefs: [report.id], createdAt: report.createdAt,
      });
    }
  }
  return evidence;
}
