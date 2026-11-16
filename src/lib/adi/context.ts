import type { DesignContext } from './types';
import type { ProjectDirection } from '../project-direction';

export interface RunRequest {
  text: string;
  referenceIds: string[];
  reviewItem?: unknown;
  explicitScope?: 'frontend' | 'non-ui' | 'discussion';
  projectDirection?: ProjectDirection;
}
export interface WorkspaceDesignSnapshot {
  files: string[];
  componentKinds: string[];
  artifactDesign?: unknown;
  platformEvidence: string[];
  fingerprint: string;
}
export interface DesignSignals { request: RunRequest; workspace: WorkspaceDesignSnapshot }
export interface MutationDescriptor {
  tool: string;
  input: Record<string, unknown>;
  canonicalPaths?: string[];
  effect: 'read' | 'run-metadata' | 'project-design' | 'workspace-write' | 'external-unknown';
}
const uiPath = /\.(?:css|scss|sass|less|styl|html?|tsx|jsx|vue|svelte|astro|swiftui|xaml|svg|woff2?|ttf|otf|webp|png|jpe?g|avif|gif|ico|glb|gltf|hdr|exr|dds|ktx2|mp4|webm)$/i;
const uiDirectory = /(?:^|\/)(?:components?|views?|pages?|screens?|layouts?|styles?|themes?|public|assets|taro-assets|templates|locales|frontend|client)(?:\/|$)/i;
const backendDirectory = /(?:^|\/)(?:server|backend|migrations?|api|workers?|database|db|src-tauri)(?:\/|$)/i;
const configPath = /(?:^|\/)(?:vite\.config\.|next\.config\.|tailwind\.config\.|webpack\.config\.|package\.json$|pnpm-lock\.yaml$|tauri\.conf\.json$)/i;
const componentKinds = ['accordion', 'alert', 'button', 'checkbox', 'combobox', 'dialog-modal', 'disclosure', 'grid', 'link', 'listbox', 'menu-button', 'radio', 'slider', 'switch', 'table', 'tabs', 'toolbar', 'tooltip', 'treeview'];
const unique = (items: string[]) => [...new Set(items)];

export const collectDesignSignals = (request: RunRequest, workspace: WorkspaceDesignSnapshot): DesignSignals => ({ request, workspace });

export function detectFrontendImpact(change: MutationDescriptor, snapshot: WorkspaceDesignSnapshot): 'frontend' | 'non-ui' | 'unknown' {
  if (change.effect === 'read' || change.effect === 'run-metadata') return 'non-ui';
  if (change.effect === 'project-design') return 'frontend';
  if (change.effect === 'external-unknown') return 'unknown';
  const paths = (change.canonicalPaths ?? [change.input.file_path, change.input.notebook_path].filter((value): value is string => typeof value === 'string'))
    .map(path => path.replace(/\\/g, '/'));
  if (!paths.length) return 'unknown';
  if (paths.some(path => uiPath.test(path) || uiDirectory.test(path) || configPath.test(path))) return 'frontend';
  if (paths.every(path => backendDirectory.test(path) || /\.(?:rs|go|sql|md|txt|toml)$/i.test(path))) return 'non-ui';
  const projectHasUi = snapshot.files.some(path => uiPath.test(path) || uiDirectory.test(path));
  return projectHasUi ? 'unknown' : 'non-ui';
}

export function classifyDesignContext({ request, workspace }: DesignSignals, proposal?: unknown): DesignContext {
  const text = request.text.trim();
  const folded = text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd');
  const discussion = /^(?:how\b|why\b|what\b|explain\b|compare\b|describe\b|review\b|audit\b|inspect\b|tai sao\b|giai thich\b)/i.test(folded);
  const visual = /\b(?:frontend|html preview|web ?site|ui|interface|screen|button|dashboard|component|layout|typography|design system|color palette|contrast|responsive|giao dien|nut bam|trang dang nhap|trang web|bo cuc)\b/i.test(folded) ||
    /\.(?:css|scss|tsx|jsx|html|vue|svelte)\b/i.test(text);
  const building = /\b(?:build|implement|create|redesign|revamp|make|fix|edit|change|update|improve|sua|tao|xay dung|chinh|thiet ke)\b/i.test(folded);
  const backend = /\b(?:backend|database|migration|server|api|schema|worker|co so du lieu|may chu)\b/i.test(folded);
  const brandChange = /\b(?:rebrand|replace (?:the )?brand|new visual identity)\b/i.test(folded);
  const requestedPlatforms = [
    /\b(?:macos|mac os)\b/i.test(text) ? 'macos' : '',
    /\bwindows\b/i.test(text) ? 'windows' : '',
    /\b(?:ios|iphone|ipad)\b/i.test(text) ? 'ios' : '',
    /\bandroid\b/i.test(text) ? 'android' : '',
    /\b(?:web|website|browser|html preview)\b/i.test(text) ? 'web' : '',
  ].filter(Boolean);
  const suggested = proposal && typeof proposal === 'object' && 'intent' in proposal ? proposal.intent : undefined;
  const intent = request.reviewItem ? 'review-fix'
    : request.explicitScope === 'discussion' || (discussion && request.explicitScope !== 'frontend') ? 'discussion'
    : request.explicitScope === 'frontend' || visual && building ? 'build'
    : visual || request.referenceIds.length || suggested === 'design' ? 'design'
    : backend || request.explicitScope === 'non-ui' ? 'non-ui'
    : 'discussion';
  const kinds = unique([...workspace.componentKinds, ...componentKinds.filter(kind => new RegExp('\\b' + kind + '\\b', 'i').test(text))]);
  const platforms = requestedPlatforms.length ? requestedPlatforms : workspace.platformEvidence.length ? workspace.platformEvidence : ['web'];
  const direction=request.projectDirection;
  return {
    intent, platforms, audience: direction?[direction.audience]:[], primaryActions: direction?[direction.primaryAction]:[], aesthetic: direction?[direction.selectedDirection]:[],
    constraints: unique([...(brandChange?[]:['Preserve existing project identity']),...direction?.constraints??[]]),
    inputMethods: platforms.includes('ios') || platforms.includes('android') ? ['touch', 'assistive-technology'] : ['keyboard', 'pointer', 'assistive-technology'],
    domain: [], surfaces: kinds, referenceIds: [...request.referenceIds],
    evidence: unique([...workspace.files.filter(path => uiPath.test(path)).slice(0, 20), ...request.referenceIds]),
    uncertainty: [...(!requestedPlatforms.length && !workspace.platformEvidence.length ? ['Target platform inferred as web.'] : []),
      ...(!visual && !backend && !discussion && !request.reviewItem ? ['Request does not identify the affected surface.'] : [])],
    fingerprint: JSON.stringify([workspace.fingerprint, intent, platforms, kinds, request.referenceIds, direction?.selectedDirection]),
  };
}
