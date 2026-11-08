// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ThoughtLine from "./thought-line";

vi.mock("motion/react",()=>({useReducedMotion:()=>false,animate:()=>Object.assign(Promise.resolve(),{stop:vi.fn()})}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
beforeEach(()=>vi.useFakeTimers());
afterEach(()=>{vi.useRealTimers();document.body.innerHTML="";});

describe("ThoughtLine clocks and trace",()=>{
  it("freezes on settle, collapses, reopens, and restarts for a new run",async()=>{
    const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const settled=vi.fn();
    const render=(working:boolean)=>root.render(<ThoughtLine working={working} steps={["Read a file","Prepare response"]} onSettle={settled}/>);
    await act(async()=>render(true));
    await act(async()=>vi.advanceTimersByTime(1200));
    expect(host.querySelector(".thought-line-timer")?.textContent).toBe("1.2s");
    await act(async()=>render(false));
    expect(settled).toHaveBeenCalledExactlyOnceWith(1.2);
    expect(host.querySelector("button")?.getAttribute("aria-expanded")).toBe("false");
    await act(async()=>vi.advanceTimersByTime(1000));
    expect(host.querySelector(".thought-line-timer")?.textContent).toBe("1.2s");
    await act(async()=>host.querySelector("button")!.click());
    expect(host.querySelector("button")?.getAttribute("aria-expanded")).toBe("true");
    await act(async()=>render(true));
    expect(host.querySelector(".thought-line-timer")?.textContent).toBe("0.0s");
    await act(async()=>root.unmount());expect(vi.getTimerCount()).toBe(0);
  });
  it("uses controlled elapsed without a local clock and settles only on a transition",async()=>{
    const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const settled=vi.fn();
    await act(async()=>root.render(<ThoughtLine working={false} elapsed={3.4} onSettle={settled}/>));
    expect(host.querySelector(".thought-line-timer")?.textContent).toBe("3.4s");
    expect(settled).not.toHaveBeenCalled();
    await act(async()=>root.render(<ThoughtLine working elapsed={8.2} onSettle={settled}/>));
    expect(vi.getTimerCount()).toBe(0);
    await act(async()=>vi.advanceTimersByTime(3000));
    expect(host.querySelector(".thought-line-timer")?.textContent).toBe("8.2s");
    await act(async()=>root.render(<ThoughtLine working={false} elapsed={8.7} onSettle={settled}/>));
    expect(settled).toHaveBeenCalledExactlyOnceWith(8.7);
    await act(async()=>root.unmount());
  });
  it("auto-settles and reports the final elapsed time once",async()=>{
    const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const settled=vi.fn();
    await act(async()=>root.render(<ThoughtLine settleAfter={1} onSettle={settled}/>));
    await act(async()=>vi.advanceTimersByTime(1000));
    expect(host.querySelector("[data-thought-line]")?.hasAttribute("data-working")).toBe(false);
    expect(settled).toHaveBeenCalledExactlyOnceWith(1);
    await act(async()=>vi.advanceTimersByTime(1000));expect(settled).toHaveBeenCalledTimes(1);
    await act(async()=>root.unmount());
  });
});
