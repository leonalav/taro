// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { defaultSettings } from '@/data/settings';
import { taskRepository } from '@/lib/task-persistence';
import { createTask } from '@/lib/task-store';
import { TasksBoard } from './tasks-board';

it('renders Markdown in task summaries, descriptions and solution steps', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const workspace = 'markdown-test';
  const task = {
    ...createTask('Revenue dashboard', 'markdown-card'),
    description: 'Show **net revenue**.',
    details: '**Verification**\n\n- Check *mobile*\n- Check `contrast`',
    solution: ['1. Compare **reported** and *net* revenue.'],
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await taskRepository.add(workspace, task);
    await act(async () => root.render(<TasksBoard workspaceId={workspace} settings={defaultSettings} onClose={() => {}} />));
    const card = [...host.querySelectorAll('button')].find(button => button.querySelector('h4')?.textContent === task.title);
    expect(card?.querySelector('strong')?.textContent).toBe('net revenue');
    await act(async () => card!.click());
    expect(host.querySelector('.task-markdown ul em')?.textContent).toBe('mobile');
    expect(host.querySelector('.task-markdown ul code')?.textContent).toBe('contrast');
    expect(host.querySelector('ol .task-markdown strong')?.textContent).toBe('reported');
    expect(host.querySelector('ol .task-markdown em')?.textContent).toBe('net');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
