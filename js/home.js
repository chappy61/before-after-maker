import { ensureProject, saveProject } from "./storage.js";
import { uploadToGallery } from "./storage.js";
import { supabase } from "./supabaseClient.js";

// 任意：画面に表示するステータス要素があるなら使う
const statusEl = document.getElementById("statusText");
const newBtn = document.getElementById("newBtn");
const dlg = document.getElementById("newDialog"); // 使ってないなら消してOK


const pickPhotos = document.getElementById("pickPhotos");
const takePhoto  = document.getElementById("takePhoto");

function setStatus(msg){
  if(statusEl) statusEl.textContent = msg;
}

function extFromFile(f){
  // mime優先で拡張子を決める（nameが空やHEIC対策の第一歩）
  const t = (f.type || "").toLowerCase();
  if (t.includes("png")) return "png";
  if (t.includes("webp")) return "webp";
  if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
  if (t.includes("heic") || t.includes("heif")) return "heic"; // 後で変換するならここでjpgへ
  return (f.name?.split(".").pop() || "jpg").toLowerCase();
}
function resetProjectForNew(){
  const p = ensureProject();

  // 新フロー用の骨だけ作る
  p.images = [];       // storage path を入れる
  p.edits  = [];       // 各画像の編集
  p.layout = null;     // 自動分割なら一旦nullでもOK（render側で入れてるなら）
  p.count  = 0;
  p.theme  = p.theme || "green";

  // labels を最低限維持（edit/composeが期待する形）
  if (!p.labels || typeof p.labels !== "object") {
    p.labels = { enabled: true, items: [] };
  }
  if (typeof p.labels.enabled !== "boolean") p.labels.enabled = true;
  if (!Array.isArray(p.labels.items)) p.labels.items = [];
  while (p.labels.items.length < 2) {
    p.labels.items.push({ x: 0.06, y: 0.06, color: "#fff" });
  }
  p.labels.items = p.labels.items.slice(0, 2);

  // ratio/title も空なら入れる（composeが使う）
  p.ratio = p.ratio || "4:5";
  p.title = p.title || "施術前後写真";

  saveProject(p);
  return p;
}

async function ingestFiles(fileList){
  const files = fileList ? [...fileList] : [];
  if(files.length === 0) return;

  const p = resetProjectForNew();
  const max = 6;
  const picked = files.slice(0, max);

  // ログイン確認
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const user = data?.user;
  if (!user) throw new Error("Not signed in");

  const projectId = crypto.randomUUID();
  p.projectId = projectId;

  p.images = [];
  try{
    for (let i = 0; i < picked.length; i++) {
      const f = picked[i];
      setStatus(`アップロード中… (${i+1}/${picked.length})`);

      const ext = extFromFile(f);
      const fileName = `${crypto.randomUUID()}.${ext}`;
      const path = `${user.id}/${projectId}/${fileName}`;

      await uploadToGallery(path, f);
      p.images.push(path);
    }

    p.edits = p.images.map(() => ({ scale: 1, rotate: 0, x: 0, y: 0 }));
    p.count = p.images.length;

    saveProject(p);
    setStatus("");
    window.location.href = "edit.html";

  } catch (e){
    console.error(e);
    setStatus("アップロードに失敗しました。通信環境を確認してもう一度試してください。");
    // 失敗時は中途半端な状態を残さない方が安定（必要ならここでp.imagesを空にしてsaveも可）
  }
}
newBtn?.addEventListener("click", async () => {
  // どっちを開くか：PC/iPadはピッカー、スマホはカメラ優先にしたいなら分岐
  // まずは安定の pickPhotos を開く（iPhoneでも撮影/ライブラリ両方出ることが多い）
  if (pickPhotos) pickPhotos.value = "";
  pickPhotos?.click();
});

pickPhotos?.addEventListener("change", (e) => {
  const input = e.currentTarget; 
  ingestFiles(input.files);
});

takePhoto?.addEventListener("change", (e) => {
  const input = e.currentTarget; 
  ingestFiles(input.files);
});