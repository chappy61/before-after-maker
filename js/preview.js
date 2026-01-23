import { ensureProject, saveProject } from "./storage.js";
import { composePNG } from "./compose.js";
import { addToGallery } from "./db.js";

const backBtn = document.getElementById("backBtn");
const toGalleryBtn = document.getElementById("toGalleryBtn");

const previewImg = document.getElementById("previewImg");
const statusText = document.getElementById("statusText");

const labelOn = document.getElementById("labelOn");
const ratioSelect = document.getElementById("ratioSelect");

const xRange = document.getElementById("xRange");
const yRange = document.getElementById("yRange");
const xReset = document.getElementById("xReset");
const yReset = document.getElementById("yReset");

const saveBtn = document.getElementById("saveBtn");
const downloadBtn = document.getElementById("downloadBtn");

let currentDataUrl = null;
let currentBlob = null;

function normalize(){
  const p = ensureProject();
  if(!p.layout) p.layout = "split_lr";
  if(!Array.isArray(p.images)) p.images = [];
  if(!Array.isArray(p.edits)) p.edits = [];
  if(!p.labels) p.labels = { enabled:true, color:"white", offsetX:0, offsetY:0 };

  // 2枚前提（理想形が2分割）
  if(p.images.length < 2){
    alert("画像が不足しています（2枚必要）");
    window.location.href = "index.html";
    return null;
  }

  // UIに反映
  labelOn.checked = !!p.labels.enabled;
  xRange.value = String(p.labels.offsetX || 0);
  yRange.value = String(p.labels.offsetY || 0);

  // 色ボタン反映
  setColorUI(p.labels.color || "white");

  saveProject(p);
  return p;
}

function setColorUI(color){
  document.querySelectorAll(".segbtn").forEach(btn=>{
    btn.classList.toggle("selected", btn.dataset.color === color);
  });
}

async function dataURLToBlob(dataUrl){
  const res = await fetch(dataUrl);
  return await res.blob();
}

// プレビュー生成（軽くデバウンス）
let timer = null;
function requestRender(){
  clearTimeout(timer);
  timer = setTimeout(renderPreview, 120);
}

async function renderPreview(){
  const p = normalize();
  if(!p) return;

  statusText.textContent = "プレビュー生成中…";
  saveBtn.disabled = true;

  
  const labels = {
    enabled: labelOn.checked,
    color: p.labels.color || "white",
    offsetX: Number(xRange.value),
    offsetY: Number(yRange.value),
    alpha: 0.70,
  };

  try{
    const dataUrl = await composePNG(p, {
      ratio: ratioSelect.value,
      title: "施術前後写真", // いったん固定。後で入力欄にする
      labels
    });

    currentDataUrl = dataUrl;
    previewImg.src = dataUrl;

    currentBlob = await dataURLToBlob(dataUrl);

    // 端末保存リンク
    downloadBtn.href = dataUrl;
    downloadBtn.style.display = "inline-flex";

    saveBtn.disabled = false;
    statusText.textContent = "OK：保存できます";
  }catch(err){
    console.error(err);
    statusText.textContent = "プレビュー生成に失敗しました";
  }
}

// 色変更
document.addEventListener("click", (e)=>{
  const btn = e.target.closest(".segbtn");
  if(!btn) return;
  const p = normalize();
  if(!p) return;

  p.labels.color = btn.dataset.color;
  saveProject(p);
  setColorUI(p.labels.color);
  requestRender();
});

// UIイベント
labelOn.addEventListener("change", ()=>{
  const p = normalize();
  if(!p) return;
  p.labels.enabled = labelOn.checked;
  saveProject(p);
  requestRender();
});

ratioSelect.addEventListener("change", requestRender);

xRange.addEventListener("input", ()=>{
  const p = normalize();
  if(!p) return;
  p.labels.offsetX = Number(xRange.value);
  saveProject(p);
  requestRender();
});

yRange.addEventListener("input", ()=>{
  const p = normalize();
  if(!p) return;
  p.labels.offsetY = Number(yRange.value);
  saveProject(p);
  requestRender();
});

xReset.addEventListener("click", ()=>{
  xRange.value = "0";
  const p = normalize();
  if(!p) return;
  p.labels.offsetX = 0;
  saveProject(p);
  requestRender();
});

yReset.addEventListener("click", ()=>{
  yRange.value = "0";
  const p = normalize();
  if(!p) return;
  p.labels.offsetY = 0;
  saveProject(p);
  requestRender();
});

// 保存（アプリ内）
saveBtn.addEventListener("click", async ()=>{
  const p = normalize();
  if(!p) return;
  if(!currentBlob){
    alert("プレビューがまだ生成されていません");
    return;
  }

  saveBtn.disabled = true;
  statusText.textContent = "保存中…";

  try{
    // サムネ：そのままでもOK。軽くしたいなら canvasで縮小する（後で）
    const fullBlob = currentBlob;
    const thumbBlob = currentBlob; // いったん同じで通す（後で最適化）

    await addToGallery({
      fullBlob,
      thumbBlob,
      meta: {
        createdAt: Date.now(),
        layout: p.layout,
        ratio: ratioSelect.value,
        labels: { ...p.labels },
      }
    });

    statusText.textContent = "保存しました！ギャラリーへ移動します";
    window.location.href = "gallery.html";
  }catch(err){
    console.error(err);
    statusText.textContent = "保存に失敗しました";
    saveBtn.disabled = false;
  }
});

// ナビ
backBtn.addEventListener("click", ()=> history.back());
toGalleryBtn.addEventListener("click", ()=> window.location.href = "gallery.html");

// init
normalize();
renderPreview();
