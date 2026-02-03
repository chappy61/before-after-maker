// js/edit.js (cover unified, cleaned + commented)
// ------------------------------------------------------------
// - Split view (LR/TB)
// - Active pane selection
// - Drag / pinch zoom / rotate (pointer events)
// - Label overlay per pane (position drag), color toggle (W/B), ON/OFF
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
const labelToggle = document.getElementById("labelToggle");
const saveBtn = document.getElementById("saveBtn");

const resetOneBtn = document.getElementById("resetOneBtn");
const targetBar = document.getElementById("targetBar");

const scaleVal = document.getElementById("scaleVal");
const rotateVal = document.getElementById("rotateVal");

const scaleMinus = document.getElementById("scaleMinus");
const scalePlus = document.getElementById("scalePlus");
const rotMinus = document.getElementById("rotMinus");
const rotPlus = document.getElementById("rotPlus");

const labelSizeRange = document.getElementById("labelSizeRange");
const labelSizeVal = document.getElementById("labelSizeVal");
const lblMinus = document.getElementById("lblMinus");
const lblPlus = document.getElementById("lblPlus");

split.style.touchAction = "none";

// ============================================================
// State
// ============================================================
let activeIndex = 0;

// pointer gesture
const pointers = new Map(); // pointerId -> {x,y}
let gesture = null; // {type:'drag'|'pinch', ...}
let badgeDragging = false; // ラベル移動中は画像ジェスチャーを無効化

split?.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

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
      await navigator.share({
        files: [file],
        title: "BeforeAfter",
        text: "export",
      });
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
// NOTE: normalizeは "修正して返すだけ" にして、ここでは保存しない（重くなる）
// ============================================================
function normalize() {
  const p = ensureProject();

  if (!Array.isArray(p.images)) p.images = [];
  if (!Array.isArray(p.edits)) p.edits = [];
  if (!p.layout) p.layout = "split_lr";

  // edits length align
  while (p.edits.length < p.images.length)
    p.edits.push({ x: 0, y: 0, scale: 1, rotate: 0 });
  p.edits = p.edits.slice(0, p.images.length);

  // labels
  if (!p.labels) p.labels = {};
  if (typeof p.labels.enabled !== "boolean") p.labels.enabled = true;
  if (!Array.isArray(p.labels.items)) p.labels.items = [];

  const n = Math.min(p.images.length || 0, 6);

  while (p.labels.items.length < n) {
    p.labels.items.push({ x: 0.06, y: 0.06, color: "#fff" });
  }
  p.labels.items = p.labels.items.slice(0, n);

  p.labels.items = p.labels.items.map((it) => {
    const obj = it && typeof it === "object" ? it : {};
    const text =
      typeof obj.text === "string" && obj.text.trim() !== ""
        ? obj.text.trim()
        : undefined;

    return {
      ...obj, // ✅ text など他の情報を保持
      x: typeof obj.x === "number" ? clamp01(obj.x) : 0.06,
      y: typeof obj.y === "number" ? clamp01(obj.y) : 0.06,
      color: obj?.color === "#000" || obj?.color === "black" ? "#000" : "#fff",
      ...(text ? { text } : {}), // ✅ 空文字は保存しない（自動ラベルに戻す）
      size: typeof obj.size === "number" ? clamp(obj.size, 10, 48) : 18,
    };
  });

  return p;
}

function labelText(p, i) {
  const t = p.labels?.items?.[i]?.text;
  if (typeof t === "string" && t.trim() !== "") return t.trim();

  if (p.images.length === 2) return i === 0 ? "before" : "after";
  return `#${i + 1}`;
}

function layoutForCount(n) {
  if (n <= 2) return { cols: 2, rows: 1, cells: 2 };
  if (n === 3) return { cols: 3, rows: 1, cells: 3 };
  if (n === 4) return { cols: 2, rows: 2, cells: 4 };
  return { cols: 3, rows: 2, cells: 6 };
}

function ensureLayoutObject(p) {
  // p.layout が文字列なら count から決定
  if (!p.layout || typeof p.layout === "string") {
    const n = Math.min(p.images.length, 6);
    p.layout = layoutForCount(n);
  }
  return p.layout;
}

