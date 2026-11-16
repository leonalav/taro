const string = { type: 'string' };
const strings = { type: 'array', items: string };
const decision = {
  type: 'object', properties: { ruleIds: { ...strings, minItems: 1 }, componentIds: strings, targetFiles: strings,
    decision: string, rationale: string, acceptanceChecks: { ...strings, minItems: 1 } },
  required: ['ruleIds', 'componentIds', 'targetFiles', 'decision', 'rationale', 'acceptanceChecks'], additionalProperties: false,
};
const decisions = { type: 'array', minItems: 1, items: decision };
const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } },
});
export const adiToolDefinitions = [
  tool('DesignContext', 'Read the current ADI classification, evidence, applicable rule IDs and scope.', {}),
  tool('ConventionSearch', 'Search the pinned convention registry. Use cursor for the next page.', { text: string, categories: strings, platforms: strings, componentKinds: strings, cursor: string, limit: { type: 'integer', minimum: 1, maximum: 50 } }),
  tool('ConventionRead', 'Read pinned sections for up to 12 exact rule IDs, or pass missing_required=true repeatedly until remaining is 0. The runtime records receipts.', { rule_ids: { ...strings, maxItems: 12 }, missing_required: { type: 'boolean' } }),
  tool('DesignPlan', 'Read or submit the design plan. After ConventionRead, submit complete decisions using exact DesignContext rule IDs, workspace-relative targetFiles, and non-empty acceptanceChecks. Group related rules into one decision. Cover every required ID, including a concrete check for any inapplicability claim.', { action: { type: 'string', enum: ['read', 'submit'] }, decisions }, ['action']),
  tool('DesignDecision', 'Submit additional design decisions against the same selected conventions.', { decisions }, ['decisions']),
  tool('DesignChecks', 'Read verification coverage. Use request_review to present concrete criterion observations for explicit human confirmation. Browser findings remain separate.', {
    action: { type: 'string', enum: ['read', 'request_review'] },
    checks: { type: 'array', items: { type: 'object', properties: { rule_id: string, result: { type: 'string', enum: ['pass', 'not-applicable'] }, observation: string, target_selectors: strings }, required: ['rule_id', 'result', 'observation'], additionalProperties: false } },
  }),
];
export const adiToolNames = new Set(adiToolDefinitions.map(tool => tool.function.name));
export const submitReadyDesignPlan=tool('DesignPlan','Submit the required implementation decisions now. Use the exact required rule IDs, target files and concrete acceptance checks.',{
  action:{type:'string',enum:['submit']},decisions,
},['action','decisions']);
