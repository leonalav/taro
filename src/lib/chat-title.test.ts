import {describe,expect,it,vi} from "vitest";
import {canApplyAiTitle,generateChatTitle,parseChatTitle} from "./chat-title";

describe("AI chat titles",()=>{
  it("extracts a concise sentence-case title from the model's JSON",()=>{
    expect(parseChatTitle('```json\n{"title":"Fix login button on mobile"}\n```')).toBe("Fix login button on mobile");
    expect(parseChatTitle("Improve responsive checkout layout")).toBe("Improve responsive checkout layout");
    expect(parseChatTitle('{"title":""}')).toBeNull();
    expect(parseChatTitle("not JSON")).toBeNull();
  });
  it("uses a separate tool-free model request",async()=>{
    const stream=vi.fn(async(_input:unknown,onDelta:(text:string)=>void)=>{onDelta('{"title":"Build checkout flow"}');return [];});
    const title=await generateChatTitle({id:"model",label:"custom",endpoint:"https://example.com/v1"},"Build the checkout flow","title-1",stream);
    expect(title).toBe("Build checkout flow");
    expect(stream).toHaveBeenCalledWith(expect.objectContaining({requestId:"title-1",tools:undefined,messages:expect.arrayContaining([expect.objectContaining({role:"user",content:"Build the checkout flow"})])}),expect.any(Function));
  });
  it("does not replace a manual name or a newer fallback",()=>{
    expect(canApplyAiTitle({titleSource:"fallback",name:"Build checkout"},"Build checkout")).toBe(true);
    expect(canApplyAiTitle({titleSource:"manual",name:"My project"},"Build checkout")).toBe(false);
    expect(canApplyAiTitle({titleSource:"fallback",name:"Different task"},"Build checkout")).toBe(false);
  });
});
