// Persistence adapter. Swap this module for an HTTP/backend adapter later.
const DB_NAME="terraseed-chunks-v1", STORE="chunks";
export class ChunkStore {
  constructor(){this.dbPromise=null;}
  async db(){
    if(!("indexedDB" in globalThis)) return null;
    if(!this.dbPromise)this.dbPromise=new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,1);
      req.onupgradeneeded=()=>req.result.createObjectStore(STORE,{keyPath:"key"});
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    }).catch(()=>null);
    return this.dbPromise;
  }
  async get(key){
    const db=await this.db();if(!db)return null;
    return new Promise(resolve=>{const tx=db.transaction(STORE,"readonly"),r=tx.objectStore(STORE).get(key);r.onsuccess=()=>resolve(r.result?.blob||null);r.onerror=()=>resolve(null);});
  }
  async put(key,blob){
    const db=await this.db();if(!db)return;
    return new Promise(resolve=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put({key,blob,updated:Date.now()});tx.oncomplete=()=>resolve();tx.onerror=()=>resolve();});
  }
  async clearSeed(seedPrefix){
    const db=await this.db();if(!db)return;
    return new Promise(resolve=>{const tx=db.transaction(STORE,"readwrite"),store=tx.objectStore(STORE),req=store.openCursor();req.onsuccess=()=>{const c=req.result;if(c){if(String(c.key).startsWith(seedPrefix))c.delete();c.continue();}};tx.oncomplete=()=>resolve();tx.onerror=()=>resolve();});
  }
}