function resolveSplitLayout(p) {
  // 2枚モードでは layout は必ず文字列にする
  if (p.layout && typeof p.layout === "object") {
    // 以前 grid を触って object になってしまったケース救済
    const cols = Number(p.layout.cols || 2);
    const rows = Number(p.layout.rows || 1);
    // ざっくり推定（2枚ならLRかTB）
    if (cols === 1 && rows === 2) return "split_tb";
    return "split_lr";
  }
  return p.layout || "split_lr";
}

async function renderGrid(p) {
  const splitEl = document.getElementById("split");
  if (!splitEl) return;

  const n = Math.min(p.images.length, 6);
  const layout = ensureLayoutObject(p);

  // split_lr / split_tb の世界線を抜ける
  splitEl.className = "split grid";
  splitEl.style.gridTemplateColumns = `repeat(${layout.cols}, 1fr)`;
  splitEl.style.gridTemplateRows = `repeat(${layout.rows}, 1fr)`;

  splitEl.innerHTML = "";

  const cells = layout.cols * layout.rows;

  for (let i = 0; i < cells; i++) {
    const pane = document.createElement("div");
    pane.className = "pane";
    pane.dataset.index = String(i);

    if (i >= n) {
      pane.classList.add("empty");
      splitEl.appendChild(pane);
      continue;
    }

    // img
    const img = document.createElement("img");
    img.className = "pane-img";
    img.crossOrigin = "anonymous";
    img.alt = `img${i + 1}`;
    pane.appendChild(img);

    // src resolve (dataURL / storage path OK)
    img.src = await resolveImageSrc(p.images[i], 60 * 10);

    // badge
    if (p.labels?.enabled) {
      p.labels = p.labels || {};
      p.labels.items = p.labels.items || [];
      p.labels.items[i] = p.labels.items[i] || {
        x: 0.06,
        y: 0.06,
        color: "#fff",
      };

      const badge = document.createElement("div");
      badge.className = "badge";
      badge.textContent = labelText(p, i);
      pane.appendChild(badge);

      installBadgeDrag(badge, pane, i);
      installBadgeTextEdit(badge, i);
    }

    splitEl.appendChild(pane);

    // decode after append
    try {
      await img.decode?.();
    } catch {}

    // edits保険 + 初回fit
    const ed = p.edits[i] || (p.edits[i] = { x: 0, y: 0, scale: 1, rotate: 0 });

    if (!ed._fitInited) {
      ed.scale = 1;
      ed.rotate = 0;
      ed.x = 0;
      ed.y = 0;
      ed._fitInited = true;
      saveProject(p);
    }

    applyTransform(img, ed);

    // badge位置反映
    if (p.labels?.enabled) {
      const badge = pane.querySelector(".badge");
      if (badge) applyBadgeStyle(badge, pane, p.labels.items[i]);
    }
  }
}

