import { ensureProject, saveProject } from "./storage.js";
import { themeToColor } from "./theme.js";
import { makeGridTemplate } from "./layout.js";
import { readFileAsDataURL, shrinkDataURL } from "./image.js";
import { composePNG } from "./compose.js";

const photoGrid = document.getElementById("photoGrid");
const frame = document.getElementById("frame");
const summary = document.getElementById("summary");
const fileInput = document.getElementById("fileInput");

const backBtn = document.getElementById("backBtn");
const clearBtn = document.getElementById("clearBtn");
const recolorBtn = document.getElementById("recolorBtn");

const titleInput = document.getElementById("titleInput");
const ratioSelect = document.getElementById("ratioSelect");

const makePreviewBtn = document.getElementById("makePreviewBtn");
const downloadBtn = document.getElementById("downloadBtn");
const previewBox = document.getElementById("previewBox");
const previewImg = document.getElementById("previewImg");
const previewNote = document.getElementById("previewNote");

let activeIndex = 0;

function normalizeProject(){
  const p = ensureProject();
  if(!p.count) p.count = 2;
  if(!p.layout) p.layout = "vertical";
  if(!p.theme) p.theme = "green";
  if(!Array.isArray(p.images)) p.images = [];
  return p;
}

function ensureImagesSize(p, total){
  if(p.images.length !== total){
    p.images = new Array(total).fill(null).map((_,i)=> p.images[i] || null);
  }
}

function render(){
  const p = normalizeProject();

  // theme
  frame.style.setProperty("--framebg", themeToColor(p.theme));

  // grid template
  const { cols, rows } = makeGridTemplate(p.count, p.layout);
  const total = cols * rows;

  photoGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  photoGrid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

  ensureImagesSize(p, total);
  saveProject(p);

  summary.textContent = `${p.count}枚 / ${p.layout==="vertical" ? "左右" : "上下"} / ${p.theme}`;

  // draw cells
  photoGrid.innerHTML = "";
  for(let i=0;i<total;i++){
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.index = String(i);

    const dataUrl = p.images[i];
    if(dataUrl){
      const img = document.createElement("img");
      img.src = dataUrl;
      img.alt = `img${i}`;
      cell.appendChild(img);
    }else{
      const plus = document.createElement("div");
      plus.className = "plus";
      plus.textContent = "+ 写真を選択";
      cell.appendChild(plus);
    }

    // chips only for 2 images
    if(total === 2){
      const chip = document.createElement("div");
      chip.className = "chip" + (i===1 ? " after" : "");
      chip.textContent = i===0 ? "before" : "after";
      cell.appendChild(chip);
    }

    photoGrid.appendChild(cell);
  }

  const allSet = p.images.every(v => typeof v === "string" && v.startsWith("data:image/"));
  makePreviewBtn.disabled = !allSet;

  if(!allSet){
    downloadBtn.style.display = "none";
    previewBox.style.display = "none";
    previewNote.textContent = "写真を全部入れたら「プレビュー生成」を押してください。";
  }
}

photoGrid.addEventListener("click", (e)=>{
  const cell = e.target.closest(".cell");
  if(!cell) return;
  activeIndex = Number(cell.dataset.index);
  fileInput.value = "";
  fileInput.click();
});

fileInput.addEventListener("change", async ()=>{
  const file = fileInput.files && fileInput.files[0];
  if(!file) return;

  try{
    const raw = await readFileAsDataURL(file);
    const shrunk = await shrinkDataURL(raw, 2048, 0.9);

    const p = normalizeProject();
    p.images[activeIndex] = shrunk;
    saveProject(p);
    render();
  }catch{
    alert("画像の読み込みに失敗しました。別の画像で試してください。");
  }
});

clearBtn.addEventListener("click", ()=>{
  const p = normalizeProject();
  p.images = p.images.map(()=>null);
  saveProject(p);
  render();
});

recolorBtn.addEventListener("click", ()=> window.location.href = "step3.html");
backBtn.addEventListener("click", ()=> window.location.href = "step3.html");

makePreviewBtn.addEventListener("click", async ()=>{
  const p = normalizeProject();

  // STEP5で使う値を保存
  p.title = titleInput.value || "施術前後写真";
  p.ratio = ratioSelect.value || "4:5";
  saveProject(p);

  // STEP5へ
  window.location.href = "step5.html";
});


render();
