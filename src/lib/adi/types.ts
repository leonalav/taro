import type { ReviewScope } from '../review-store';

export type RuleCategory = 'accessibility' | 'interaction' | 'composition' | 'typography-color' | 'platform' | 'domain';
export type RuleAuthority = 'normative' | 'informative' | 'heuristic' | 'aesthetic' | 'project-policy';
export type VerificationMethod = 'machine' | 'visual' | 'interaction' | 'human';
export type SectionStatus = 'imported' | 'licensed-local' | 'excluded' | 'unavailable';
export interface SourceSection {
  id: string;
  status: SectionStatus;
  contentHash?: string;
  reason?: string;
}
export interface SourceRecord {
  id: string;
  publisher: string;
  title: string;
  edition: string;
  canonicalUrl: string;
  snapshotUrl: string;
  sectionManifest: SourceSection[];
  retrievedAt: string;
  contentHash: string;
  status: 'published' | 'superseded' | 'unverified';
  rights: 'redistributable' | 'licensed-local' | 'metadata-only';
  notice?: string;
}
export interface ConventionRule {
  id: string;
  sourceId: string;
  edition: string;
  contentHash: string;
  locator: string;
  title: string;
  category: RuleCategory;
  authority: RuleAuthority;
  level?: 'A' | 'AA' | 'AAA';
  exactText?: string;
  interpretation: string;
  applicability: { platforms?: string[]; componentKinds?: string[]; domain?: string[]; surfaces?: string[] };
  exceptions: string[];
  relatedRuleIds: string[];
  verificationMethods: VerificationMethod[];
}
export interface ConventionQuery {
  text?: string;
  categories?: string[];
  platforms?: string[];
  componentKinds?: string[];
  cursor?: string;
  limit?: number;
}
export interface CoverageReport {
  complete: boolean;
  sources: {
    id: string; edition: string; enumerated: string[]; imported: string[];
    licensedLocal: string[]; unavailable: string[]; excluded: { id: string; reason?: string }[];
  }[];
}
export interface DesignContext {
  intent: 'discussion' | 'design' | 'build' | 'review-fix' | 'non-ui';
  platforms: string[];
  audience: string[];
  primaryActions: string[];
  aesthetic: string[];
  constraints: string[];
  inputMethods: string[];
  domain: string[];
  surfaces: string[];
  referenceIds: string[];
  evidence: string[];
  uncertainty: string[];
  fingerprint: string;
}
export interface ConventionSelection {
  requiredRuleIds: string[];
  advisoryRuleIds: string[];
  excluded: { ruleId: string; reason: string; evidenceIds: string[] }[];
  conflicts: { ruleIds: string[]; reason: string; blocking: boolean }[];
  sourceVersions: Record<string, { edition: string; contentHash: string }>;
}
export interface DesignDecision {
  id: string;
  ruleIds: string[];
  componentIds: string[];
  targetFiles: string[];
  decision: string;
  rationale: string;
  acceptanceChecks: string[];
}
export interface PlanRef { id: string; path?: string; contentHash: string }
export interface AdiContract {
  version: 1;
  id: string;
  scope: ReviewScope;
  generation: number;
  context: DesignContext;
  selection: ConventionSelection;
  decisions: DesignDecision[];
  planRef: PlanRef;
  artifactDesignRevision: number;
  digest: string;
}
export type AdiPhase = 'classified' | 'selected' | 'planned' | 'implementing' | 'auditing' | 'revising' | 'verified' | 'blocked' | 'interrupted';
export interface SourceReadReceipt {
  id: string;
  runId: string;
  ownerId: string;
  scopeKey?: string;
  sourceId: string;
  sectionIds: string[];
  contentHash: string;
  createdAt: number;
}
export interface AdiRunState {
  version: 1;
  runId: string;
  scope: ReviewScope;
  phase: AdiPhase;
  context?: DesignContext;
  contract?: AdiContract;
  sourceReceipts: SourceReadReceipt[];
  evidenceIds: string[];
  evidence?: EvidenceRecord[];
  verification?: import("./completion").VerificationIdentity;
  mutationGeneration: number;
  blockedReasons: string[];
  completionReceipt?: string;
}
export type CheckResult = 'pass' | 'fail' | 'not-applicable' | 'needs-human' | 'unmeasured';
export interface EvidenceRecord {
  id: string;
  runId: string;
  contractDigest: string;
  workspaceIdentity: string;
  sourceFingerprint: string;
  previewId: string;
  revisionId: string;
  captureId: string;
  checkId: string;
  ruleIds: string[];
  provenance: VerificationMethod;
  result: CheckResult;
  artifactRefs: string[];
  targetSelectors?: string[];
  observation?: string;
  createdAt: number;
}
export interface CompletionDecision {
  status: 'ready' | 'needs-work' | 'blocked';
  missing: string[];
  receiptId?: string;
}
