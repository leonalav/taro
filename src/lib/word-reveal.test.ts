import {afterEach,describe,it,expect,vi} from "vitest";
import {createWordReveal} from "./word-reveal";
afterEach(()=>vi.useRealTimers());
describe("word reveal",()=>{
 it("buffers split SSE chunks until a complete word arrives",()=>{
  vi.useFakeTimers();let shown="";const reveal=createWordReveal(text=>shown=text,35);
  reveal.push("Hel");vi.advanceTimersByTime(100);expect(shown).toBe("");
  reveal.push("lo world");vi.advanceTimersByTime(35);expect(shown).toBe("Hello ");reveal.stop();
 });
 it("flushes the trailing word on completion",async()=>{
  vi.useFakeTimers();let shown="";const reveal=createWordReveal(text=>shown=text,35);
  reveal.push("hello world");const done=reveal.finish();vi.advanceTimersByTime(70);await done;expect(shown).toBe("hello world");
 });
 it("stops queued words and releases a waiting completion",async()=>{
  vi.useFakeTimers();let shown="";const reveal=createWordReveal(text=>shown=text,35);
  reveal.push("one two three ");const done=reveal.finish();vi.advanceTimersByTime(35);reveal.stop();await done;vi.advanceTimersByTime(300);expect(shown).toBe("one ");
 });
});
