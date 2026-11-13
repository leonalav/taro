export type Specialist = 'Designer' | 'Code' | 'Type & QA' | 'Orchestrator';

export const roleKey = (value: string) => value.toLowerCase().replace(/ agent$/, '').replace(/[^a-z]/g, '');

export function workflowIntent(brief: string) {
  const text = brief.trim();
  const firstSentence = text.split(/[.!?\n]/, 1)[0].replace(/^(?:(?:could|can|would|will) you\s+|i (?:want|need) you to\s+|we need to\s+|let['’]s\s+|help me\s+)?(?:please\s+)?/i, '');
  const discussion = /^(?:["'“‘>]|\x60|(?:how|why|what|when|which|where|explain|describe|compare|summari[sz]e|tell me|show me how|for example)\b)/i.test(firstSentence);
  const proposalOnly = /^(?:plan|outline|review|audit|inspect|evaluate|analyze|(?:write|draft|create|make) (?:me )?(?:an? )?(?:design (?:for|proposal|spec|plan)|plan|mockup|wireframe))\b/i.test(firstSentence);
  const solo = /\b(?:without|avoid|skip|no|don['’]t use|do not use)\s+(?:any\s+)?(?:sub[ -]?agents?|agents|delegation|the design (?:job|relay)|other agents)\b|\b(?:work|do it)\s+(?:alone|yourself|solo)\b|\bonly one agent\b|\b(?:don['’]t|do not)\s+(?:delegate\b(?!\s+to\b)|(?:spawn|launch|dispatch|ask)\s+(?:any\s+)?(?:sub[ -]?)?agents?\b)/i.test(text);
  const interfaceWork = /\b(?:landing page|web ?site|dashboard|user interface|ui|mobile app|layout|wireframe|mockup|prototype|(?:login|sign-in|pricing|home|settings|checkout|onboarding) (?:page|screen|flow))\b/i.test(text);
  const visual = interfaceWork || /\b(?:design (?:system|tokens?)|visual design|typography|color palette)\b/i.test(text);
  const proposalRequested=proposalOnly||/\b(?:plan only|design only|review only|just a plan|without (?:coding|implementing)|(?:do not|don['']t) (?:build|create|implement|edit|redesign))\b/i.test(text);
  const designBuild = interfaceWork && !proposalRequested && /^(?:design and |use (?:the )?(?:agents|sub[ -]?agents) to )?(?:build|implement|create|redesign|revamp|rebuild|make)\b/i.test(firstSentence);
  const designDraft = visual && /^(?:design|sketch|mock up)\b/i.test(firstSentence) && !designBuild;
  const delegation = /^(?:delegate|hand off|ask|have|use|launch|spawn|dispatch|assign)\b[^.!?\n]{0,75}\b(?:sub[ -]?agents?|(?:designer|code|qa|orchestrator) agents?|the designer|type & qa)\b/i.test(firstSentence);
  const specialist = /\b(?:qa agent|type & qa)\b/i.test(text) ? 'Type & QA'
    : /\b(?:code agent)\b/i.test(text) ? 'Code'
    : /\b(?:designer agent|the designer)\b/i.test(text) ? 'Designer'
    : /\borchestrator agent\b/i.test(text) ? 'Orchestrator' : undefined;
  const inPlace = /\b(?:without|no|skip|don['’]t use|do not use)\s+(?:a\s+|any\s+)?(?:git\s+)?worktrees?\b/i.test(text);
  const references = /\b(?:as (?:discussed|above|before|agreed)|we (?:discussed|agreed|planned)|from (?:the )?(?:previous|earlier) (?:message|plan|draft)|same (?:design|layout|brief)|(?:use|invoke|apply|load|follow)\b[^.!?\n]{0,50}\bskills?\b)\b|(?:^|\s)\/[a-z0-9_.-]+\b/i.test(text);
  const askBeforeDelegating = /\b(?:ask me first|ask(?: me)? before (?:delegat|spawn|launch|us)|ask(?: me)? whether to use|(?:confirm|check) with me before (?:delegat|us|launch))/i.test(text);
  return { discussion, solo, visual, designBuild, designDraft, delegation, specialist: specialist as Specialist | undefined, inPlace, references, askBeforeDelegating, proposalRequested };
}

export function specialistPlaybook(role: string | undefined) {
  switch (roleKey(role ?? '')) {
    case 'designer':
      return 'Define the audience, main action, information hierarchy and responsive layout. Inspect existing components and consume ArtifactDesign. Map decisions to semantic color, typography, spacing and motion tokens. Hand Code named layers, states, keyboard behavior and measurable acceptance criteria.';
    case 'typeqa':
      return 'Independently verify the actual result. Use BrowserInspect for measured geometry and computed styles, BrowserViewport for mobile/tablet/desktop, and BrowserAudit for saved evidence. Pin actionable findings to selectors. Distinguish measured results from manual judgment.';
    case 'code':
      return 'Read the approved plan, existing components and design contract. Reuse project tokens and export scoped CSS where needed. Implement responsive states, preserve layer IDs, render the actual code and hand QA the preview and revision IDs, changed files, and checklist.';
    default:
      return 'Own the outcome and coordinate specialists. Use DesignJob for a complete visual build, Agent for bounded independent work, and TaskOutput to collect asynchronous results. Use EnterPlanMode for a plan that needs approval and TaskTakeover to recover an owned child handoff. Finish only after reconciling the actual outputs and verification.';
  }
}
