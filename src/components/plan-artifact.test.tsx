// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { MessageItem } from "./chat-message";
import { agentName, seedThreads } from "@/data/mock";

Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});

describe("plan artifact documents", () => {
  it("opens each plan by its own message ID using the existing document callback", async () => {
    const plans = seedThreads[0].messages.filter(message => message.role === "plan");
    expect(plans.map(message => message.kind).sort()).toEqual(["Design Plan", "Plan"]);
    const host = document.createElement("div");document.body.append(host);
    const root = createRoot(host);const open = vi.fn();
    for (const plan of plans) {
      await act(async () => root.render(<MessageItem message={plan} agentLabel={agentName} onRevert={()=>{}} onOpenDoc={open}/>));
      expect(host.textContent).toContain(plan.name);
      expect(host.textContent).toContain(plan.path);
      await act(async () => [...host.querySelectorAll("button")].find(button=>button.textContent === "Open")!.click());
      expect(open).toHaveBeenLastCalledWith(plan.id);
    }
    await act(async()=>root.unmount());host.remove();
  });
});
