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
  if (toggleLayoutBtn) {
  toggleLayoutBtn.innerHTML = `<span class="icon ${p.layout === "split_lr" ? "split-lr" : "split-tb"}"></span>`;
  toggleLayoutBtn.setAttribute("aria-label", p.layout === "split_lr" ? "左右分割" : "上下分割");
}

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
  const pane = split.querySelector(`.pane[data-index="${activeIndex}"]`);
  if (pane) { p.edits[activeIndex].baseW = pane.clientWidth || 1; p.edits[activeIndex].baseH = pane.clientHeight || 1; }
  stampBaseSize(p, activeIndex);
  saveProject(p);
  updateOne(activeIndex);
});

rotateRange?.addEventListener("input", () => {
  const p = normalize();
  if (!p.edits[activeIndex]) return;
  p.edits[activeIndex].rotate = Number(rotateRange.value);
  stampBaseSize(p, activeIndex);
  saveProject(p);
  updateOne(activeIndex);
});

// ---------------------
// Drag + Pinch (2 pointers)
// ---------------------

// 追跡中のポインタ（最大2本だけ使う）
const pointers = new Map(); // pointerId -> {x,y}
let gesture = null; // { type:'drag'|'pinch', ... }

function dist(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}
function angle(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x); // rad
}
function center(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

split.addEventListener("pointerdown", (e) => {
  const pane = e.target.closest(".pane");
  if (!pane) return;

  activeIndex = Number(pane.dataset.index);
  syncPanel();
  highlightActive();

  const p = normalize();
  const ed = p.edits[activeIndex];
  if (!ed) return;

  // iOS/Chromeで安定させる定番：スクロール等を抑止
  e.preventDefault?.();

  pane.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  // 1本目: drag開始
  if (pointers.size === 1) {
    gesture = {
      type: "drag",
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: ed.x,
      baseY: ed.y,
    };
    return;
  }

  // 2本目が入ったら pinch開始（dragは終了）
  if (pointers.size === 2) {
    const pts = [...pointers.values()];
    const a = pts[0];
    const b = pts[1];

    gesture = {
      type: "pinch",
      // pinch開始時の2点情報
      startA: { ...a },
      startB: { ...b },
      startDist: dist(a, b),
      startAng: angle(a, b),
      startCenter: center(a, b),

      // 編集の基準値
      baseScale: ed.scale,
      baseRotate: ed.rotate,
      baseX: ed.x,
      baseY: ed.y,
    };
  }
});
function stampBaseSize(p, i){
  const pane = split.querySelector(`.pane[data-index="${i}"]`);
  if(!pane) return;
  const ed = p.edits?.[i];
  if(!ed) return;

  ed.baseW = pane.clientWidth || 1;
  ed.baseH = pane.clientHeight || 1;
}


split.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;

  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  const p = normalize();
  const ed = p.edits[activeIndex];
  if (!ed || !gesture) return;

  // ---- 1本指ドラッグ ----
  if (gesture.type === "drag") {
    // pinch中にdragが走るのを防ぐ（2本になったらpinchへ）
    if (pointers.size !== 1) return;

    const dx = e.clientX - gesture.startX;
    const dy = e.clientY - gesture.startY;

    ed.x = Math.round(gesture.baseX + dx);
    ed.y = Math.round(gesture.baseY + dy);
    stampBaseSize(p, activeIndex);
    saveProject(p);
    updateOne(activeIndex);
    return;
  }

  // ---- 2本指ピンチ（スケール + 回転 + 中心固定の平行移動）----
  if (gesture.type === "pinch") {
    if (pointers.size !== 2) return;

    const pts = [...pointers.values()];
    const a = pts[0];
    const b = pts[1];

    const curDist = dist(a, b);
    const curAng = angle(a, b);
    const curCenter = center(a, b);

    // スケール倍率（開始距離 대비）
    const ratio = gesture.startDist ? (curDist / gesture.startDist) : 1;

    // スケール更新（制限は好みで）
    const nextScale = Math.max(0.4, Math.min(3.0, gesture.baseScale * ratio));

    // 角度差分（rad -> deg）
    const dAng = curAng - gesture.startAng;
    const nextRotate = gesture.baseRotate + (dAng * 180) / Math.PI;

    // 中心固定：指の中心が動いた分だけ画像も追従
    const dcx = curCenter.x - gesture.startCenter.x;
    const dcy = curCenter.y - gesture.startCenter.y;
    const nextX = Math.round(gesture.baseX + dcx);
    const nextY = Math.round(gesture.baseY + dcy);

    ed.scale = Math.round(nextScale * 1000) / 1000;
    ed.rotate = Math.round(nextRotate * 10) / 10;
    ed.x = nextX;
    ed.y = nextY;
    stampBaseSize(p, activeIndex);
    saveProject(p);
    updateOne(activeIndex);
    syncPanel(); // スライダーも追従させたいなら（重いなら外してOK）
  }
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);

  // 2本 -> 1本に戻ったら、残った指でドラッグを再開したい場合
  if (pointers.size === 1) {
    const [remainId, pt] = pointers.entries().next().value;
    const p = normalize();
    const ed = p.edits[activeIndex];
    if (!ed) return;

    gesture = {
      type: "drag",
      pointerId: remainId,
      startX: pt.x,
      startY: pt.y,
      baseX: ed.x,
      baseY: ed.y,
    };
    return;
  }

  // 0本なら終了
  if (pointers.size === 0) {
    gesture = null;
  }
}

split.addEventListener("pointerup", endPointer);
split.addEventListener("pointercancel", endPointer);
split.addEventListener("pointerleave", (e) => {
  // leaveが頻発する端末もあるので、安全に終了だけ
  if (pointers.has(e.pointerId)) endPointer(e);
});

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
// Nav
// ---------------------
backBtn?.addEventListener("click", () => history.back());
nextBtn?.addEventListener("click", () => (window.location.href = "preview.html"));

// ---------------------
// Init
// ---------------------
setSheetMode("scale"); // 初期は拡大
render();