// ============================================================
// Image transform (cover * userScale)
// ============================================================
function applyTransform(img, ed) {
  const pane = img.parentElement;
  if (!pane) return;

  const paneW = pane.clientWidth || 1;
  const paneH = pane.clientHeight || 1;

  // baseW/H は「最後に安定していたpaneサイズ」を保持したい
  // 1pxとか変な値の時は更新しない
  if (paneW > 10 && paneH > 10) {
    ed.baseW = paneW;
    ed.baseH = paneH;
  }

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

  // translate → rotate（compose側と体感揃え）
  img.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) rotate(${rot}deg)`;
}

// ============================================================
// Label badge style + drag (枠内クランプ)
// ============================================================
function applyBadgeStyle(badge, pane, label) {
  const w = pane.clientWidth || 1;
  const h = pane.clientHeight || 1;

  // label無い/壊れてる時の保険
  const x01 = clamp(Number(label?.x ?? 0.06), 0, 1);
  const y01 = clamp(Number(label?.y ?? 0.06), 0, 1);

  // 仮置き
  badge.style.left = `${Math.round(x01 * w)}px`;
  badge.style.top = `${Math.round(y01 * h)}px`;

  // 枠内クランプ（バッジサイズ考慮）
  const bw = badge.offsetWidth || 1;
  const bh = badge.offsetHeight || 1;

  const maxLeft = Math.max(0, w - bw);
  const maxTop = Math.max(0, h - bh);

  const leftPx = clamp(Math.round(x01 * w), 0, maxLeft);
  const topPx = clamp(Math.round(y01 * h), 0, maxTop);

  badge.style.left = `${leftPx}px`;
  badge.style.top = `${topPx}px`;

  badge.style.color = label?.color || "#fff";
  badge.style.pointerEvents = "auto";
  badge.style.touchAction = "none";
  badge.style.cursor = "grab";
  badge.style.fontSize = `${Number(label?.size ?? 18)}px`;
}

function installBadgeTextEdit(badge, index) {
  badge.style.userSelect = "none";
  badge.style.webkitUserSelect = "none";
  badge.style.webkitTouchCallout = "none";
  badge.style.touchAction = "none";

  let timer = null;
  let startX = 0,
    startY = 0;
  let moved = false;

  const HOLD_MS = 450;
  const MOVE_TOL = 8;

  badge.addEventListener("pointerdown", (e) => {
    // ドラッグ処理と共存：編集は「長押しだけ」で開く
    startX = e.clientX;
    startY = e.clientY;
    moved = false;

    timer = setTimeout(() => {
      timer = null;
      openLabelEditor(index);
    }, HOLD_MS);
  });

  badge.addEventListener("pointermove", (e) => {
    if (!timer) return;
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    if (dx > MOVE_TOL || dy > MOVE_TOL) {
      moved = true;
      clearTimeout(timer);
      timer = null;
    }
  });

  const end = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  badge.addEventListener("pointerup", end);
  badge.addEventListener("pointercancel", end);
  badge.addEventListener("pointerleave", end);

  // contextmenu（長押しメニュー）殺す
  badge.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });
}

function openLabelEditor(index) {
  const p = normalize();
  p.labels = p.labels || {};
  p.labels.items = p.labels.items || [];
  p.labels.items[index] = p.labels.items[index] || {
    x: 0.06,
    y: 0.06,
    color: "#fff",
  };

  const current = p.labels.items[index].text || "";
  const next = prompt("ラベル文字を入力（空で自動に戻す）", current);
  if (next === null) return;

  const v = String(next).trim();
  if (v === "") delete p.labels.items[index].text;
  else p.labels.items[index].text = v;

  saveProject(p);
  render();
}

function installBadgeDrag(badge, pane, index) {
  let startX = 0,
    startY = 0;
  let startX01 = 0,
    startY01 = 0;
  let dragging = false;

  badge.style.touchAction = "none";

  badge.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch" && !e.isPrimary) return;

    e.preventDefault();
    e.stopPropagation();

    dragging = true;
    badgeDragging = true;
    badge.setPointerCapture(e.pointerId);

    const p = normalize();
    p.labels = p.labels || {};
    p.labels.items = p.labels.items || [{}, {}, {}, {}, {}, {}];

    const it = p.labels.items[index] || {};
    startX01 = typeof it.x === "number" ? it.x : 0.06;
    startY01 = typeof it.y === "number" ? it.y : 0.06;

    startX = e.clientX;
    startY = e.clientY;
  });

  badge.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    if (!badge.hasPointerCapture(e.pointerId)) return;

    e.preventDefault();

    const p = normalize();
    p.labels = p.labels || {};
    p.labels.items = p.labels.items || [{}, {}, {}, {}, {}, {}];

    const prect = pane.getBoundingClientRect();
    if (prect.width <= 1 || prect.height <= 1) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    const bw = badge.offsetWidth || 1;
    const bh = badge.offsetHeight || 1;

    const maxLeftPx = Math.max(0, prect.width - bw);
    const maxTopPx = Math.max(0, prect.height - bh);

    const startLeftPx = startX01 * prect.width;
    const startTopPx = startY01 * prect.height;

    let leftPx = startLeftPx + dx;
    let topPx = startTopPx + dy;

    leftPx = clamp(leftPx, 0, maxLeftPx);
    topPx = clamp(topPx, 0, maxTopPx);

    const x01 = leftPx / prect.width;
    const y01 = topPx / prect.height;

    p.labels.items[index] = {
      ...(p.labels.items[index] || {}),
      x: x01,
      y: y01,
    };

    applyBadgeStyle(badge, pane, p.labels.items[index]);
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    badgeDragging = false;

    try {
      if (badge.hasPointerCapture(e.pointerId))
        badge.releasePointerCapture(e.pointerId);
    } catch {}

    // ✅ ドラッグ終わったタイミングで1回だけ保存
    try {
      saveProject(normalize());
    } catch {}
  }

  badge.addEventListener("pointerup", endDrag);
  badge.addEventListener("pointercancel", endDrag);
  badge.addEventListener("lostpointercapture", () => {
    if (!dragging) return;
    dragging = false;
    badgeDragging = false;
    try {
      saveProject(normalize());
    } catch {}
  });
}

// ============================================================
// Active highlight
// ============================================================
function highlightActive() {
  split?.querySelectorAll(".pane").forEach((p) => {
    p.classList.toggle("active", Number(p.dataset.index) === activeIndex);
  });

  targetBar?.querySelectorAll(".tbtn").forEach((btn) => {
    btn.classList.toggle(
      "selected",
      Number(btn.dataset.target) === activeIndex,
    );
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

  if (scaleVal) scaleVal.textContent = Number(scaleRange.value).toFixed(2);
  if (rotateVal)
    rotateVal.textContent = `${Math.round(Number(rotateRange.value))}°`;

  const it = p.labels?.items?.[activeIndex] || {};
  if (labelSizeRange) labelSizeRange.value = String(it.size ?? 18);
  if (labelSizeVal) labelSizeVal.textContent = `${labelSizeRange.value}px`;
}

function syncLabelToggleUI() {
  const p = normalize();
  const on = p.labels?.enabled ?? true;
  if (labelToggle) {
    labelToggle.classList.toggle("is-on", on);
    labelToggle.textContent = on ? "label:on" : "label:off";
    labelToggle.setAttribute("aria-pressed", String(on));
  }
}

// ✅ iOS安定：clickで切り替え
labelToggle?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();

  const p = normalize();
  p.labels = p.labels || {};
  p.labels.enabled = !(p.labels.enabled ?? true);

  saveProject(p);
  render();
  syncLabelToggleUI();
});

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

  // 3枚以上はグリッドへ
  if (n > 2) {
    await renderGrid(p);

    // layoutボタンはグリッド中は無効（事故防止）
    if (toggleLayoutBtn) {
      toggleLayoutBtn.innerHTML = `<span class="icon split-lr"></span>`;
      toggleLayoutBtn.classList.add("is-disabled");
      toggleLayoutBtn.setAttribute("aria-disabled", "true");
    }

    activeIndex = clamp(activeIndex, 0, n - 1);

    highlightActive();
    syncColorToggleUI();
    syncSlidersToActive();
    syncLabelToggleUI();
    return;
  }

  // --------------------
  // ここから従来の2枚モード
  // --------------------
  if (toggleLayoutBtn) {
    toggleLayoutBtn.classList.remove("is-disabled");
    toggleLayoutBtn.removeAttribute("aria-disabled");
  }

  // layout class
  const splitLayout = resolveSplitLayout(p);
  split.className = "split " + splitLayout;

  // icon update
  if (toggleLayoutBtn) {
    toggleLayoutBtn.innerHTML = `<span class="icon ${
      splitLayout === "split_lr" ? "split-lr" : "split-tb"
    }"></span>`;
  }

  split.innerHTML = "";

  const use = Math.min(2, n);

  for (let i = 0; i < use; i++) {
    const pane = document.createElement("div");
    pane.className = "pane";
    pane.dataset.index = String(i);

    const img = document.createElement("img");
    img.crossOrigin = "anonymous"; // canvas書き出し保険
    img.alt = `img${i}`;
    pane.appendChild(img);

    // dataURL or storage path のどちらでもOK
    img.src = await resolveImageSrc(p.images[i], 60 * 10);

    // badge
    if (p.labels?.enabled) {
      p.labels = p.labels || {};
      p.labels.items = p.labels.items || [{}, {}];
      p.labels.items[i] = p.labels.items[i] || {
        x: 0.06,
        y: 0.06,
        color: "#fff",
      };

      const badge = document.createElement("div");
      badge.className = "badge";
      badge.textContent = labelText(p, i);
      pane.appendChild(badge);

      installBadgeDrag(badge, pane, i);
      installBadgeTextEdit(badge, i);
    }

    split.appendChild(pane);

    try {
      await img.decode?.();
    } catch {}

    const ed = p.edits[i] || (p.edits[i] = { x: 0, y: 0, scale: 1, rotate: 0 });

    if (!ed._fitInited) {
      ed.scale = 1;
      ed.rotate = 0;
      ed.x = 0;
      ed.y = 0;
      ed._fitInited = true;
    }

    if (!ed.baseW || !ed.baseH) {
      const prect = pane.getBoundingClientRect();
      ed.baseW = Math.round(prect.width);
      ed.baseH = Math.round(prect.height);
    }

    saveProject(p);

    applyTransform(img, ed);

    if (p.labels?.enabled) {
      const badge = pane.querySelector(".badge");
      if (badge) applyBadgeStyle(badge, pane, p.labels.items[i]);
    }
  }

  highlightActive();
  syncColorToggleUI();
  syncSlidersToActive();
  syncLabelToggleUI();
}

