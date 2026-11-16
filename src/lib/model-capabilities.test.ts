import { describe, expect, it, vi } from 'vitest';
import { checkModelCapabilities, hasDesignCapabilities, modelCapabilityIdentity } from './model-capabilities';
import type { ToolCall } from './model-stream';

const model = { id: 'studio', endpoint: 'https://studio.example/v1', model: 'studio-vision', label: 'Studio' };
const call = (name: string, args: unknown): ToolCall => ({ id: 'tool-1', name, arguments: JSON.stringify(args) });
const probe = { image: 'data:image/png;base64,fixture', colors: ['blue', 'green', 'red', 'yellow'], receipt: 'random-receipt' };

describe('model capability checks', () => {
  it('requires the image answer, tool result replay and strict handoff on the actual configured transport', async () => {
    const stream = vi.fn().mockResolvedValueOnce([call('CheckDesignImage', { colors: probe.colors })])
      .mockResolvedValueOnce([call('CheckDesignHandoff', { receipt: probe.receipt, colors: probe.colors })]);
    const result = await checkModelCapabilities(model, stream, async () => {}, probe);
    expect(result).toMatchObject({ image: 'passed', tools: 'passed', handoff: 'passed' });
    expect(stream.mock.calls[0][0]).toMatchObject({ endpoint: model.endpoint, model: model.model, credentialId: model.id });
    expect(JSON.stringify(stream.mock.calls[0][0].messages)).toContain(probe.image);
    expect(JSON.stringify(stream.mock.calls[0][0].messages)).not.toContain(probe.receipt);
    expect(stream.mock.calls[1][0].messages.at(-1)).toEqual({ role: 'tool', tool_call_id: 'tool-1', content: probe.receipt });
    expect(hasDesignCapabilities({ ...model, designCheck: result }, true)).toBe(true);
    expect(hasDesignCapabilities({ ...model, endpoint: 'https://studio.example/v1/responses', designCheck: result }, true)).toBe(false);
    expect(modelCapabilityIdentity({ ...model, label: 'Renamed' })).toBe(result.identity);
  });

  it('rejects dropped images even when the model can replay and format a tool result', async () => {
    const colors = ['blue', 'blue', 'blue', 'blue'];
    const stream = vi.fn().mockResolvedValueOnce([call('CheckDesignImage', { colors })])
      .mockResolvedValueOnce([call('CheckDesignHandoff', { receipt: probe.receipt, colors })]);
    const result = await checkModelCapabilities(model, stream, async () => {}, probe);
    expect(result).toMatchObject({ image: 'failed', tools: 'passed', handoff: 'passed' });
    expect(hasDesignCapabilities({ ...model, designCheck: result }, true)).toBe(false);
    expect(hasDesignCapabilities({ ...model, designCheck: result }, false)).toBe(true);
  });

  it('verifies text-only tools when the configured endpoint explicitly rejects the image request',async()=>{
    const stream=vi.fn().mockRejectedValueOnce('HTTP 400: unsupported input')
      .mockResolvedValueOnce([call('CheckDesignTool',{})])
      .mockResolvedValueOnce([call('CheckTextHandoff',{receipt:probe.receipt,ready:true})]);
    const result=await checkModelCapabilities(model,stream,async()=>{},probe);
    expect(result).toMatchObject({image:'failed',tools:'passed',handoff:'passed'});
    expect(stream.mock.calls.slice(1).every(([request])=>!JSON.stringify(request.messages).includes('image_url'))).toBe(true);
    expect(hasDesignCapabilities({...model,designCheck:result},false)).toBe(true);
    expect(hasDesignCapabilities({...model,designCheck:result},true)).toBe(false);
  });

  it('rejects invented fields, multiple calls and transport failures without recording a false pass', async () => {
    const stream = vi.fn().mockResolvedValueOnce([call('CheckDesignImage', { colors: probe.colors })])
      .mockResolvedValueOnce([call('CheckDesignHandoff', { receipt: probe.receipt, colors: probe.colors, invented: true })]);
    await expect(checkModelCapabilities(model, stream, async () => {}, probe)).resolves.toMatchObject({ handoff: 'failed' });
    stream.mockResolvedValueOnce([call('CheckDesignImage', { colors: probe.colors }), call('Other', {})]);
    await expect(checkModelCapabilities(model, stream, async () => {}, probe)).resolves.toMatchObject({ image: 'unknown', tools: 'failed', handoff: 'unknown' });
    stream.mockRejectedValueOnce(new Error('provider sent confidential data'));
    const offline = await checkModelCapabilities(model, stream, async () => {}, probe);
    expect(offline).toMatchObject({ image: 'unknown', tools: 'unknown', handoff: 'unknown' });
    expect(JSON.stringify(offline)).not.toContain('confidential');
  });
});
