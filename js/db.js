const DB_NAME = "before-after-maker-db";
const DB_VERSION = 1;
const STORE = "gallery";

function openDB(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains(STORE)){
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addToGallery({ fullBlob, thumbBlob, meta }){
  const db = await openDB();
  const id = crypto.randomUUID();

  const record = {
    id,
    createdAt: Date.now(),
    fullBlob,
    thumbBlob,
    meta: meta || {}
  };

  return new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
  });
}

export async function listGallery(limit=30){
  const db = await openDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const idx = store.index("createdAt");
    const req = idx.openCursor(null, "prev"); // 新しい順
    const out = [];
    req.onsuccess = () => {
      const cur = req.result;
      if(cur && out.length < limit){
        out.push(cur.value);
        cur.continue();
      }else{
        resolve(out);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getGalleryItem(id){
  const db = await openDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteGalleryItem(id){
  const db = await openDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearGallery(){
  const db = await openDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
