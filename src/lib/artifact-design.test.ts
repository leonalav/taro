import { describe, expect, it } from 'vitest';
import { artifactCss, createArtifactDesign, createArtifactDesignRepository, validateArtifactDesign } from './artifact-design';
import { artifactTemplate } from './artifact-templates';

describe('project artifact design', () => {
  it('exports independent artifact themes and responsive roles without changing app tokens', () => {
    const editorial = createArtifactDesign('editorial');
    const product = createArtifactDesign('product');
    expect(editorial.typography.display.family).not.toBe(product.typography.display.family);
    expect(editorial.themes.light.accent).not.toBe(product.themes.light.accent);
    const css = artifactCss(editorial);
    expect(css).toContain('[data-taro-artifact]');
    expect(css).toContain('--art-space-4:16px');
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain('prefers-color-scheme:dark');
    expect(css).not.toMatch(/(?:^|})\s*:root\s*\{/);
    expect(css).not.toContain('--background:');
  });
  it('rejects malformed or injectable contracts and preserves the caller object', () => {
    const design = createArtifactDesign('editorial');
    expect(() => validateArtifactDesign({ ...design, version: 2 })).toThrow(/version/i);
    expect(() => validateArtifactDesign({ ...design, spacing: { ...design.spacing, 4: -1 } })).toThrow(/spacing/i);
    expect(() => validateArtifactDesign({ ...design, name: 'x'.repeat(201) })).toThrow();
    expect(() => validateArtifactDesign({ ...design, typography: { ...design.typography, body: { ...design.typography.body, family: 'serif;}</style><script>alert(1)</script>' } } })).toThrow();
    expect(() => validateArtifactDesign({ ...design, themes: { ...design.themes, light: { ...design.themes.light, accent: 'url(https://example.org)' } } })).toThrow();
    expect(() => artifactCss({ ...design, radius: { ...design.radius, 'x;}</style>': 1 } } as typeof design)).toThrow();
    const validated = validateArtifactDesign(design);
    validated.name = 'Changed';
    expect(design.name).not.toBe('Changed');
  });
  it('prevents lost updates across repository instances when storage provides atomic compare-and-swap',async()=>{
    let raw:string|null=null;
    const storage={read:async()=>raw,write:async(_:string,value:string)=>{raw=value;},compareAndSwap:async(_:string,expected:number,value:string)=>{const revision=raw?JSON.parse(raw).revision:0;if(revision!==expected)return false;raw=value;return true;}};
    const first=createArtifactDesignRepository(storage),second=createArtifactDesignRepository(storage);
    const outcomes=await Promise.allSettled([first.save('/concurrent',createArtifactDesign('editorial'),0),second.save('/concurrent',createArtifactDesign('product'),0)]);
    expect(outcomes.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    expect(outcomes.filter(result=>result.status==='rejected')).toHaveLength(1);
    expect((await first.read('/concurrent'))?.revision).toBe(1);
  });
  it('shares saved style across chats in a workspace, survives reload and rejects stale writers', async () => {
    const saved = new Map<string, string>();
    const storage = { read: async (key: string) => saved.get(key) ?? null, write: async (key: string, value: string) => { saved.set(key, value); } };
    const repository = createArtifactDesignRepository(storage);
    const design = createArtifactDesign('expressive');
    const first = await repository.save('A:\\Brand\\', design, 0);
    expect(first.revision).toBe(1);
    const loaded = await createArtifactDesignRepository(storage).read('a:/brand');
    expect(loaded?.design.name).toBe(design.name);
    expect(await repository.read('a:/other')).toBeNull();
    const outcomes = await Promise.allSettled([repository.save('a:/brand', { ...design, name: 'One' }, 1), repository.save('A:/Brand/', { ...design, name: 'Two' }, 1)]);
    expect(outcomes.filter(value => value.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find(value => value.status === 'rejected')).toMatchObject({ reason: expect.objectContaining({ message: expect.stringMatching(/conflict/i) }) });
    await expect(repository.save('', design, 0)).rejects.toThrow(/workspace/i);
  });
  it('does not replace saved memory when persistence fails or existing data is corrupt', async () => {
    let raw: string | null = null, fail = false;
    const repository = createArtifactDesignRepository({ read: async () => raw, write: async (_, value) => { if (fail) throw Error('Disk full'); raw = value; } });
    await repository.save('/project', createArtifactDesign('product'), 0);
    fail = true;
    await expect(repository.save('/project', createArtifactDesign('editorial'), 1)).rejects.toThrow('Disk full');
    expect((await repository.read('/project'))?.design.direction).toBe('product');
    raw = '{broken';
    await expect(repository.save('/project', createArtifactDesign('product'), 0)).rejects.toThrow(/saved|corrupt/i);
    expect(raw).toBe('{broken');
  });
  it('generates six semantic, token-driven structures with escaped content and stable layer IDs', () => {
    for (const kind of ['hero', 'dashboard', 'gallery', 'form', 'pricing', 'mobile'] as const) {
      const html = artifactTemplate(createArtifactDesign('editorial'), kind, '<script>bad()</script>');
      expect(html).toContain('data-taro-artifact');
      expect(html).toContain('data-taro-layer="main"');
      expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;');
      expect(html).not.toContain('<script>bad()');
      expect(html).toContain('name="viewport"');
      expect(html).toContain('<main');
    }
  });
});
