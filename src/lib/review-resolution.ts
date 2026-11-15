import type { EvidenceRecord } from './adi/types';
import { resolveReviewAnchor, type ReviewAnchorV2 } from './review-anchors';
import { previewById, type ReviewRepository, type ReviewScope, type ReviewThread } from './review-store';

export interface ResolutionTarget { previewId: string; revisionId: string; anchor: ReviewAnchorV2; sourceFingerprint: string }
export interface ResolutionProposal {
  threadId: string; threadGeneration: number; originalRevisionId: string; target: ResolutionTarget; evidenceIds: string[];
  disposition: 'fixed' | 'no-change'; explanation: string;
}
export interface VerifiedResolution {
  sourceThreadId: string; sourceThreadGeneration: number; originalRevisionId: string; verifiedRevisionId: string;
  contractDigest: string; evidenceIds: string[]; disposition: 'fixed' | 'no-change'; explanation: string;
  verifiedAt: number; receiptId: string; target: ResolutionTarget;
}

export function proposeReviewResolution(thread: ReviewThread, target: ResolutionTarget, evidenceIds: string[], explanation: string, disposition: ResolutionProposal['disposition'] = 'fixed'): ResolutionProposal {
  return { threadId: thread.id, threadGeneration: thread.generation ?? 0, originalRevisionId: thread.revisionId, target, evidenceIds, disposition, explanation };
}

export async function validateReviewResolution(proposal: ResolutionProposal, services: {
  scope: ReviewScope; reviews: ReviewRepository; evidence: (id: string) => EvidenceRecord | undefined;
  requiredRuleIds: string[]; contractDigest: string;
}): Promise<VerifiedResolution> {
  await services.reviews.load(services.scope);
  const preview = previewById(services.reviews.snapshot(services.scope).state, proposal.target.previewId);
  const thread = preview.threads.find(thread => thread.id === proposal.threadId);
  if (!thread || thread.resolved || thread.revisionId !== proposal.originalRevisionId || (thread.generation ?? 0) !== proposal.threadGeneration) {
    throw Error('The assigned Review thread changed. Reload it before resolving.');
  }
  const latest = preview.revisions.at(-1)!;
  if (latest.id !== proposal.target.revisionId || !latest.capture || !latest.observation) throw Error('The target Review revision is stale or has no capture.');
  if (proposal.disposition === 'fixed' && latest.id === thread.revisionId) throw Error('Save a corrected revision before resolving this thread.');
  if (thread.anchor.version !== 2 || !(thread.anchor as ReviewAnchorV2).fingerprint) throw Error('Confirm a new target for the original annotation.');
  const resolved = resolveReviewAnchor(thread.anchor as ReviewAnchorV2, { ...latest.observation, screenshot: latest.capture }, latest.id);
  if (resolved.status !== 'exact' || !resolved.rect || proposal.target.anchor.fingerprint !== (thread.anchor as ReviewAnchorV2).fingerprint || proposal.target.anchor.revisionId !== latest.id) throw Error('The original component cannot be identified on the current revision.');
  if (!proposal.explanation.trim() || !services.requiredRuleIds.length || !proposal.evidenceIds.length) throw Error('Resolution requires an explanation and rule-level evidence.');
  const records = proposal.evidenceIds.map(services.evidence);
  if (records.some(record => !record || record.result !== 'pass' || record.contractDigest !== services.contractDigest ||
    record.previewId !== preview.id || record.revisionId !== latest.id || record.sourceFingerprint !== proposal.target.sourceFingerprint ||
    !record.targetSelectors?.includes(proposal.target.anchor.selector ?? ''))) throw Error('Resolution evidence is missing, stale or does not cover the target component.');
  if (services.requiredRuleIds.some(id => !records.some(record => record?.ruleIds.includes(id)))) throw Error('Some assigned checks still lack passing evidence.');
  return {
    sourceThreadId: thread.id, sourceThreadGeneration: proposal.threadGeneration, originalRevisionId: thread.revisionId,
    verifiedRevisionId: latest.id, contractDigest: services.contractDigest, evidenceIds: [...new Set(proposal.evidenceIds)],
    disposition: proposal.disposition, explanation: proposal.explanation, verifiedAt: Date.now(), receiptId: crypto.randomUUID(), target: proposal.target,
  };
}
