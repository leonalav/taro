import {describe,expect,it} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {ExplorerPanel} from "./explorer-panel";
import {EmptyReviewCanvas} from "./review-canvas";

describe("workspace panels",()=>{
  it("shows a folder prompt instead of the canned project when no workspace is selected",()=>{
    const html=renderToStaticMarkup(<ExplorerPanel root={undefined} folderName="New folder" maximized={false} onToggleMaximize={()=>{}} onClose={()=>{}} onChooseFolder={()=>{}}/>);
    expect(html).toContain("Choose a folder");
    expect(html).not.toContain("index.css");
  });
  it("shows an empty review for chats with no built screen",()=>{
    const html=renderToStaticMarkup(<EmptyReviewCanvas/>);
    expect(html).toContain("Nothing has appeared yet");
    expect(html).not.toContain("Nike");
  });
});
