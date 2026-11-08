/** Turns arbitrary SSE text chunks into paced, complete word updates. */
export function createWordReveal(onText: (text: string) => void, intervalMs = 35) {
  let pending = "";
  let shown = "";
  const queue: string[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;
  let complete: (() => void) | undefined;

  const tick = () => {
    const word = queue.shift();
    if (word !== undefined) { shown += word; onText(shown); }
    if (!queue.length && timer) {
      clearInterval(timer);
      timer = undefined;
      complete?.();
      complete = undefined;
    }
  };
  const start = () => { if (!timer && queue.length) timer = setInterval(tick, intervalMs); };
  return {
    push(chunk: string) {
      pending += chunk;
      let match: RegExpMatchArray | null;
      while ((match = pending.match(/^[\s\S]*?\s+/))) {
        queue.push(match[0]);
        pending = pending.slice(match[0].length);
      }
      start();
    },
    finish(): Promise<void> {
      if (pending) { queue.push(pending); pending = ""; }
      if (!queue.length) return Promise.resolve();
      start();
      return new Promise(resolve => { complete = resolve; });
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      queue.length = 0;
      pending = "";
      complete?.();
      complete = undefined;
    },
    shown: () => shown,
  };
}
