import { ensureProject } from "./storage.js";
import { composePNG } from "./compose.js";
import { getGalleryItem, addToGallery } from "./db.js";
import { dataURLToBlob, makeThumbBlobFromDataURL } from "./blobutil.js";

const finalImg = document.getElementById("finalImg");
const saveBtn = document.getElementById("saveBtn");
const saveInAppBtn = document.getElementById("saveInAppBtn");
const backBtn = document.getElementById("backBtn");
const status = document.getElementById("status");

let latestDataURL = null;

function getQueryId(){
  const sp = new URLSearchParams(location.search);
  return sp.get("id");
}

backBtn.addEventListener("click", ()=>{
  // ギャラリーから開いてたらSTEP1、作成フローならSTEP4へ戻す
  const id = getQueryId();
  window.location.href = id ? "step1.html" : "step4.html";
});

const toListBtn = document.getElementById("toListBtn");

toListBtn?.addEventListener("click", ()=>{
  window.location.href = "step1.html";
});

saveInAppBtn?.addEventListener("click", async ()=>{
  const p = ensureProject();
  if(!latestDataURL) return;

  saveInAppBtn.disabled = true;
  try{
    const fullBlob = dataURLToBlob(latestDataURL);
    const thumbBlob = await makeThumbBlobFromDataURL(latestDataURL, 360);

    await addToGallery({
      fullBlob,
      thumbBlob,
      meta: {
        title: p.title || "施術前後写真",
        ratio: p.ratio || "4:5",
        count: p.count,
        layout: p.layout,
        theme: p.theme
      }
    });

    status.textContent = "アプリ内に保存しました。STEP1の一覧に表示されます。";
  }catch{
    status.textContent = "保存に失敗しました（容量不足の可能性）。";
  }finally{
    saveInAppBtn.disabled = false;
  }
});

async function showFromGallery(id){
  status.textContent = "読み込み中…";

  const item = await getGalleryItem(id);
  if(!item){
    status.textContent = "画像が見つかりませんでした。";
    return;
  }

  // Blob -> objectURL で表示＆ダウンロード
  const url = URL.createObjectURL(item.fullBlob);

  finalImg.src = url;
  latestDataURL = null; // gallery表示時はdataURLではない

  saveBtn.href = url;
  saveBtn.style.display = "inline-flex";

  // ギャラリー閲覧のときは「アプリ内に保存」は不要
  if(saveInAppBtn) saveInAppBtn.style.display = "none";

  const title = item.meta?.title ? `「${item.meta.title}」` : "";
  status.textContent = `保存済みの画像${title}を表示しています。`;
}

async function showFromProject(){
  const p = ensureProject();
  p.title = p.title || "施術前後写真";
  p.ratio = p.ratio || "4:5";

  if(!p.images || p.images.some(v => !v)){
    status.textContent = "写真が足りません。戻って追加してください。";
    return;
  }

  status.textContent = "生成中…";
  try{
    const url = await composePNG(p, { title: p.title, ratio: p.ratio });
    latestDataURL = url;

    finalImg.src = url;

    saveBtn.href = url;
    saveBtn.style.display = "inline-flex";

    if(saveInAppBtn) saveInAppBtn.style.display = "inline-flex";

    status.textContent = "問題なければ保存してください。";
  }catch{
    status.textContent = "生成に失敗しました。画像が大きい可能性があります。";
  }
}

async function boot(){
  const id = getQueryId();
  if(id){
    await showFromGallery(id);
  }else{
    await showFromProject();
  }
}

boot();
