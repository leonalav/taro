import {describe, expect, it, vi} from "vitest";
const mocks = vi.hoisted(() => ({invoke: vi.fn(), channel: {onmessage: undefined as undefined | ((event: unknown) => void)}}));
vi.mock("@tauri-apps/api/core", () => ({invoke:mocks.invoke, Channel: class {constructor(){return mocks.channel;}}}));
import {resolveModelEndpoint, streamModel} from "./model-stream";

describe("saved model endpoints", () => {
  it("accepts version bases and both complete protocol endpoints", () => {
    expect(resolveModelEndpoint(" https://api.test/v1/ ")).toEqual({url:"https://api.test/v1/chat/completions",protocol:"chat-completions"});
    expect(resolveModelEndpoint("https://api.test/v1/responses/").protocol).toBe("responses");
    expect(resolveModelEndpoint("http://localhost:11434").url).toBe("http://localhost:11434/v1/chat/completions");
    expect(resolveModelEndpoint("https://api.test/v1/chat/completions?api-version=1").url).toBe("https://api.test/v1/chat/completions?api-version=1");
  });
  it("rejects unsafe or invalid URL shapes without leaking them", () => {
    for(const endpoint of ["bad", "file:///secret", "https://user:secret@api.test", "https://api.test?api_key=secret", "https://api.test#secret"]){
      expect(()=>resolveModelEndpoint(endpoint)).toThrow();
      try{resolveModelEndpoint(endpoint);}catch(error){expect(String(error)).not.toContain("secret");}
    }
  });
  it("validates before invoke and rejects cancellation rather than completing a run", async () => {
    mocks.invoke.mockImplementation(async()=>{mocks.channel.onmessage?.({type:"stopped"});return [];});
    const input={requestId:"r",endpoint:"https://api.test/v1/responses",model:"gpt-test",credentialId:"custom",messages:[]};
    await expect(streamModel(input,()=>{})).rejects.toMatchObject({name:"AbortError"});
    expect(mocks.invoke).toHaveBeenCalledWith("stream_chat",expect.objectContaining({request:input}));
    mocks.invoke.mockClear();
    await expect(streamModel({...input,endpoint:"invalid"},()=>{})).rejects.toThrow();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
