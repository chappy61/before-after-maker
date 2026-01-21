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

async function shareOrOpenBlob(blob, filename="before-after.png"){
  // 共有できるなら共有シートを出す（iOSだと「画像を保存」「ファイルに保存」等に繋がる）
  try{
    if(navigator.share){
      const file = new File([blob], filename, { type: blob.type || "image/png" });
      await navigator.share({ files: [file], title: "Before/After" });
      return true;
    }
  }catch{
    // shareキャンセル/失敗はここに来る（無視してフォールバック）
  }

  // フォールバック：新規タブで開いて、ユーザーが共有→保存
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  return false;
}

// 端末保存（実際は「共有で保存」を優先）
saveBtn?.addEventListener("click", async (e)=>{
  e.preventDefault();

  // 生成直後（projectから生成）: dataURL → blob
  if(latestDataURL){
    const blob = dataURLToBlob(latestDataURL);
    await shareOrOpenBlob(blob);
    return;
  }

  // ギャラリー表示中: href(Blob URL) から取り出して共有…は取りにくいので
  // showFromGallery 側で item.fullBlob を使って onclick を上書きする（下で入れる）
});

function getQueryId(){
  const sp = new URLSearchParams(location.search);
  return sp.get("id");
}

backBtn.addEventListener("click", ()=>{
  // ギャラリーから開いてたらSTEP1、作成フローならSTEP4へ戻す
  const id = getQueryId();
  window.location.href = id ? "index.html" : "step4.html";
});

const toListBtn = document.getElementById("toListBtn");

toListBtn?.addEventListener("click", ()=>{
  window.location.href = "index.html";
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
    // ギャラリー閲覧時も「共有で保存」を使う
  saveBtn.onclick = async (e)=>{
    e.preventDefault();
    await shareOrOpenBlob(item.fullBlob);
  };


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

const p = ensureProject();
if(p.allowDeviceSave === false){
  saveBtn.style.display = "none";
}

boot();
