import { describe, expect, it } from 'vitest';
import { classifyDesignContext, collectDesignSignals, detectFrontendImpact } from './context';
import { loadBundledRegistry } from './bundled-registry';
import { selectConventions } from './selector';
const workspace = { files: ['src/App.tsx', 'src/index.css', 'server/service.rs'], componentKinds: ['button'], platformEvidence: ['windows', 'desktop-web'], fingerprint: 'repo-1' };
const classify = (text: string, referenceIds: string[] = []) => classifyDesignContext(collectDesignSignals({ text, referenceIds }, workspace));
describe('classifying design work', () => {
  it.each(['Make this button clearer', 'Sửa giao diện trang đăng nhập', 'Edit src/index.css', 'Build this screen by yourself'])('classifies %s as frontend work', text => {
    expect(classify(text).intent).toBe('build');
  });
  it('uses references and target evidence, preserves the brand, and distinguishes discussion', () => {
    expect(classify('Like this', ['reference']).intent).toBe('design');
    expect(classify('How can I make this UI clearer?').intent).toBe('discussion');
    expect(classify('Fix database migration').intent).toBe('non-ui');
    expect(classify('Fix the button').platforms).toEqual(['windows', 'desktop-web']);
    expect(classify('Fix the button').constraints).toContain('Preserve existing project identity');
  });
  it('checks real paths even when the request looks backend-only', () => {
    expect(detectFrontendImpact({ tool: 'Edit', input: {}, canonicalPaths: ['src/index.css'], effect: 'workspace-write' }, workspace)).toBe('frontend');
    expect(detectFrontendImpact({ tool: 'Bash', input: { command: 'echo ok' }, effect: 'external-unknown' }, workspace)).toBe('unknown');
  });
  it('selects every A/AA criterion and relevant APG components', async () => {
    const registry = await loadBundledRegistry();
    const selection = selectConventions(classify('Fix the button'), registry);
    expect(selection.requiredRuleIds).toHaveLength(55);
    expect(selection.advisoryRuleIds).toContain('aria-apg:button');
    expect(selection.advisoryRuleIds).not.toContain('aria-apg:combobox');
    expect(registry.coverage().complete).toBe(false);
  });
});
