import {describe,expect,it} from "vitest";
import {githubImportTarget,recentReceptionProjects} from "./reception-projects";
describe("reception projects",()=>{
  it("shows only saved active work, ordered by last activity",()=>{
    const messages=[{id:"u",role:"user" as const,segments:[]}];
    const projects=recentReceptionProjects([{id:"a",name:"A"}],[{id:"older",folderId:"a",name:"Older",updated:"2d",messages},{id:"latest",folderId:"a",name:"Latest",updated:"now",messages},{id:"empty",folderId:"a",name:"New thread",updated:"now",messages:[]},{id:"archived",folderId:"a",name:"Archived",updated:"now",archived:true,messages},{id:"missing",folderId:"missing",name:"Missing workspace",updated:"now",messages}]);
    expect(projects.map(project=>project.id)).toEqual(["latest","older"]);
  });
  it("accepts exact HTTPS GitHub repositories and rejects injected or unsafe targets",()=>{
    expect(githubImportTarget("https://github.com/owner/repo.git")).toEqual({url:"https://github.com/owner/repo.git",name:"repo"});
    for(const url of ["file:///tmp/repo","https://github.com.evil.test/owner/repo","https://token@github.com/owner/repo","https://github.com/owner/repo?command=bad","https://github.com/owner/--option","https://github.com/owner/repo/tree/main"]){expect(()=>githubImportTarget(url)).toThrow();}
  });
});
