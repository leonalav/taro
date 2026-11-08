/** Local usage only: IDs, times and counters; never prompts or source bodies. */
export const USAGE_METRICS_STORAGE_KEY = "taro.ai-usage.v1";
const MAX_EVENTS = 2000;
const RETAIN_DAYS = 400;
type StorageAdapter = Pick<Storage, "getItem" | "setItem">;
interface UsageEvent { eventId: string; workspaceId: string; timestamp: number; messages: number; linesAdded: number }
export interface UsageDay { date: string; messages: number; linesAdded: number }
export interface UsageSnapshot { totalMessages: number; totalLinesAdded: number; days: readonly UsageDay[] }
interface Ledger extends UsageSnapshot { version: 1; events: UsageEvent[] }
export interface AiMessageEvent { eventId: string; workspaceId: string; timestamp?: number }
export interface AiCodeChangeEvent extends AiMessageEvent { toolName: string; result: unknown }

const emptyLedger = (): Ledger => ({ version: 1, totalMessages: 0, totalLinesAdded: 0, days: [], events: [] });
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const counter = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const identifier = (value: unknown, max = 512): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function readLedger(raw: string | null): Ledger {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!object(value) || value.version !== 1 || !counter(value.totalMessages) || !counter(value.totalLinesAdded) || !Array.isArray(value.events) || !Array.isArray(value.days)) return emptyLedger();
    if (value.events.length > MAX_EVENTS || value.days.length > RETAIN_DAYS) return emptyLedger();
    if (!value.events.every(e => object(e) && identifier(e.eventId, 256) && identifier(e.workspaceId) && typeof e.timestamp === "number" && Number.isFinite(e.timestamp) && counter(e.messages) && counter(e.linesAdded))) return emptyLedger();
    if (!value.days.every(d => object(d) && typeof d.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && counter(d.messages) && counter(d.linesAdded))) return emptyLedger();
    if (new Set(value.days.map(d => d.date)).size !== value.days.length) return emptyLedger();
    return value as unknown as Ledger;
  } catch { return emptyLedger(); }
}

function lines(content: string): string[] {
  if (!content) return [];
  const result = content.replace(/\r\n/g, "\n").split("\n");
  if (result[result.length - 1] === "") result.pop();
  return result;
}

/** Exact line additions (replacements count as additions), ignoring newline encoding.
 * Extremely costly diffs are skipped rather than guessed or blocking the chat UI. */
export function countAddedLines(before: string, after: string): number | null {
  const a = lines(before), b = lines(after);
  let start = 0, endA = a.length, endB = b.length;
  while (start < endA && start < endB && a[start] === b[start]) start++;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const n = endA - start, m = endB - start;
  if (!n || !m) return m;
  const oldLines = new Set(a.slice(start, endA));
  if (!b.slice(start, endB).some(line => oldLines.has(line))) return m;
  // Myers' shortest edit path: additions = (edit distance + new length - old length) / 2.
  const frontier = new Map<number, number>([[1, 0]]);
  let work = 0;
  for (let d = 0; d <= n + m; d++) {
    for (let k = -d; k <= d; k += 2) {
      if (++work > 4_000_000) return null;
      const left = frontier.get(k - 1) ?? -Infinity, right = frontier.get(k + 1) ?? -Infinity;
      let x = k === -d || (k !== d && left < right) ? right : left + 1;
      let y = x - k;
      while (x < n && y < m && a[start + x] === b[start + y]) { x++; y++; }
      frontier.set(k, x);
      if (x >= n && y >= m) return (d + m - n) / 2;
    }
  }
  return null;
}

function notebookCode(source: string): string | null {
  try {
    const notebook: unknown = JSON.parse(source);
    if (!object(notebook) || !Array.isArray(notebook.cells)) return null;
    const code: string[] = [];
    for (const cell of notebook.cells) {
      if (!object(cell) || cell.cell_type !== "code") continue;
      if (typeof cell.source === "string") code.push(cell.source);
      else if (Array.isArray(cell.source) && cell.source.every(line => typeof line === "string")) code.push(cell.source.join(""));
      else return null;
    }
    return code.map(cell => lines(cell).join("\n")).filter(Boolean).join("\n");
  } catch { return null; }
}

function additionsFromTool(toolName: string, result: unknown): number | null {
  if (!["Write", "Edit", "NotebookEdit"].includes(toolName) || !object(result) || result.isError === true || !object(result.artifact)) return null;
  const artifact = result.artifact;
  if (artifact.status === "failed" || typeof artifact.before !== "string" || typeof artifact.after !== "string") return null;
  if (toolName === "NotebookEdit") {
    if (artifact.kind !== "notebook") return null;
    const before = notebookCode(artifact.before), after = notebookCode(artifact.after);
    return before === null || after === null ? null : countAddedLines(before, after);
  }
  return artifact.kind === "edit" ? countAddedLines(artifact.before, artifact.after) : null;
}

