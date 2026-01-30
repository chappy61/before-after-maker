// js/edit.js (cover unified, cleaned + commented)
// ------------------------------------------------------------
// - Split view (LR/TB)
// - Active pane selection
// - Drag / pinch zoom / rotate (pointer events)
// - Label overlay per pane (position drag), color toggle (W/B)
// - Save: export PNG + save to gallery + share/download
// ------------------------------------------------------------

import { addToGallery } from "./db.js";
import { ensureProject, saveProject } from "./storage.js";
import { composePNG } from "./compose.js";
import { requireAuthOrRedirect } from "./passcodeAuth.js";
import { resolveImageSrc } from "./storage.js";

// ============================================================
// DOM
// ============================================================
const split = document.getElementById("split");
const toggleLayoutBtn = document.getElementById("toggleLayoutBtn");
const backBtn = document.getElementById("backBtn");
const resetBtn = document.getElementById("resetBtn");

const scaleRange = document.getElementById("scaleRange");
const rotateRange = document.getElementById("rotateRange");

const colorToggle = document.getElementById("colorToggle");
const saveBtn = document.getElementById("saveBtn");

const resetOneBtn = document.getElementById("resetOneBtn");
const targetBar = document.getElementById("targetBar");

// ============================================================
// State
// ============================================================
let activeIndex = 0;

// pointer gesture
const pointers = new Map(); // pointerId -> {x,y}
let gesture = null; // {type:'drag'|'pinch', ...}

// ============================================================
// Utils
// ============================================================
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
function clamp01(v) {
  return clamp(v, 0, 1);
}
function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
function angle(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}
function center(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function dataURLToBlob(dataUrl) {
  const [head, body] = dataUrl.split(",");
  const mime = head.match(/:(.*?);/)?.[1] || "image/png";
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function saveToDevice(blob, filename) {
  // 1) Web Share (mobile)
  try {
    const file = new File([blob], filename, { type: blob.type || "image/png" });
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title: "BeforeAfter", text: "export" });
      return true;
    }
  } catch {}

  // 2) Download fallback
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {}

  return false;
}

// ============================================================
// Project normalize (schema guard)
// ============================================================
function normalize() {
  const p = ensureProject();

  if (!Array.isArray(p.images)) p.images = [];
  if (!Array.isArray(p.edits)) p.edits = [];
  if (!p.layout) p.layout = "split_lr";

  // edits length align
  while (p.edits.length < p.images.length) p.edits.push({ x: 0, y: 0, scale: 1, rotate: 0 });
  p.edits = p.edits.slice(0, p.images.length);

  // labels
  if (!p.labels) p.labels = {};
  if (!Array.isArray(p.labels.items)) {
    p.labels.items = [
      { x: 0.06, y: 0.06, color: "#fff" },
      { x: 0.06, y: 0.06, color: "#fff" },
    ];
  } else {
    while (p.labels.items.length < 2) p.labels.items.push({ x: 0.06, y: 0.06, color: "#fff" });
    p.labels.items = p.labels.items.slice(0, 2);
    p.labels.items = p.labels.items.map((it) => ({
      x: typeof it.x === "number" ? clamp01(it.x) : 0.06,
      y: typeof it.y === "number" ? clamp01(it.y) : 0.06,
      color: it.color === "#000" || it.color === "black" ? "#000" : "#fff",
    }));
  }
  if (typeof p.labels.enabled !== "boolean") p.labels.enabled = true;

  saveProject(p);
  return p;
}

function labelText(p, i) {
  if (p.images.length === 2) return i === 0 ? "before" : "after";
  return `#${i + 1}`;
}

function applyTransform(img, ed) {
  const pane = img.parentElement;
  if (!pane) return;

  const paneW = pane.clientWidth || 1;
  const paneH = pane.clientHeight || 1;

  const iw = img.naturalWidth || 1;
  const ih = img.naturalHeight || 1;

  // cover倍率
  const baseCover = Math.max(paneW / iw, paneH / ih);

  // ユーザー倍率（1=初期）
  const userScale = typeof ed.scale === "number" ? ed.scale : 1;

  // cover*ユーザー倍率で実サイズ
  const drawW = iw * baseCover * userScale;
  const drawH = ih * baseCover * userScale;

  img.style.width = `${drawW}px`;
  img.style.height = `${drawH}px`;

  const tx = ed.x || 0;
  const ty = ed.y || 0;
  const rot = ed.rotate || 0;

  // translate → rotate の順に固定（compose側と体感が揃う）
  img.style.transform =
    `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) rotate(${rot}deg)`;
}


