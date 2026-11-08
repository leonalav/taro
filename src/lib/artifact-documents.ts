import type { ChatMessage } from "@/data/mock";
import { SEED_DESIGN_DOC } from "@/data/design-doc";

export function artifactDocument(message?: ChatMessage): {title:string;path:string;text:string} | undefined {
  if(message?.role === "plan") return {title:message.name,path:message.path,text:message.markdown};
  if(message?.role === "tokens") return {title:"Design tokens",path:"design-tokens.md",text:SEED_DESIGN_DOC};
  if(message?.role === "activity-group") {
    const operation=message.activities.find(a=>a.foundation?.kind==="design-plan")?.foundation;
    if(operation?.kind==="design-plan"&&operation.result) return {title:operation.result.title,path:operation.result.path,text:operation.result.markdown};
  }
  return undefined;
}