// ============================================================
// Update one pane image
// ============================================================
function updateOne(i) {
  const p = normalize();
  const pane = split.querySelector(`.pane[data-index="${i}"]`);
  const img = pane?.querySelector("img, .pane-img");
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
  if (p.images.length > 2) return; // グリッド中は無効
  const cur = resolveSplitLayout(p);
  p.layout = cur === "split_lr" ? "split_tb" : "split_lr";
  saveProject(p);
  render();
});

function syncToolValuesFromProject() {
  const p = normalize();
  const ed = p.edits[activeIndex] || {};
  if (scaleRange) scaleRange.value = String(ed.scale ?? 1);
  if (rotateRange) rotateRange.value = String(ed.rotate ?? 0);

  if (scaleVal) scaleVal.textContent = Number(scaleRange.value).toFixed(2);
  if (rotateVal)
    rotateVal.textContent = `${Math.round(Number(rotateRange.value))}°`;

  const it = p.labels?.items?.[activeIndex] || {};
  if (labelSizeRange) labelSizeRange.value = String(it.size ?? 18);
  if (labelSizeVal) labelSizeVal.textContent = `${labelSizeRange.value}px`;
}

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
  if (scaleVal) scaleVal.textContent = Number(scaleRange.value).toFixed(2);
});

rotateRange?.addEventListener("input", () => {
  const p = normalize();
  const ed = p.edits[activeIndex];
  if (!ed) return;
  ed.rotate = Number(rotateRange.value);
  saveProject(p);
  updateOne(activeIndex);
  if (rotateVal)
    rotateVal.textContent = `${Math.round(Number(rotateRange.value))}°`;
});