// ============================================================
// Label badge style + drag (position per pane)
// ============================================================
function applyBadgeStyle(badge, pane, label) {
  const w = pane.clientWidth || 1;
  const h = pane.clientHeight || 1;
  badge.style.left = `${Math.round(label.x * w)}px`;
  badge.style.top = `${Math.round(label.y * h)}px`;
  badge.style.color = label.color || "#fff";
  badge.style.pointerEvents = "auto";
  badge.style.touchAction = "none";
  badge.style.cursor = "grab";
}

function installBadgeDrag(badge, pane, i) {
  let start = null;

  badge.addEventListener("pointerdown", (e) => {
    e.preventDefault?.();
    badge.setPointerCapture(e.pointerId);

    const p = normalize();
    const label = p.labels.items[i];

    start = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: label.x,
      baseY: label.y,
      paneW: pane.clientWidth || 1,
      paneH: pane.clientHeight || 1,
    };
  });

  badge.addEventListener("pointermove", (e) => {
    if (!start || start.id !== e.pointerId) return;

    const dx = e.clientX - start.startX;
    const dy = e.clientY - start.startY;

    const p = normalize();
    const label = p.labels.items[i];

    label.x = clamp01(start.baseX + dx / start.paneW);
    label.y = clamp01(start.baseY + dy / start.paneH);

    saveProject(p);
    applyBadgeStyle(badge, pane, label);
  });

  function end(e) {
    if (!start || start.id !== e.pointerId) return;
    start = null;
  }

  badge.addEventListener("pointerup", end);
  badge.addEventListener("pointercancel", end);
}

// ============================================================
// Active highlight
// ============================================================
function highlightActive() {
  split?.querySelectorAll(".pane").forEach((p) => {
    p.classList.toggle("active", Number(p.dataset.index) === activeIndex);
  });

  targetBar?.querySelectorAll(".tbtn").forEach((btn) => {
    btn.classList.toggle("selected", Number(btn.dataset.target) === activeIndex);
  });
}

// ============================================================
// Sync UI
// ============================================================
function getCurrentLabelColor(p) {
  const c = p.labels?.items?.[0]?.color;
  return c === "#000" || c === "black" ? "#000" : "#fff";
}

function syncColorToggleUI() {
  if (!colorToggle) return;
  const p = normalize();
  const c = getCurrentLabelColor(p);
  colorToggle.classList.toggle("black", c === "#000");
}

function syncSlidersToActive() {
  const p = normalize();
  const ed = p.edits?.[activeIndex];
  if (!ed) return;
  if (scaleRange) scaleRange.value = String(ed.scale ?? 1);
  if (rotateRange) rotateRange.value = String(ed.rotate ?? 0);
}

// ============================================================
// Render
// ============================================================
async function render() {
  const p = normalize();
  const n = p.images.length;

  if (n === 0) {
    window.location.href = "index.html";
    return;
  }

  // layout class
  split.className = "split " + (p.layout || "split_lr");

  // icon update
  if (toggleLayoutBtn) {
    toggleLayoutBtn.innerHTML = `<span class="icon ${p.layout === "split_lr" ? "split-lr" : "split-tb"}"></span>`;
  }

  split.innerHTML = "";

  const use = Math.min(2, n);

  for (let i = 0; i < use; i++) {
    const pane = document.createElement("div");
    pane.className = "pane";
    pane.dataset.index = String(i);

    const img = document.createElement("img");
    img.crossOrigin = "anonymous"; // ★canvas書き出し保険
    img.alt = `img${i}`;
    pane.appendChild(img);

// ★dataURL or storage path をどっちでも表示できる
img.src = await resolveImageSrc(p.images[i], 60 * 10);


    // badge
    if (p.labels?.enabled) {
      const badge = document.createElement("div");
      badge.className = "badge";
      badge.textContent = labelText(p, i);
      pane.appendChild(badge);

      applyBadgeStyle(badge, pane, p.labels.items[i]);
      installBadgeDrag(badge, pane, i);
    }

    split.appendChild(pane);

    try { await img.decode?.(); } catch {}

    // pane / image size
    const paneW = pane.clientWidth || 1;
    const paneH = pane.clientHeight || 1;
    const iw = img.naturalWidth || 1;
    const ih = img.naturalHeight || 1;

    // ✅ 保存用：編集時のpaneサイズ（x/y換算に必要）
    const ed = p.edits[i] || (p.edits[i] = { x: 0, y: 0, scale: 1, rotate: 0 });

    ed.baseW = paneW;
    ed.baseH = paneH;

    // ✅ cover基準fit（ここが統一ポイント）
    const baseCover = Math.max(paneW / iw, paneH / ih);

    if (!ed._fitInited) {
    ed.scale = 1;
    ed.rotate = 0;
    ed.x = 0;
    ed.y = 0;
    ed._fitInited = true;
    saveProject(p);
  }
  applyTransform(img, ed);

  }

  highlightActive();
  syncColorToggleUI();
  syncSlidersToActive();
}

