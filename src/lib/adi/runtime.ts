import type { ToolOutput } from '../agent-tools';
import { reviewScopeKey, type ReviewScope } from '../review-store';
import { compileDesignContract, digestValue, validateDecisionCoverage } from './contract';
import { classifyDesignContext, collectDesignSignals, detectFrontendImpact, type MutationDescriptor, type RunRequest, type WorkspaceDesignSnapshot } from './context';
import { buildCheckPlan, evaluateCheckCoverage } from "./checks";
import { registerBrowserEvidence } from "./evidence";
import type { ArtifactAuditReport } from "../artifact-audit";
import { evaluateDesignCompletion } from './completion';
import type { ConventionRegistry } from './registry';
import { isRecord, stringList, text, validateContract } from './schema';
import { selectConventions } from './selector';
import type { AdiRepository, AdiSnapshot } from './store';
import type { AdiRunState, ConventionQuery, DesignDecision, SourceReadReceipt } from './types';
import { adiToolNames } from './tool-definitions';

interface Owner { id: string; readOnly: boolean; planPath?: string }
interface Services { registry: ConventionRegistry; repository: AdiRepository; commit?: (contract: import("./types").AdiContract) => Promise<void> }
interface Identity { scope: ReviewScope; runId: string }
export interface GateDecision { allowed: boolean; reason?: string; nextTool?: string; contractDigest?: string }
const nonMutatingTools = new Set(['Read', 'ListFiles', 'Glob', 'Grep', 'LSP', 'ToolSearch', 'Skill',
  'TaskOutput', 'TaskStop', 'TaskTakeover', 'StopChildTasks', 'EnterPlanMode', 'ExitPlanMode',
  'Agent', 'DesignJob', 'SubmitDesignHandoff', 'BrowserInspect', 'BrowserAudit', 'BrowserViewport',
  'BrowserComment', 'BrowserComments', 'WebSearch', 'WebFetch', 'EnterWorktree', 'ExitWorktree']);
