import type { ReviewStorage } from './review-store';

type SmallStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
/** Keep existing small sessions compatible; move reports/quota failures to IndexedDB. */
export function createReviewEvidenceStorage(small:SmallStorage,large:ReviewStorage):ReviewStorage {
  return {
    async read(key){return await large.read(key)??small.getItem(`taro-review-v1:${key}`);},
    async write(key,value){
      const localKey=`taro-review-v1:${key}`;
      if(!value.includes('"audits":')&&await large.read(key)===null){
        try{small.setItem(localKey,value);return;}catch{/* screenshot/source payload exceeded localStorage quota */}
      }
      await large.write(key,value);
      // Only remove the old copy after the replacement transaction commits.
      try{small.removeItem(localKey);}catch{/* the committed IndexedDB copy remains authoritative */}
    },
  };
}

let database:Promise<IDBDatabase>|undefined;
function evidenceDatabase():Promise<IDBDatabase> {
  return database??=(new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('taro-review-evidence-v1',1);
    request.onupgradeneeded=()=>{request.result.createObjectStore('sessions');};
    request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();database=undefined;};resolve(db);};
    request.onerror=()=>reject(request.error??Error('Could not open browser evidence storage.'));
    request.onblocked=()=>reject(Error('Close other Taro tabs to upgrade browser evidence storage.'));
  })).catch(error=>{database=undefined;throw error;});
}
export const browserEvidenceStorage:ReviewStorage={
  async read(key){
    const db=await evidenceDatabase();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction('sessions','readonly'),request=transaction.objectStore('sessions').get(key);
      transaction.oncomplete=()=>resolve(request.result??null);
      transaction.onerror=transaction.onabort=()=>reject(transaction.error??Error('Could not read saved browser evidence.'));
    });
  },
  async write(key,value){
    const db=await evidenceDatabase();
    return new Promise<void>((resolve,reject)=>{
      const transaction=db.transaction('sessions','readwrite');transaction.objectStore('sessions').put(value,key);
      transaction.oncomplete=()=>resolve();
      transaction.onerror=transaction.onabort=()=>reject(transaction.error??Error('Could not save browser evidence. Free disk space and retry.'));
    });
  },
};