// ============================================================
// Update one pane image
// ============================================================
function updateOne(i) {
  const p = normalize();
  const pane = split.querySelector(`.pane[data-index="${i}"]`);
  const img = pane?.querySelector("img");
  if (img && p.edits[i]) applyTransform(img, p.edits[i]);
}

// ============================================================
// Pane select
// ============================================================
split?.addEventListener("click", (e) => {
  const pane = e.target.closest?.(".pane");
  if (!pane) return;
  activeIndex = Number(pane.dataset.index);
  highlightActive();
  syncSlidersToActive();
});

// ============================================================
// Bottom target buttons (optional)
// ============================================================
targetBar?.addEventListener("click", (e) => {
  const btn = e.target.closest(".tbtn");
  if (!btn) return;
  activeIndex = Number(btn.dataset.target);
  highlightActive();
  syncSlidersToActive();
});

// ============================================================
// Layout toggle
// ============================================================
toggleLayoutBtn?.addEventListener("click", () => {
  const p = normalize();
  p.layout = p.layout === "split_lr" ? "split_tb" : "split_lr";
  saveProject(p);
  render();
});

// ============================================================
// Sliders
// ============================================================
scaleRange?.addEventListener("input", () => {
  const p = normalize();
  const ed = p.edits[activeIndex];
  if (!ed) return;
  ed.scale = Number(scaleRange.value);
  saveProject(p);
  updateOne(activeIndex);
});

rotateRange?.addEventListener("input", () => {
  const p = normalize();
  const ed = p.edits[activeIndex];
  if (!ed) return;
  ed.rotate = Number(rotateRange.value);
  saveProject(p);
  updateOne(activeIndex);
});

// ============================================================
// Image drag/pinch (pointer events)
// ============================================================
split?.addEventListener("pointerdown", (e) => {
  const pane = e.target.closest?.(".pane");
  if (!pane) return;

  // badge drag handles it
  if (e.target.closest?.(".badge")) return;

  activeIndex = Number(pane.dataset.index);
  highlightActive();
  syncSlidersToActive();

  const p = normalize();
  const ed = p.edits[activeIndex];
  if (!ed) return;

  e.preventDefault?.();
  pane.setPointerCapture(e.pointerId);

  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 1) {
    gesture = {
      type: "drag",
      startX: e.clientX,
      startY: e.clientY,
      baseX: ed.x || 0,
      baseY: ed.y || 0,
    };
    return;
  }

  if (pointers.size === 2) {
    const pts = [...pointers.values()];
    const a = pts[0];
    const b = pts[1];

    gesture = {
      type: "pinch",
      startDist: dist(a, b),
      startAng: angle(a, b),
      startCenter: center(a, b),
      baseScale: ed.scale ?? 1,
      baseRotate: ed.rotate ?? 0,
      baseX: ed.x || 0,
      baseY: ed.y || 0,
    };
  }
});