const editTools = new Set(['Write', 'Edit', 'NotebookEdit']);
function describeTool(tool: string, input: Record<string, unknown>): MutationDescriptor {
  let effect: MutationDescriptor['effect'] = 'external-unknown';
  if (adiToolNames.has(tool) || nonMutatingTools.has(tool)) effect = 'run-metadata';
  if (editTools.has(tool)) effect = 'workspace-write';
  if (tool === 'ArtifactDesign') effect = input.action === 'save' ? 'project-design' : 'read';
  if (tool === 'BrowserPreview') effect = input.html !== undefined ? 'project-design' : 'run-metadata';
  return { tool, input, effect };
}
const output = (name: string, data: unknown): ToolOutput => ({ text: JSON.stringify(data), artifact: { kind: 'adi', tool: name } });
const pathKey = (path: string) => path.replace(/\\/g, '/').replace(/^\/\/\?\/(?:UNC\/)?/i, prefix => /^\/\/\?\/UNC\//i.test(prefix) ? '//' : '').replace(/^\.\//, '');
export function designTargetPath(path: string, workspace: string) {
  const root = pathKey(workspace).replace(/\/$/, '');
  const windows = /^[a-z]:|^\/\//i.test(root);
  const key = (value: string) => windows ? value.toLowerCase() : value;
  const target = key(pathKey(path));
  return target.startsWith(key(root) + '/') ? target.slice(root.length + 1) : target;
}

export function createAdiRuntime({ registry, repository, commit }: Services, identity: Identity) {
  let snapshot: AdiSnapshot | undefined;
  let workspace: WorkspaceDesignSnapshot;
  let request: RunRequest;
  let pending: Promise<unknown> = Promise.resolve();
  const sequence = <T>(operation: () => Promise<T>) => {
    const next = pending.catch(() => {}).then(operation);
    pending = next;
    return next;
  };
  const state = () => {
    if (!snapshot) throw Error('ADI has not classified this run.');
    return snapshot.state;
  };
  const save = async (update: (state: AdiRunState) => AdiRunState) => {
    snapshot = await repository.transact(identity.scope, identity.runId, snapshot?.generation ?? 0, current => update(current!));
    return snapshot.state;
  };
  const baseline = (current: AdiRunState) => selectConventions(current.context!, registry);
  const missingReceipts = (current: AdiRunState, ids: string[]) => ids.filter(id => {
    const rule = registry.getRule(id);
    const source = rule && registry.getSource(rule.sourceId);
    return rule && source && !current.sourceReceipts.some(receipt => receipt.sourceId === source.id &&
      receipt.contentHash === source.contentHash && receipt.sectionIds.includes(rule.locator));
  });
  const needsPlan = (current: AdiRunState) => current.context?.intent !== 'discussion' && current.context?.intent !== 'non-ui';
  const decision = () => {const current=state();return evaluateDesignCompletion(current,current.evidence??[],current.verification);};

  return {
    async prepare(next: RunRequest, project: WorkspaceDesignSnapshot) {
      return sequence(async () => {
        if (snapshot) return snapshot.state;
        workspace = project;
        request = next;
        const context = classifyDesignContext(collectDesignSignals(request, workspace));
        return save(() => ({ version: 1, ...identity, phase: context.intent === 'discussion' || context.intent === 'non-ui' ? 'classified' : 'selected',
          context, sourceReceipts: [], evidenceIds: [], mutationGeneration: 0, blockedReasons: [] }));
      });
    },
    beforeTool(tool: string, input: Record<string, unknown>, owner: Owner): Promise<GateDecision> {
      return sequence(async () => {
        const operation = describeTool(tool, input);
        if (operation.effect === 'read' || operation.effect === 'run-metadata') return { allowed: true };
        if (owner.planPath && editTools.has(tool) && typeof input.file_path === 'string' && designTargetPath(input.file_path, identity.scope.workspace) === designTargetPath(owner.planPath, identity.scope.workspace)) return { allowed: true };
        if (owner.readOnly) return { allowed: false, reason: 'This agent is read-only.' };
        let current = state();
        const impact = detectFrontendImpact(operation, workspace);
        if (!needsPlan(current) && impact === 'non-ui') return { allowed: true };
        if (!needsPlan(current)) {
          const context = classifyDesignContext(collectDesignSignals({ ...request, explicitScope: 'frontend' }, workspace));
          current = await save(value => ({ ...value, context: { ...context, intent: 'build' }, phase: 'selected' }));
        }
        if (!current.contract) return { allowed: false, reason: 'Prepare an ADI design contract before changing the frontend. Use DesignContext for exact selected IDs, then ConventionRead and DesignPlan.', nextTool: 'ConventionRead' };
        const suppliedPath = tool==='NotebookEdit'?input.notebook_path:input.file_path;
        if (operation.effect === 'workspace-write' && typeof suppliedPath === 'string') {
          const relative = designTargetPath(suppliedPath, identity.scope.workspace);
          if (!current.contract.decisions.some(decision => decision.targetFiles.some(target => designTargetPath(target, identity.scope.workspace) === relative))) {
            return { allowed: false, reason: 'Add this file to a design decision before changing it.', nextTool: 'DesignDecision' };
          }
        }
        await save(value => ({ ...value, phase: 'implementing', mutationGeneration: value.mutationGeneration + 1, evidenceIds: [], evidence: [], verification: undefined, completionReceipt: undefined }));
        return { allowed: true, contractDigest: current.contract.digest };
      });
    },
    async execute(name: string, input: Record<string, unknown>, owner: Owner): Promise<ToolOutput> {
      return sequence(async () => {
        const current = state();
        const selection = baseline(current);
        if (name === 'DesignContext') return output(name, { context: current.context, selection: {
          requiredRuleIds: selection.requiredRuleIds, advisoryRuleIds: selection.advisoryRuleIds,
          rules: [...selection.requiredRuleIds, ...selection.advisoryRuleIds].map(id => ({ id, title: registry.getRule(id)?.title })),
          unreadRequiredRuleIds: missingReceipts(current, selection.requiredRuleIds),
        }, next: 'Read required rules with ConventionRead missing_required=true until remaining is 0. Use exact IDs in grouped DesignPlan decisions.' });
        if (name === 'ConventionSearch') return output(name, registry.search(input as ConventionQuery));
        if (name === 'DesignChecks') return output(name, {completion:decision(),checks:current.contract?evaluateCheckCoverage(buildCheckPlan(current.contract,registry),current.evidence??[]):[]});
        if (name === 'ConventionRead') {
          const missing = missingReceipts(current, selection.requiredRuleIds);
          const ids = input.missing_required === true ? missing.slice(0, 6) : input.rule_ids;
          if (!stringList(ids) || ids.length > 12 || (!ids.length && input.missing_required !== true)) throw Error('Supply one to 12 exact rule IDs or set missing_required to true.');
          if (!ids.length) return output(name, { rules: [], remaining: 0 });
          const rules = [...new Set(ids)].map(id => {
            const rule = registry.getRule(id);
            if (!rule) throw Error('Unknown convention: ' + id);
            return rule;
          });
          const receipts: SourceReadReceipt[] = [];
          const sources = [...new Set(rules.map(rule => rule.sourceId))].map(id => registry.getSource(id)!);
          for (const source of sources) {
            const sectionIds = rules.filter(rule => rule.sourceId === source.id).map(rule => rule.locator);
            receipts.push({ id: crypto.randomUUID(), runId: identity.runId, ownerId: owner.id, scopeKey: reviewScopeKey(identity.scope),
              sourceId: source.id, sectionIds, contentHash: source.contentHash, createdAt: Date.now() });
          }
          const updated = await save(value => ({ ...value, sourceReceipts: [...value.sourceReceipts, ...receipts] }));
          return output(name, { rules, receipts: receipts.map(receipt => receipt.id), remaining: missingReceipts(updated, selection.requiredRuleIds).length,
            sources: sources.map(({ id, title, edition, canonicalUrl, snapshotUrl, notice }) => ({ id, title, edition, canonicalUrl, snapshotUrl, notice })) });
        }
        if (name === 'DesignPlan' && input.action === 'read') return output(name, current.contract ?? { context: current.context, selection });
        if (name !== 'DesignDecision' && !(name === 'DesignPlan' && input.action === 'submit')) throw Error('Unknown ADI tool action.');
        if (owner.readOnly) throw Error('This agent is read-only.');
        if (!Array.isArray(input.decisions)) throw Error('Design decisions must be an array.');
        if (!needsPlan(current)) throw Error('The run has no classified frontend scope.');
        const submitted = input.decisions.map((value: unknown, index): DesignDecision => {
          if (!isRecord(value) || !stringList(value.ruleIds) || !stringList(value.componentIds) || !stringList(value.targetFiles) ||
            !text(value.decision) || !text(value.rationale) || !stringList(value.acceptanceChecks)) throw Error('Design decision ' + (index + 1) + ' requires ruleIds, componentIds, targetFiles, decision, rationale and acceptanceChecks.');
          return { id: crypto.randomUUID(), ruleIds: value.ruleIds, componentIds: value.componentIds, targetFiles: value.targetFiles,
            decision: value.decision, rationale: value.rationale, acceptanceChecks: value.acceptanceChecks };
        });
        const decisions = name === 'DesignDecision' ? [...current.contract?.decisions ?? [], ...submitted] : submitted;
        const planRef = { id: 'design-plan-' + crypto.randomUUID(), contentHash: await digestValue(decisions) };
        const contract = await compileDesignContract(current.context!, selection, decisions, planRef, 0,
          { scope: identity.scope, generation: (current.contract?.generation ?? 0) + 1 });
        validateContract(contract, registry);
        const issues = validateDecisionCoverage(contract, current.sourceReceipts, { registry, runId: identity.runId });
        if (issues.length) {
          const unread = missingReceipts(current, [...new Set([...selection.requiredRuleIds, ...decisions.flatMap(item => item.ruleIds)])]);
          throw Error(issues.map(issue => issue.message).join('. ') +
            (unread.length ? '. Read these exact IDs with ConventionRead before resubmitting: ' + unread.join(', ') : ''));
        }
        await commit?.(contract);
        await save(value => ({ ...value, contract, phase: 'planned', evidenceIds: [], evidence: [], verification: undefined, completionReceipt: undefined }));
        const result=output(name, { contractId: contract.id, contractDigest: contract.digest, planRef, decisionIds: decisions.map(item => item.id) });
        return {...result,artifact:{...result.artifact,contractChanged:true}};
      });
    },
    async attest(input:Record<string,unknown>, owner:Owner) {
      return sequence(async()=>{
        if(owner.readOnly)throw Error('This agent is read-only.');
        const current=state(), verification=current.verification, contract=current.contract;
        if(!verification||!contract)throw Error('Collect a current browser audit before recording reviewer verification.');
        if(typeof input.generation!=='number'||input.generation!==current.mutationGeneration||input.contract_digest!==contract.digest||input.audit_id!==verification.auditId)throw Error('The audited revision changed while waiting for approval.');
        const checks=input.checks;
        if(!Array.isArray(checks)||!checks.length)throw Error('Provide rule-level observations for reviewer verification.');
        const auditId=current.evidence?.[0]?.artifactRefs[0];
        if(!auditId||!verification.previewId||!verification.revisionId)throw Error('The saved audit is unavailable.');
        const confirmed=checks.map((item:unknown)=>{
          if(!isRecord(item)||!text(item.rule_id)||!contract.selection.requiredRuleIds.includes(item.rule_id)||
            !text(item.observation)||item.observation.trim().length<12||
            !['pass','not-applicable'].includes(String(item.result)))throw Error('Each reviewer check needs a selected rule, a disposition and a concrete observation.');
          if(item.result==='not-applicable'&&!contract.decisions.some(decision=>decision.ruleIds.includes(String(item.rule_id))))throw Error('Record the applicability decision first.');
          return {id:crypto.randomUUID(),runId:identity.runId,contractDigest:contract.digest,workspaceIdentity:verification.workspaceIdentity,
            sourceFingerprint:verification.sourceFingerprint,previewId:verification.previewId!,revisionId:verification.revisionId!,captureId:auditId,
            checkId:String(item.rule_id)+':human',ruleIds:[String(item.rule_id)],provenance:'human' as const,
            result:item.result as 'pass'|'not-applicable',artifactRefs:[auditId],createdAt:Date.now(),
            observation:item.observation.trim(),targetSelectors:stringList(item.target_selectors)?item.target_selectors:undefined};
        });
        const evidence=[...current.evidence??[],...confirmed];
        await save(value=>({...value,evidence,evidenceIds:evidence.map(item=>item.id)}));
        return output('DesignChecks',{verifiedBy:'reviewer',evidence:confirmed,completion:decision()});
      });
    },
    async recordBrowserAudit(previewId:string, revisionId:string, report:ArtifactAuditReport, generation:number,workspaceFingerprint?:string){
      await sequence(async()=>{
        const current=state();
        if(!current.contract||current.mutationGeneration!==generation)return;
        const verification={workspaceIdentity:reviewScopeKey(identity.scope),sourceFingerprint:workspaceFingerprint??report.resourceFingerprint??report.sourceHash,
          contractDigest:current.contract.digest,mutationGeneration:generation,previewId,revisionId,auditId:report.id};
        const evidence=registerBrowserEvidence(identity.runId,current.contract,verification,report);
        await save(value=>({...value,phase:"auditing",verification,evidence,evidenceIds:evidence.map(record=>record.id)}));
      });
    },
    evidence:(id:string)=>snapshot?.state.evidence?.find(record=>record.id===id),
    verification:()=>snapshot?.state.verification,
    mutationGeneration:()=>snapshot?.state.mutationGeneration??0,
    async evaluateCompletion() { await pending.catch(() => {}); return decision(); },
    sealCompletion() { return sequence(async()=>{
      const outcome=decision(),current=state();
      if(outcome.status!=='ready'||!needsPlan(current))return outcome;
      if(current.completionReceipt)return {...outcome,receiptId:current.completionReceipt};
      const receiptId=crypto.randomUUID();
      await save(value=>({...value,phase:'verified',completionReceipt:receiptId}));
      return {...outcome,receiptId};
    }); },
    contract: () => snapshot?.state.contract,
    designContext:()=>snapshot?.state.context,
    contextFor() {
      const current = snapshot?.state;
      if (!current || !needsPlan(current)) return '';
      return current.contract
        ? 'ADI contract ' + current.contract.id + ' (' + current.contract.digest + '). Use DesignChecks for missing verification.'
        : 'Before frontend work, call DesignContext and inspect the exact selected rule IDs. Call ConventionRead with missing_required=true until remaining is 0. Then submit DesignPlan with grouped concrete decisions, workspace-relative target files, and non-empty acceptance checks. Do not attempt Write or Edit until DesignPlan succeeds.';
    },
  };
}