scaleMinus?.addEventListener("click", () => {
  scaleRange.stepDown();
  scaleRange.dispatchEvent(new Event("input"));
});
scalePlus?.addEventListener("click", () => {
  scaleRange.stepUp();
  scaleRange.dispatchEvent(new Event("input"));
});

rotMinus?.addEventListener("click", () => {
  rotateRange.stepDown();
  rotateRange.dispatchEvent(new Event("input"));
});
rotPlus?.addEventListener("click", () => {
  rotateRange.stepUp();
  rotateRange.dispatchEvent(new Event("input"));
});

labelSizeRange?.addEventListener("input", () => {
  const p = normalize();
  if (!p.labels?.items?.[activeIndex]) return;

  p.labels.items[activeIndex] = {
    ...(p.labels.items[activeIndex] || {}),
    size: Number(labelSizeRange.value),
  };

  saveProject(p);

  // 表示更新
  if (labelSizeVal) labelSizeVal.textContent = `${labelSizeRange.value}px`;

  // 画面反映（badgeだけ更新）
  const pane = split.querySelector(`.pane[data-index="${activeIndex}"]`);
  const badge = pane?.querySelector(".badge");
  if (badge) applyBadgeStyle(badge, pane, p.labels.items[activeIndex]);
});

lblMinus?.addEventListener("click", () => {
  labelSizeRange.stepDown();
  labelSizeRange.dispatchEvent(new Event("input"));
});
lblPlus?.addEventListener("click", () => {
  labelSizeRange.stepUp();
  labelSizeRange.dispatchEvent(new Event("input"));
});