split?.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  const p = normalize();
  const ed = p.edits[activeIndex];
  if (!ed || !gesture) return;

  // 1 finger drag
  if (gesture.type === "drag") {
    if (pointers.size !== 1) return;
    const dx = e.clientX - gesture.startX;
    const dy = e.clientY - gesture.startY;
    ed.x = Math.round(gesture.baseX + dx);
    ed.y = Math.round(gesture.baseY + dy);
    saveProject(p);
    updateOne(activeIndex);
    return;
  }

  // 2 finger pinch
  if (gesture.type === "pinch") {
    if (pointers.size !== 2) return;

    const pts = [...pointers.values()];
    const a = pts[0];
    const b = pts[1];

    const curDist = dist(a, b);
    const curAng = angle(a, b);
    const curCenter = center(a, b);

    const ratio = gesture.startDist ? curDist / gesture.startDist : 1;
    const nextScale = clamp((gesture.baseScale || 1) * ratio, 0.4, 3.0);

    const dAng = curAng - gesture.startAng;
    const nextRotate = (gesture.baseRotate || 0) + (dAng * 180) / Math.PI;

    const dcx = curCenter.x - gesture.startCenter.x;
    const dcy = curCenter.y - gesture.startCenter.y;

    ed.scale = Math.round(nextScale * 1000) / 1000;
    ed.rotate = Math.round(nextRotate * 10) / 10;
    ed.x = Math.round((gesture.baseX || 0) + dcx);
    ed.y = Math.round((gesture.baseY || 0) + dcy);

    saveProject(p);
    updateOne(activeIndex);

    if (scaleRange) scaleRange.value = String(ed.scale);
    if (rotateRange) rotateRange.value = String(ed.rotate);
  }
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size === 0) gesture = null;
}

split?.addEventListener("pointerup", endPointer);
split?.addEventListener("pointercancel", endPointer);
split?.addEventListener("pointerleave", endPointer);

// ============================================================
// Label color toggle (WHITE <-> BLACK) 2枚共通
// ============================================================
colorToggle?.addEventListener("click", () => {
  const p = normalize();
  const cur = getCurrentLabelColor(p);
  const next = cur === "#fff" ? "#000" : "#fff";

  p.labels.items[0].color = next;
  p.labels.items[1].color = next;

  saveProject(p);

  split.querySelectorAll(".pane").forEach((pane) => {
    const badge = pane.querySelector(".badge");
    if (badge) badge.style.color = next;
  });

  syncColorToggleUI();
});

// ============================================================
// Reset
// ============================================================
resetBtn?.addEventListener("click", () => {
  const p = normalize();
  p.edits = p.edits.map(() => ({ x: 0, y: 0, scale: 1, rotate: 0, _fitInited: false }));
  saveProject(p);
  render();
});

resetOneBtn?.addEventListener("click", () => {
  const p = normalize();
  if (!p.edits[activeIndex]) return;

  // 現paneのbaseを残して、ユーザー調整だけ戻す
  const keep = p.edits[activeIndex];
  p.edits[activeIndex] = {
    ...keep,
    x: 0,
    y: 0,
    scale: 1,
    rotate: 0,
    _fitInited: true,
  };

  saveProject(p);
  updateOne(activeIndex);
  syncSlidersToActive();
});

// ============================================================
// Save (export PNG)
// ============================================================
async function saveBoth() {
  const p = normalize();
  saveProject(p);

  // ★保存用に、画像参照だけ「表示可能なURL」に解決したコピーを作る
  const pForExport = { ...p, images: [...p.images] };

  const use = Math.min(2, pForExport.images.length);
  for (let i = 0; i < use; i++) {
    pForExport.images[i] = await resolveImageSrc(pForExport.images[i], 60 * 10);
  }

  const dataUrl = await composePNG(pForExport, { labels: pForExport.labels });
  const blob = dataURLToBlob(dataUrl);

  await addToGallery({
    fullBlob: blob,
    meta: {
      projectId: p.projectId,
      ratio: p.ratio || "4:5",
      layout: p.layout || "split_lr",
      title: p.title || "",
      createdFrom: "edit",
    },
  });

  await saveToDevice(blob, `beforeafter_${Date.now()}.png`);
  window.location.href = "gallery.html";
}


saveBtn?.addEventListener("click", async () => {
  try {
    await saveBoth();
  } catch (err) {
    console.error("SAVE ERROR:", err);
    alert(`保存に失敗しました\n${err?.message || err}`);
  }
});

// ============================================================
// Nav
// ============================================================
backBtn?.addEventListener("click", () => {
  window.location.href = "index.html";
});

// ============================================================
// Init
// ============================================================
(async () => {
  await requireAuthOrRedirect("./k9x3.html");
  await render();
})();
