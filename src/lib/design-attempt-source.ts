import { artifactProjectKey } from './artifact-design';
import { browserEvidenceStorage } from './review-evidence-storage';

export interface AttemptSource {
  path: string;
  content: string;
  before?: string | null;
  sourceIdentity?: string;
}
export interface AttemptSourceDigest { path: string; digest: string; preimageDigest?: string }
export const correctionSourceKey=(revision:string)=>`${revision}:correction-source`;
const snapshotKey = (workspace:string,jobId:string,revision:string) => `design-source:${artifactProjectKey(workspace)}:${JSON.stringify([jobId,revision])}`;
const digest = async (content: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content))), byte=>byte.toString(16).padStart(2,'0')).join('');
const preimageDigest = async ({before,sourceIdentity}:AttemptSource) => before===undefined?undefined:digest(JSON.stringify([before,sourceIdentity]));

export async function storeAttemptSource(workspace:string,jobId:string,revision:string,files:AttemptSource[]):Promise<AttemptSourceDigest[]> {
  const path=snapshotKey(workspace,jobId,revision);
  const existing=await browserEvidenceStorage.read(path);
  const serialized=JSON.stringify(files);
  if(new TextEncoder().encode(serialized).length>8*1024*1024)throw Error('The edited-source snapshot exceeds 8 MiB.');
  if(existing!==null&&existing!==serialized)throw Error('This revision already has a different source snapshot.');
  if(existing===null)await browserEvidenceStorage.write(path,serialized);
  return Promise.all(files.map(async file=>({path:file.path,digest:await digest(file.content),preimageDigest:await preimageDigest(file)})));
}

export async function restoreAttemptSource(workspace:string,jobId:string,revision:string,expected:AttemptSourceDigest[]) {
  const raw=await browserEvidenceStorage.read(snapshotKey(workspace,jobId,revision));
  if(!raw)throw Error('The edited-source snapshot is unavailable.');
  const files=JSON.parse(raw) as AttemptSource[];
  if(!Array.isArray(files)||files.length!==expected.length)throw Error('The edited-source snapshot is incomplete.');
  for(const [index,file] of files.entries()) {
    if(file?.path!==expected[index].path||typeof file?.content!=='string'||await digest(file.content)!==expected[index].digest||
      (file.before!==undefined&&file.before!==null&&typeof file.before!=='string')||
      (file.sourceIdentity!==undefined&&(file.before===undefined||typeof file.sourceIdentity!=='string'))||
      await preimageDigest(file)!==expected[index].preimageDigest)throw Error('The edited-source snapshot could not be verified.');
  }
  return files;
}
