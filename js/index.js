import { ensureProject, saveProject } from "./storage.js";
import { listGallery } from "./db.js";

const countGrid = document.getElementById("countGrid");
const nextBtn = document.getElementById("nextBtn");
const resetBtn = document.getElementById("resetBtn");
const stateText = document.getElementById("stateText");
const galleryEl = document.getElementById("gallery");

// ---------------------
// STEP1: 枚数選択
// ---------------------
function render(project){
  [...countGrid.querySelectorAll(".cardbtn")].forEach(btn=>{
    const c = Number(btn.dataset.count);
    btn.classList.toggle("selected", project.count === c);
  });

  if(project.count){
    stateText.textContent = `選択：${project.count}枚`;
    nextBtn.disabled = false;
  }else{
    stateText.textContent = "選択：未選択";
    nextBtn.disabled = true;
  }
}

function setSelectedCount(count){
  const project = ensureProject();
  project.count = count;

  // downstream reset（安全側）
  project.layout = null;
  project.theme = null;
  project.images = [];

  saveProject(project);
  render(project);
}

// events
countGrid.addEventListener("click", (e)=>{
  const btn = e.target.closest(".cardbtn");
  if(!btn) return;
  const count = Number(btn.dataset.count);
  setSelectedCount(count);
});

nextBtn.addEventListener("click", ()=>{
  window.location.href = "edit.html";
});

resetBtn.addEventListener("click", ()=>{
  localStorage.removeItem("ba_project_v1");
  render(ensureProject());
});

// ---------------------
// Gallery: 日付でまとめて表示（折りたたみ）
// ---------------------
function pad2(n){ return String(n).padStart(2,"0"); }

function dateKey(ts){
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

function dateLabelFromKey(key){
  // YYYY-MM-DD -> MM/DD
  const [,mm,dd] = key.split("-");
  return `${mm}/${dd}`;
}

function timeLabel(ts){
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

async function renderGallery(){
  if(!galleryEl) return;

  const items = await listGallery(60); // 表示件数はお好みで
  if(items.length === 0){
    galleryEl.innerHTML = `<div class="gallery-empty">保存した画像がここに表示されます</div>`;
    return;
  }

  // 日付でグルーピング
  const groups = new Map(); // key -> items[]
  for(const it of items){
    const k = dateKey(it.createdAt);
    if(!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }

  // 新しい日付順
  const keys = [...groups.keys()].sort().reverse();

  // HTML組み立て
  const sections = [];
  for(const k of keys){
    const arr = groups.get(k);
    const label = dateLabelFromKey(k);

    const thumbs = arr.map(it=>{
      const url = URL.createObjectURL(it.thumbBlob);
      const t = timeLabel(it.createdAt);

      return `
        <div class="gitem" data-id="${it.id}" title="${k} ${t}">
          <img src="${url}" alt="thumb" />
          <div class="gtime">${t}</div>
        </div>
      `;
    }).join("");

    const todayKey = dateKey(Date.now());
    
    sections.push(`
      <details class="gsection">
        <summary class="gsummary">
          <div class="gmeta">
            <div class="gdate">${label}</div>
            <div class="gcount">${arr.length}件</div>
          </div>
          <div class="gchev">▼</div>
        </summary>
        <div class="ggrid">
          ${thumbs}
        </div>
      </details>
    `);
  }

  galleryEl.innerHTML = sections.join("");

  galleryEl.onclick = async (e)=>{
    const item = e.target.closest(".gitem");
    if(!item) return;

    const id = item.dataset.id;

    // 長押し or 右クリック想定（PC/iPad）
    if(e.ctrlKey || e.metaKey || e.shiftKey){
      if(confirm("この画像を削除しますか？")){
        const { deleteGalleryItem } = await import("./db.js");
        await deleteGalleryItem(id);
        renderGallery();
      }
      return;
    }

    // 通常タップ → 表示
    window.location.href = `gallery.html?id=${encodeURIComponent(id)}`;
  };

}
import { clearGallery } from "./db.js";

const clearBtn = document.getElementById("clearGalleryBtn");

clearBtn?.addEventListener("click", async ()=>{
  if(!confirm("保存した画像をすべて削除しますか？\nこの操作は元に戻せません。")){
    return;
  }
  await clearGallery();
  renderGallery();
});

// ---------------------
// init
// ---------------------
render(ensureProject());
renderGallery();
