import { ensureProject, saveProject } from "./storage.js";

// ---- required ----
const split = document.getElementById("split");
const toggleLayoutBtn = document.getElementById("toggleLayoutBtn");
const backBtn = document.getElementById("backBtn");
const nextBtn = document.getElementById("nextBtn");
const resetBtn = document.getElementById("resetBtn");

// sliders (inside mini tool sheet)
const scaleRange = document.getElementById("scaleRange");
const rotateRange = document.getElementById("rotateRange");
const resetOneBtn = document.getElementById("resetOneBtn");

// mini tool sheet
const sheet = document.getElementById("sheet");
const sheetClose = document.getElementById("sheetClose");
const sheetBackdrop = document.getElementById("sheetBackdrop"); // optional

// bottom target buttons
const targetBar = document.getElementById("targetBar");

// NEW: quick tool buttons
const zoomBtn = document.getElementById("zoomBtn");
const rotateBtn = document.getElementById("rotateBtn");

// ---- state ----
let activeIndex = 0;
let drag = null;
let holdTimer = null;
let sheetMode = "scale"; // "scale" | "rotate"

// ---------------------
// State normalize
// ---------------------
function normalize() {
  const p = ensureProject();
  if (!Array.isArray(p.images)) p.images = [];
  if (!Array.isArray(p.edits)) p.edits = [];
  if (!p.layout) p.layout = "split_lr";
  if (!p.labels) p.labels = { enabled: true, color: "white", offsetX: 0, offsetY: 0 };

  while (p.edits.length < p.images.length) {
    p.edits.push({ x: 0, y: 0, scale: 1, rotate: 0 });
  }
  p.edits = p.edits.slice(0, p.images.length);

  saveProject(p);
  return p;
}

function labelText(p, i) {
  if (p.images.length === 2) return i === 0 ? "before" : "after";
  return `#${i + 1}`;
}

function applyTransform(img, ed) {
  img.style.transform =
    `translate(-50%, -50%) translate(${ed.x}px, ${ed.y}px) rotate(${ed.rotate}deg) scale(${ed.scale})`;
}

// ---------------------
// Sheet open/close
// ---------------------
function setSheetMode(mode) {
  sheetMode = mode;

  // 見せたいスライダーだけ表示（HTML構造に依存しないよう最小で）
  if (scaleRange) scaleRange.closest(".tool")?.classList.toggle("hidden", mode !== "scale");
  if (rotateRange) rotateRange.closest(".tool")?.classList.toggle("hidden", mode !== "rotate");

  // もし .tool で包んでない場合の保険
  if (scaleRange && !scaleRange.closest(".tool")) scaleRange.style.display = (mode === "scale") ? "" : "none";
  if (rotateRange && !rotateRange.closest(".tool")) rotateRange.style.display = (mode === "rotate") ? "" : "none";
}

function openSheet(mode = sheetMode) {
  setSheetMode(mode);
  sheet?.classList.add("open");
  if (sheetBackdrop) sheetBackdrop.hidden = true; // 暗幕なし
  syncPanel();
}

function closeSheet() {
  sheet?.classList.remove("open");
  if (sheetBackdrop) sheetBackdrop.hidden = true;
}

sheetClose?.addEventListener("click", closeSheet);
sheetBackdrop?.addEventListener("click", closeSheet);

// ---------------------
// Active highlight
// ---------------------
function highlightActive() {
  split?.querySelectorAll(".pane").forEach((p) => {
    p.classList.toggle("active", Number(p.dataset.index) === activeIndex);
  });

  targetBar?.querySelectorAll(".tbtn").forEach((btn) => {
    btn.classList.toggle("selected", Number(btn.dataset.target) === activeIndex);
  });
}

// ---------------------
// Sync sliders to active
// ---------------------
function syncPanel() {
  const p = normalize();
  const ed = p.edits[activeIndex] || { x: 0, y: 0, scale: 1, rotate: 0 };

  if (scaleRange) scaleRange.value = String(ed.scale);
  if (rotateRange) rotateRange.value = String(ed.rotate);
}

// ---------------------
// Render
// ---------------------
function render() {
  const p = normalize();
  const n = p.images.length;

  if (n === 0) {
    window.location.href = "index.html";
    return;
  }

  split.className = "split " + (p.layout || "split_lr");
  if (toggleLayoutBtn) toggleLayoutBtn.textContent = (p.layout === "split_lr") ? "左右" : "上下";

  split.innerHTML = "";

  const use = Math.min(2, n);

  for (let i = 0; i < use; i++) {
    const pane = document.createElement("div");
    pane.className = "pane";
    pane.dataset.index = String(i);

    const img = document.createElement("img");
    img.src = p.images[i];
    img.alt = `img${i}`;
    applyTransform(img, p.edits[i]);

    const badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent = labelText(p, i);

    pane.appendChild(img);
    if (p.labels?.enabled) pane.appendChild(badge);
    split.appendChild(pane);
  }

  if (activeIndex >= use) activeIndex = 0;

  syncPanel();
  highlightActive();
}

