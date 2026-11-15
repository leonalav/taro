import {describe,expect,it} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {SessionTree} from "./session-tree";

describe("Explorer running session",()=>{
  it("uses a loading wheel in place of the status dot",()=>{
    const html=renderToStaticMarkup(<SessionTree folders={[{id:"taro",name:"taro"}]} threads={[{id:"live",name:"Fix checkout",folderId:"taro",updated:"now",messages:[]}]} activeThreadId="live" runningThreadId="live" onSelectThread={()=>{}} onTogglePin={()=>{}} onArchive={()=>{}} onNewThread={()=>{}} onSelectFolder={()=>{}} onRenameFolder={()=>{}} onDeleteFolder={()=>{}} onRenameThread={()=>{}} onMoveThread={()=>{}} onRestoreThread={()=>{}}/>);
    expect(html).toContain('aria-label="Running"');
    expect(html).toContain("animate-spin");
    expect(html).not.toContain('data-status-dot="true"');
  });
});
