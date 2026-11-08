import {describe,expect,it} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {AppSidebar} from "./app-sidebar";
import {seedFolders,seedThreads} from "@/data/mock";

describe("Explorer folder controls",()=>{
  it("shows separate open and create controls while keeping the Nike reference",()=>{
    const noop=()=>{};
    const html=renderToStaticMarkup(<AppSidebar collapsed={false} onToggle={noop} activeNav="overview" onNavChange={noop} onOpenSearch={noop} activeAgentId="planner" onAgentChange={noop} folders={seedFolders} threads={seedThreads} activeThreadId="brand" onSelectThread={noop} onTogglePin={noop} onArchive={noop} onNewThread={noop} onNewFolder={noop} onOpenFolder={noop} onSelectFolder={noop} onRenameFolder={noop} onDeleteFolder={noop} onRenameThread={noop} onMoveThread={noop} onRestoreThread={noop} user={{name:"Test",email:"test@example.com",initials:"TE"}} onOpenAccount={noop} onUpgradePlan={noop}/>);
    expect(html).toContain('aria-label="Open folder"');
    expect(html).toContain('aria-label="Create folder"');
    expect(html).toContain("Nike/Brand Discovery");
  });
});