// ---------------------
// Update one pane
// ---------------------
function updateOne(i) {
  const p = normalize();
  const pane = split.querySelector(`.pane[data-index="${i}"]`);
  const img = pane?.querySelector("img");
  if (img && p.edits[i]) applyTransform(img, p.edits[i]);
}

// ---------------------
// Select by tapping pane
// ---------------------
split.addEventListener("click", (e) => {
  const pane = e.target.closest(".pane");
  if (!pane) return;

  activeIndex = Number(pane.dataset.index);
  syncPanel();
  highlightActive();
});

// ---------------------
// Bottom target buttons
// ---------------------
targetBar?.addEventListener("click", (e) => {
  const btn = e.target.closest(".tbtn");
  if (!btn) return;
  activeIndex = Number(btn.dataset.target);
  syncPanel();
  highlightActive();
});

// ---------------------
// Layout toggle
// ---------------------
toggleLayoutBtn?.addEventListener("click", () => {
  const p = normalize();
  p.layout = (p.layout === "split_lr") ? "split_tb" : "split_lr";
  saveProject(p);
  render();
});

// ---------------------
// Sliders
// ---------------------
scaleRange?.addEventListener("input", () => {
  const p = normalize();
  if (!p.edits[activeIndex]) return;
  p.edits[activeIndex].scale = Number(scaleRange.value);
  saveProject(p);
  updateOne(activeIndex);
});

rotateRange?.addEventListener("input", () => {
  const p = normalize();
  if (!p.edits[activeIndex]) return;
  p.edits[activeIndex].rotate = Number(rotateRange.value);
  saveProject(p);
  updateOne(activeIndex);
});

// ---------------------
// Drag position
// ---------------------
split.addEventListener("pointerdown", (e) => {
  const pane = e.target.closest(".pane");
  if (!pane) return;

  activeIndex = Number(pane.dataset.index);
  syncPanel();
  highlightActive();

  const p = normalize();
  const ed = p.edits[activeIndex];
  if (!ed) return;

  drag = {
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    baseX: ed.x,
    baseY: ed.y,
  };

  pane.setPointerCapture(e.pointerId);
});

split.addEventListener("pointermove", (e) => {
  if (!drag) return;

  const dx = e.clientX - drag.startX;
  const dy = e.clientY - drag.startY;

  const p = normalize();
  const ed = p.edits[activeIndex];
  if (!ed) return;

  ed.x = Math.round(drag.baseX + dx);
  ed.y = Math.round(drag.baseY + dy);

  saveProject(p);
  updateOne(activeIndex);
});

split.addEventListener("pointerup", () => (drag = null));
split.addEventListener("pointercancel", () => (drag = null));

// ---------------------
// Reset
// ---------------------
resetBtn?.addEventListener("click", () => {
  const p = normalize();
  p.edits = p.edits.map(() => ({ x: 0, y: 0, scale: 1, rotate: 0 }));
  saveProject(p);
  render();
});

resetOneBtn?.addEventListener("click", () => {
  const p = normalize();
  if (!p.edits[activeIndex]) return;
  p.edits[activeIndex] = { x: 0, y: 0, scale: 1, rotate: 0 };
  saveProject(p);
  updateOne(activeIndex);
  syncPanel();
});

// ---------------------
// Quick tools (tap = nudge, long-press = open slider)
// ---------------------

function attachHold(btn, mode, onTap){
  if(!btn) return;

  btn.addEventListener("pointerdown", ()=>{
    holdTimer = setTimeout(()=>{
      openSheet(mode); // mode: "scale" or "rotate"
    }, 380);
  });

  const clearHold = ()=>{
    if(holdTimer){
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  };

  btn.addEventListener("pointerup", ()=>{
    // 長押しで sheet が開いた場合は tap を走らせない
    const opened = sheet?.classList.contains("open");
    clearHold();
    if(opened) return;
    onTap?.();
  });

  btn.addEventListener("pointercancel", clearHold);
  btn.addEventListener("pointerleave", clearHold);
}
attachHold(zoomBtn, "scale", ()=>{
  const p = normalize();
  const ed = p.edits[activeIndex];
  if(!ed) return;

  ed.scale = Math.min(2.5, Math.round((ed.scale + 0.05) * 100) / 100);
  saveProject(p);
  syncPanel();
  updateOne(activeIndex);
});

attachHold(rotateBtn, "rotate", ()=>{
  const p = normalize();
  const ed = p.edits[activeIndex];
  if(!ed) return;

  ed.rotate = Math.max(-45, Math.min(45, ed.rotate + 3));
  saveProject(p);
  syncPanel();
  updateOne(activeIndex);
});

// ---------------------
// Nav
// ---------------------
backBtn?.addEventListener("click", () => history.back());
nextBtn?.addEventListener("click", () => (window.location.href = "preview.html"));

// ---------------------
// Init
// ---------------------
setSheetMode("scale"); // 初期は拡大
render();
