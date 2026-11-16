import type { DirectionOption } from './project-direction';
import {validateArtifactDesign,type ArtifactDesign} from './artifact-design';

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));

export function directionPreviewHtml(option: DirectionOption, image?: string, contract?:ArtifactDesign) {
  const source = image && /^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[a-z0-9+/=]+$/i.test(image) ? image : undefined;
  const media = source ? `<img src="${source}" alt="Reference for this composition">` : '<div class="study" aria-hidden="true"></div>';
  const design=contract?validateArtifactDesign(contract):undefined;
  const light=design?.themes.light,dark=design?.themes.dark;
  const theme=design&&light&&dark?`body{background:${light.canvas};color:${light.text};font-family:${design.typography.body.family}}h1{font-family:${design.typography.display.family};font-weight:${design.typography.display.weight}}.scene-led{background:${dark.surface};color:${dark.text}}summary:focus-visible{outline-color:currentColor}`:'';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(option.name)}</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f3efe7;color:#25241f;font:1rem/1.5 system-ui,sans-serif}main{max-width:85rem;margin:auto;padding:clamp(1.25rem,6vw,6rem)}.hero{display:grid;gap:clamp(1.5rem,4vw,4rem);align-items:center}h1{margin:0;max-width:14ch;font:500 clamp(3rem,9vw,8rem)/.95 ${option.typography};overflow-wrap:anywhere;text-wrap:balance}p{max-width:48ch}.art{min-width:0}.art img,.study{display:block;width:100%;min-height:13rem;max-height:55vh;object-fit:cover}.study{aspect-ratio:4/3;background:linear-gradient(155deg,#351f20,#a4503a 54%,#dbc897 55%,#978570)}summary{display:inline-flex;cursor:pointer;align-items:center;min-height:44px;border-bottom:1px solid;list-style:none}summary:focus-visible{outline:2px solid #25241f;outline-offset:4px}.split,.scene-led{grid-template-columns:minmax(0,1fr) minmax(0,1.12fr)}.scene-led{background:#272c29;color:#f3efe7;padding:clamp(1.25rem,4vw,3rem)}.image-led .art{order:-1}.image-led img,.image-led .study{aspect-ratio:12/5}.type-led .art{width:min(44%,28rem);margin-inline-start:auto}.type-led h1{max-width:20ch}@media(max-width:42rem){.hero{grid-template-columns:1fr}.type-led .art{width:75%}}
  ${theme}</style></head><body><main><div class="hero ${option.composition}"><div><h1>${escape(option.headline)}</h1><details><summary>${escape(option.action)}</summary><p>${escape(option.rationale)}</p></details></div><div class="art">${media}</div></div></main></body></html>`;
}
