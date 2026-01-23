import { ensureProject, saveProject } from "./storage.js";
import { composePNG } from "./compose.js";
import { addToGallery } from "./db.js";

const backBtn = document.getElementById("backBtn");
const toGalleryBtn = document.getElementById("toGalleryBtn");

const previewBox = document.getElementById("previewBox");
const previewImg = document.getElementById("previewImg");
const statusText = document.getElementById("statusText");

const labelOverlay = document.getElementById("labelOverlay");
const saveBtn = document.getElementById("saveBtn");
const downloadBtn = document.getElementById("downloadBtn");

let currentDataUrl = null;
let currentBlob = null;

// ---- UIを消したので固定値 ----
const FIXED_RATIO = "4:5";
const FIXED_LABEL_COLOR = "white";

// ---------------------
// state normalize
// ---------------------
function normalize() {
  const p = ensureProject();
  if (!p.layout) p.layout = "split_lr";
  if (!Array.isArray(p.images)) p.images = [];
  if (!Array.isArray(p.edits)) p.edits = [];
  if (!p.labels) p.labels = { enabled: true, color: FIXED_LABEL_COLOR, offsetX: 0, offsetY: 0 };

  // 2枚前提
  if (p.images.length < 2) {
    alert("画像が不足しています（2枚必要）");
    window.location.href = "index.html";
    return null;
  }

  // UIなしなので固定
  p.labels.enabled = true;
  p.labels.color = FIXED_LABEL_COLOR;

  saveProject(p);
  return p;
}

async function dataURLToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return await res.blob();
}

// ---------------------
// render (debounced)
// ---------------------
let timer = null;
function requestRender() {
  clearTimeout(timer);
  timer = setTimeout(renderPreview, 120);
}

async function renderPreview() {
  const p = normalize();
  if (!p) return;

  statusText.textContent = "プレビュー生成中…";
  saveBtn.disabled = true;

  const labels = {
    enabled: true,
    color: p.labels.color || FIXED_LABEL_COLOR,
    offsetX: Number(p.labels.offsetX || 0),
    offsetY: Number(p.labels.offsetY || 0),
    alpha: 0.70,
  };

  try {
    const dataUrl = await composePNG(p, {
      ratio: FIXED_RATIO,
      title: "施術前後写真",
      labels,
    });

    currentDataUrl = dataUrl;
    previewImg.src = dataUrl;

    currentBlob = await dataURLToBlob(dataUrl);

    downloadBtn.href = dataUrl;
    downloadBtn.classList.remove("hidden");

    saveBtn.disabled = false;
    statusText.textContent = "OK：保存できます";
  } catch (err) {
    console.error(err);
    statusText.textContent = "プレビュー生成に失敗しました";
  }
}

// ---------------------
// label overlay: position reflect
// ---------------------
function applyOverlayPosition() {
  const p = normalize();
  if (!p) return;

  const ox = Number(p.labels.offsetX || 0);
  const oy = Number(p.labels.offsetY || 0);

  const before = labelOverlay?.querySelector('.chip[data-kind="before"]');
  const after = labelOverlay?.querySelector('.chip[data-kind="after"]');

  // 初期ベース位置（px）
  const pad = 18;
  const top = 18;

  // layoutで「afterの基準位置」を変える
  if (p.layout === "split_tb") {
    // 上下：afterは下の画像側に置く
    // overlayはプレビュー画像全体なので、下半分に寄せる
    if (before) setPos(before, pad + ox, top + oy);
    if (after) setPos(after, pad + ox, top + oy + 300); // だいたい下へ（CSSで調整してもOK）
  } else {
    // 左右：before左上 / after右上
    if (before) setPos(before, pad + ox, top + oy);
    if (after) setPos(after, null, top + oy, pad - ox); // right基準
  }
}

function setPos(el, left, top, right) {
  if (left == null) el.style.left = "";
  else el.style.left = `${left}px`;
  if (right == null) el.style.right = "";
  else el.style.right = `${right}px`;
  el.style.top = `${top}px`;
}

// ---------------------
// Drag label (single pointer)
// ---------------------
let drag = null;

labelOverlay?.addEventListener("pointerdown", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;

  const p = normalize();
  if (!p) return;

  e.preventDefault?.();
  chip.setPointerCapture(e.pointerId);

  drag = {
    id: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    baseX: Number(p.labels.offsetX || 0),
    baseY: Number(p.labels.offsetY || 0),
  };
});

labelOverlay?.addEventListener("pointermove", (e) => {
  if (!drag || drag.id !== e.pointerId) return;

  const p = normalize();
  if (!p) return;

  const dx = e.clientX - drag.startX;
  const dy = e.clientY - drag.startY;

  // 同じoffsetで2つ同時に動かす方式
  p.labels.offsetX = Math.round(drag.baseX + dx);
  p.labels.offsetY = Math.round(drag.baseY + dy);

  saveProject(p);
  applyOverlayPosition();
  requestRender();
});

function endDrag(e) {
  if (!drag || drag.id !== e.pointerId) return;
  drag = null;
}

labelOverlay?.addEventListener("pointerup", endDrag);
labelOverlay?.addEventListener("pointercancel", endDrag);

// ---------------------
// Save (gallery)
// ---------------------
saveBtn?.addEventListener("click", async () => {
  const p = normalize();
  if (!p) return;

  if (!currentBlob) {
    alert("プレビューがまだ生成されていません");
    return;
  }

  saveBtn.disabled = true;
  statusText.textContent = "保存中…";

  try {
    const fullBlob = currentBlob;
    const thumbBlob = currentBlob;

    await addToGallery({
      fullBlob,
      thumbBlob,
      meta: {
        createdAt: Date.now(),
        layout: p.layout,
        ratio: FIXED_RATIO,
        labels: { ...p.labels },
      },
    });

    statusText.textContent = "保存しました！ギャラリーへ移動します";
    window.location.href = "gallery.html";
  } catch (err) {
    console.error(err);
    statusText.textContent = "保存に失敗しました";
    saveBtn.disabled = false;
  }
});

// nav
backBtn?.addEventListener("click", () => history.back());
toGalleryBtn?.addEventListener("click", () => (window.location.href = "gallery.html"));

// init
normalize();
applyOverlayPosition();
renderPreview();