// ============================================================
// Image drag/pinch (pointer events)
// ============================================================
split?.addEventListener("pointerdown", (e) => {
  const pane = e.target.closest?.(".pane");
  if (!pane) return;

  // badge drag handles it
  if (e.target.closest?.(".badge")) return;
  if (badgeDragging) return;

  activeIndex = Number(pane.dataset.index);
  highlightActive();
  syncSlidersToActive();

  const p = normalize();
  const ed = p.edits[activeIndex];
  if (!ed) return;

  e.preventDefault?.();

  // iOS対策：たまに例外になることがあるので保険
  try {
    pane.setPointerCapture(e.pointerId);
  } catch {}

  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 1) {
    // ✅ 1本指では画像を動かさない（ラベル誤爆防止）
    // 2本指になった瞬間に pinch を開始する
    gesture = null;
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

    updateOne(activeIndex);
  }
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);

  if (pointers.size === 0) {
    gesture = null;
    try {
      saveProject(normalize()); // 指が全部離れた瞬間に1回だけ保存
    } catch {}
  }
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

  const n = Math.min(p.images.length, 6);
  p.labels = p.labels || {};
  p.labels.items = p.labels.items || [];

  for (let i = 0; i < n; i++) {
    p.labels.items[i] = p.labels.items[i] || {
      x: 0.06,
      y: 0.06,
      color: "#fff",
    };
    p.labels.items[i].color = next;
  }

  saveProject(p);

  split.querySelectorAll(".badge").forEach((badge) => {
    badge.style.color = next;
  });

  syncColorToggleUI();
});

// ============================================================
// Reset
// ============================================================
resetBtn?.addEventListener("click", () => {
  const p = normalize();
  p.edits = p.edits.map(() => ({
    x: 0,
    y: 0,
    scale: 1,
    rotate: 0,
    _fitInited: false,
  }));
  saveProject(p);
  render();
});

resetOneBtn?.addEventListener("click", () => {
  const p = normalize();
  if (!p.edits[activeIndex]) return;

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
  let savedToGallery = false;
  let savedToDevice = false;

  // ✅ compose → blob
  const dataUrl = await composePNG(p, {
    labels: p.labels,
    ratio: p.ratio || "4:5",
  });
  const blob = dataURLToBlob(dataUrl);

  // ✅ ギャラリー保存（ここが成功したら success 扱い）
  try {
    await addToGallery({
      fullBlob: blob,
      meta: {
        projectId: p.projectId,
        ratio: p.ratio || "4:5",
        layout: p.layout, // objectでも入る（必要ならJSON化してもOK）
        title: p.title || "",
        createdFrom: "edit",
      },
    });
    savedToGallery = true;
  } catch (e) {
    console.error("GALLERY SAVE FAILED:", e);
  }

  // ✅ 端末保存（失敗してもギャラリーに入ってればOKにする）
  try {
    await saveToDevice(blob, `beforeafter_${Date.now()}.png`);
    savedToDevice = true;
  } catch (e) {
    console.error("DEVICE SAVE FAILED:", e);
  }

  // ✅ どっちか成功してたらOK扱いで遷移
  if (savedToGallery || savedToDevice) {
    window.location.href = "gallery.html";
    return;
  }

  // ✅ 両方失敗した時だけエラーにする
  throw new Error("保存に失敗しました（ギャラリー/端末保存どちらも失敗）");
}

saveBtn?.addEventListener("click", async () => {
  try {
    await saveBoth();
  } catch (err) {
    console.error("SAVE ERROR DETAIL:", err);
    console.error("STACK:", err?.stack);
    alert(`保存に失敗しました\n${err?.message || err}`);
  }
});

// ============================================================
// Nav
// ============================================================
backBtn?.addEventListener("click", () => {
  window.location.href = "index.html";
});

function initRangeCaps() {
  const scaleMin = document.getElementById("scaleMin");
  const scaleMax = document.getElementById("scaleMax");
  const rotMin = document.getElementById("rotMin");
  const rotMax = document.getElementById("rotMax");
  const lblMin = document.getElementById("lblMin");
  const lblMax = document.getElementById("lblMax");

  if (scaleRange) {
    if (scaleMin) scaleMin.textContent = Number(scaleRange.min).toFixed(2);
    if (scaleMax) scaleMax.textContent = Number(scaleRange.max).toFixed(2);
  }

  if (rotateRange) {
    if (rotMin) rotMin.textContent = `${rotateRange.min}°`;
    if (rotMax) rotMax.textContent = `${rotateRange.max}°`;
  }

  if (labelSizeRange) {
    if (lblMin) lblMin.textContent = `${labelSizeRange.min}px`;
    if (lblMax) lblMax.textContent = `${labelSizeRange.max}px`;
  }
}

// ============================================================
// Init
// ============================================================
(async () => {
  await requireAuthOrRedirect("./k9x3.html");
  await render();

  initRangeCaps();
  syncSlidersToActive(); // 初期表示の数値を確実に出す
})();
