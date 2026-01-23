import { listGallery, clearGallery, deleteGalleryItem } from "./db.js";

const galleryEl = document.getElementById("gallery");
const clearBtn = document.getElementById("clearGalleryBtn");

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

  const items = await listGallery(60);
  if(items.length === 0){
    galleryEl.innerHTML = `<div class="gallery-empty">保存した画像がここに表示されます</div>`;
    return;
  }

  // 日付でグルーピング
  const groups = new Map();
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

    // Ctrl/⌘/Shift で削除（PC/iPadキーボード想定）
    if(e.ctrlKey || e.metaKey || e.shiftKey){
      if(confirm("この画像を削除しますか？")){
        await deleteGalleryItem(id);
        renderGallery();
      }
      return;
    }

    // 通常タップ → 表示
    window.location.href = `gallery.html?id=${encodeURIComponent(id)}`;
  };
}

// 一括削除
clearBtn?.addEventListener("click", async ()=>{
  if(!confirm("保存した画像をすべて削除しますか？\nこの操作は元に戻せません。")){
    return;
  }
  await clearGallery();
  renderGallery();
});

// init
renderGallery();