/** Keeps lifetime rollups, 400 local daily buckets and the last 2,000 event IDs.
 * Replays deduplicate within that bounded recent ledger. Use stable run/tool IDs. */
export function createUsageMetricsStore(storage?: StorageAdapter, now = Date.now) {
  let lastRaw: string | null | undefined;
  let ledger = emptyLedger();
  let snapshot: UsageSnapshot = ledger;
  const listeners = new Set<() => void>();
  const reload = () => {
    try {
      const raw = storage?.getItem(USAGE_METRICS_STORAGE_KEY) ?? null;
      if (raw !== lastRaw) { lastRaw = raw; ledger = readLedger(raw); snapshot = ledger; }
    } catch { /* Keep the in-memory ledger when local storage is unavailable. */ }
  };
  reload();
  const notify = () => listeners.forEach(listener => listener());
  const record = (input: AiMessageEvent, messages: number, linesAdded: number) => {
    const timestamp = input.timestamp ?? now();
    if (!identifier(input.eventId, 256) || !identifier(input.workspaceId) || !Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime()) || timestamp > now() + 60_000) return false;
    reload();
    if (ledger.events.some(e => e.eventId === input.eventId && e.workspaceId === input.workspaceId)) return false;
    const event = { eventId: input.eventId, workspaceId: input.workspaceId, timestamp, messages, linesAdded };
    const end = new Date(now()), cutoff = new Date(end);
    cutoff.setDate(cutoff.getDate() - RETAIN_DAYS + 1);
    const first = dateKey(cutoff), last = dateKey(end), date = dateKey(new Date(timestamp));
    const days = ledger.days.filter(day => day.date >= first && day.date <= last).map(day => ({ ...day }));
    if (date >= first && date <= last) {
      const day = days.find(day => day.date === date);
      if (day) { day.messages += messages; day.linesAdded += linesAdded; }
      else days.push({ date, messages, linesAdded });
    }
    ledger = { version: 1, totalMessages: ledger.totalMessages + messages, totalLinesAdded: ledger.totalLinesAdded + linesAdded, days: days.sort((a, b) => a.date.localeCompare(b.date)), events: [...ledger.events, event].slice(-MAX_EVENTS) };
    snapshot = ledger;
    try { const raw = JSON.stringify(ledger); storage?.setItem(USAGE_METRICS_STORAGE_KEY, raw); lastRaw = storage ? raw : null; } catch { /* Counts still update for this app session. */ }
    notify();
    return true;
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      const onStorage = (event: StorageEvent) => { if (event.key === USAGE_METRICS_STORAGE_KEY || event.key === null) { reload(); notify(); } };
      if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
      // A change may have arrived before the first statistics subscriber mounted.
      reload();
      return () => { listeners.delete(listener); if (typeof window !== "undefined") window.removeEventListener("storage", onStorage); };
    },
    recordAiMessage: (input: AiMessageEvent) => record(input, 1, 0),
    recordAiCodeChange(input: AiCodeChangeEvent) {
      const count = additionsFromTool(input.toolName, input.result);
      return count !== null && count > 0 ? record(input, 0, count) : false;
    },
  };
}

export function summarizeUsage(snapshot: UsageSnapshot, end = new Date()) {
  const month = dateKey(end).slice(0, 7), byDate = new Map(snapshot.days.map(day => [day.date, day]));
  const messagesTrend: number[] = [];
  for (let i = 27; i >= 0; i--) {
    const date = new Date(end); date.setDate(date.getDate() - i);
    messagesTrend.push(byDate.get(dateKey(date))?.messages ?? 0);
  }
  const monthDays = snapshot.days.filter(day => day.date.startsWith(month) && day.date <= dateKey(end));
  return { messagesTrend, messagesThisMonth: monthDays.reduce((total, day) => total + day.messages, 0), linesAddedThisMonth: monthDays.reduce((total, day) => total + day.linesAdded, 0) };
}

let browserStorage: StorageAdapter | undefined;
try { if (typeof window !== "undefined") browserStorage = window.localStorage; } catch { /* Private/browser storage may be disabled. */ }
const usageMetrics = createUsageMetricsStore(browserStorage);
export const recordAiMessage = usageMetrics.recordAiMessage;
export const recordAiCodeChange = usageMetrics.recordAiCodeChange;
export const subscribeUsageMetrics = usageMetrics.subscribe;
export const getUsageMetricsSnapshot = usageMetrics.getSnapshot;
