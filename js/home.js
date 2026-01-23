import { ensureProject, saveProject } from "./storage.js";
import { readFileAsDataURL, shrinkDataURL } from "./image.js";

const dlg = document.getElementById("newDialog");
const newBtn = document.getElementById("newBtn");
const closeDialog = document.getElementById("closeDialog");

const pickPhotos = document.getElementById("pickPhotos");
const takePhoto  = document.getElementById("takePhoto");

newBtn?.addEventListener("click", () => dlg?.showModal());
closeDialog?.addEventListener("click", () => dlg?.close());

// project初期化（新規作成）
function resetProjectForNew(){
  const p = ensureProject();

  // 新フロー用の骨だけ作る
  p.images = [];       // ここにDataURL入れる（最大6）
  p.edits  = [];       // 各画像の編集（scale/rotate/x/y）を後で入れる
  p.layout = null;     // ここで“自動分割”にするので一旦null
  p.count  = 0;        // 選んだ枚数
  p.theme  = p.theme || "green"; // 既存があれば残してOK

  saveProject(p);
  return p;
}

// files → projectへ格納（最大6）
async function ingestFiles(fileList){
  const files = fileList ? [...fileList] : [];
  if(files.length === 0) return;

  const p = resetProjectForNew();
  const max = 6;

  // 6枚までに制限
  const picked = files.slice(0, max);

  // 画像をDataURLで保存（後でBlob保存にもできる）
  p.images = [];
  for(const f of picked){
    const raw = await readFileAsDataURL(f);
    const shrunk = await shrinkDataURL(raw, 2048, 0.9);
    p.images.push(shrunk);
  }

  p.edits = p.images.map(() => ({ scale: 1, rotate: 0, x: 0, y: 0 }));

  p.count = p.images.length;

  saveProject(p);

  dlg?.close();


  window.location.href = "edit.html";
}

pickPhotos?.addEventListener("change", (e)=> ingestFiles(e.target.files));
takePhoto?.addEventListener("change",  (e)=> ingestFiles(e.target.files));
