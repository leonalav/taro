const diagnostics = {
  shape: 'Submit the required handoff fields as a structured object.',
  style: 'The style failed validation. Start from the assigned style and send only supported changes.',
  layout: 'Check the layout rectangles and ensure each layout rule names a declared layer.',
  assets: 'Use only the asset and reference IDs assigned to this job.',
  interaction: 'Supply concrete browser checks for the declared interactions.',
  evidence: 'Use the saved preview and audit evidence for the assigned revision.',
  files: 'List every file actually changed for this candidate.',
  direction: 'Check the direction, alternatives, and project decisions against the required fields.',
  qa: 'Supply the required review outcomes and report unresolved failures.',
} as const;

export const publicDesignHandoffDiagnostics = new Set<string>(Object.values(diagnostics));

export class DesignHandoffRejection extends Error {
  readonly diagnostic:string;
  constructor(error:unknown){
    super(error instanceof Error?error.message:'The handoff could not be parsed.');
    const cause=this.message;
    this.diagnostic=/registered asset|approved for this project|unknown source|unknown reference/i.test(cause)?diagnostics.assets
      :/style|contract|typography|font|hexadecimal|spacing scale|breakpoint/i.test(cause)?diagnostics.style
      :/layout|rectangles|layer/i.test(cause)?diagnostics.layout
      :/expected state|interaction|replay/i.test(cause)?diagnostics.interaction
      :/preview|revision|audit/i.test(cause)?diagnostics.evidence
      :/files? actually changed|file changed|changed files/i.test(cause)?diagnostics.files
      :/direction|option|audience|primaryAction|approved assets|constraint|questions/i.test(cause)?diagnostics.direction
      :/qa|verdict|criterion|outcome|concern/i.test(cause)?diagnostics.qa:diagnostics.shape;
  }
}
