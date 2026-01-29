import { listGallery, deleteGalleryItem, getGalleryItem } from "./db.js";
import { requireAuthOrRedirect } from "./passcodeAuth.js";

await requireAuthOrRedirect("./k9x3.html");

// ---------------------
// DOM
// ---------------------
const galleryEl = document.getElementById("gallery");
const yearbarEl = document.getElementById("yearbar");
const topbarRight = document.getElementById("topbarRight");

// ---------------------
// State
// ---------------------
let selectMode = false;
const selectedIds = new Set(); // 画像idのみ入れる

let selectedYear = null;
let allItems = []; // { id, createdAt(ms), thumbUrl, meta }

// overlay
let overlayOpen = false;

// ---------------------
// Utils
// ---------------------
function pad2(n) { return String(n).padStart(2, "0"); }
function yearKey(ts) { return String(new Date(ts).getFullYear()); }
function ymKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}
function dateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function dateLabelFromKey(key) {
  const [, mm, dd] = key.split("-");
  return `${mm}/${dd}`;
}
function safeHTML(s) {
  return String(s).replace(/[&<>"']/g, (m) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]
  ));
}
function getYearsFromAllItems() {
  const set = new Set(allItems.map(it => yearKey(it.createdAt)));
  return [...set].sort().reverse();
}

// ---------------------
// Select UI (Topbar right)
// ---------------------
function renderTopbarRight() {
  if (!topbarRight) return;

  if (!selectMode) {
    topbarRight.innerHTML = ""; // 何も出さない（タイトルはズレない）
    return;
  }

  const n = selectedIds.size;
  topbarRight.innerHTML = `
    <button class="btn ghost danger" id="deleteBtn" ${n ? "" : "disabled"}>
      削除${n ? `(${n})` : ""}
    </button>
  `;

  const btn = document.getElementById("deleteBtn");
  btn?.addEventListener("click", onDeleteSelected);
}

function enterSelectMode() {
  if (selectMode) return;
  selectMode = true;
  renderTopbarRight();
  // 選択モードに入った瞬間に「チェック表示」を有効化
  refreshSelectionMarks();
}
function exitSelectMode() {
  selectMode = false;
  selectedIds.clear();
  renderTopbarRight();
  refreshSelectionMarks();
}

function toggleSelected(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);

  renderTopbarRight();
  refreshSelectionMarks();
}

// ---------------------
// Grouping (Year -> Month -> Day)
// ---------------------
function groupByMonthAndDay(items) {
  const monthMap = new Map(); // ym -> dayMap
  for (const it of items) {
    const ym = ymKey(it.createdAt);
    const d = dateKey(it.createdAt);

    if (!monthMap.has(ym)) monthMap.set(ym, new Map());
    const dayMap = monthMap.get(ym);

    if (!dayMap.has(d)) dayMap.set(d, []);
    dayMap.get(d).push(it);
  }

  for (const [, dayMap] of monthMap) {
    for (const [, arr] of dayMap) arr.sort((a, b) => b.createdAt - a.createdAt);
  }
  return monthMap;
}

// ---------------------
// Render: Yearbar
// ---------------------
function renderYearbar() {
  if (!yearbarEl) return;

  const years = getYearsFromAllItems();
  if (years.length === 0) {
    yearbarEl.innerHTML = "";
    return;
  }

  if (!selectedYear) selectedYear = years[0];

  if (years.length === 1) {
    // 年自体も長押し選択できるように data-year を付ける
    yearbarEl.innerHTML = `<div class="yearfixed" data-year="${safeHTML(years[0])}">${safeHTML(years[0])}</div>`;
    return;
  }

  const chips = years.map(y => {
    const active = (y === selectedYear) ? " is-active" : "";
    return `<button class="yearchip${active}" data-year="${safeHTML(y)}">${safeHTML(y)}年</button>`;
  }).join("");

  yearbarEl.innerHTML = chips;

  yearbarEl.onclick = (e) => {
    // 通常タップは年切替
    if (selectMode) return; // 選択中は切替しない（事故防止）
    const btn = e.target.closest(".yearchip");
    if (!btn) return;
    selectedYear = String(btn.dataset.year);
    renderYearbar();
    renderCurrentYear();
  };
}

// ---------------------
// Render: Current Year
// ---------------------
function renderCurrentYear() {
  if (!galleryEl) return;

  const years = getYearsFromAllItems();
  if (years.length === 0) {
    galleryEl.innerHTML = `<div class="gallery-empty">保存した画像がここに表示されます</div>`;
    return;
  }
  if (!selectedYear) selectedYear = years[0];

  const items = allItems.filter(it => yearKey(it.createdAt) === selectedYear);

  const monthMap = groupByMonthAndDay(items);
  const months = [...monthMap.keys()].sort().reverse();

  const targetMonth = months.find(m => m.endsWith("-01")) || months[0];
  const monthList = targetMonth ? [targetMonth] : [];

  const monthSections = monthList.map((ym) => {
    const dayMap = monthMap.get(ym);
    const days = [...dayMap.keys()].sort().reverse();

    const daySections = days.map((dayKeyStr) => {
      const arr = dayMap.get(dayKeyStr);
      const label = dateLabelFromKey(dayKeyStr);

      const thumbs = arr.map((it) => {
        const url = it.thumbUrl;
        const id = safeHTML(it.id);
        return `
          <div class="gitem" data-id="${id}">
            <img src="${safeHTML(url)}" alt="thumb" />
            <div class="gcheck" aria-hidden="true">✓</div>
          </div>
        `;
      }).join("");

      // 日付summaryにもチェック付ける（まとめ選択用）
      return `
        <details class="gsection" data-date="${safeHTML(dayKeyStr)}">
          <summary class="gsummary">
            <div class="gmeta">
              <div class="gdate">${label}</div>
            </div>
            <div class="gsummary-check" aria-hidden="true">✓</div>
            <div class="gchev">▼</div>
          </summary>
          <div class="ggrid">
            ${thumbs}
          </div>
        </details>
      `;
    }).join("");

    // 月summaryにもチェック
    return `
      <details class="gmonth" open data-month="${safeHTML(ym)}">
        <summary class="gsummary gsummary-month">
          <div class="gmeta">
            <div class="gdate">${ym.split("-")[1]}</div>
          </div>
          <div class="gsummary-check" aria-hidden="true">✓</div>
          <div class="gchev">▼</div>
        </summary>
        <div class="gmonth-body">
          ${daySections}
        </div>
      </details>
    `;
  }).join("");

  galleryEl.innerHTML = monthSections;

  bindAccordion();
  bindPressAndClicks();
  refreshSelectionMarks();
  renderTopbarRight();
}

// ---------------------
// Accordion behavior
// ---------------------
function bindAccordion() {
  if (!galleryEl) return;

  galleryEl.querySelectorAll(".gmonth").forEach((monthDetails) => {
    monthDetails.addEventListener("toggle", () => {
      if (!monthDetails.open) return;
      galleryEl.querySelectorAll(".gmonth").forEach((d) => { if (d !== monthDetails) d.open = false; });
    });
  });

  galleryEl.querySelectorAll(".gsection").forEach((dayDetails) => {
    dayDetails.addEventListener("toggle", () => {
      if (!dayDetails.open) return;
      const monthBody = dayDetails.closest(".gmonth-body") || galleryEl;
      monthBody.querySelectorAll(".gsection").forEach((d) => { if (d !== dayDetails) d.open = false; });
    });
  });
}

// ---------------------
// Overlay (full view) : ✖ でしか閉じない
// ---------------------
function createOverlayIfNeeded() {
  if (document.getElementById("overlay")) return;

  const el = document.createElement("div");
  el.id = "overlay";
  el.className = "overlay hidden";
  el.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); });

  el.innerHTML = `
    <div class="overlay-box" role="dialog" aria-modal="true">
      <button class="overlay-close" id="overlayClose" aria-label="閉じる">✕</button>
      <div class="overlay-body">
        <img id="overlayImg" alt="full" />
      </div>
    </div>
  `;

  document.body.appendChild(el);
  document.getElementById("overlayClose").addEventListener("click", closeOverlay);

  window.addEventListener("keydown", (e) => {
    if (!overlayOpen) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); }
  }, { capture: true });
}

async function openOverlayById(id) {
  createOverlayIfNeeded();
  overlayOpen = true;

  const overlay = document.getElementById("overlay");
  const img = document.getElementById("overlayImg");

  overlay.classList.remove("hidden");
  document.body.classList.add("overlay-open");
  img.removeAttribute("src");

  const item = await getGalleryItem(id);
  if (!item?.fullUrl) {
    closeOverlay();
    alert("画像の取得に失敗しました");
    return;
  }

  img.src = item.fullUrl;
}

function closeOverlay() {
  overlayOpen = false;
  const overlay = document.getElementById("overlay");
  const img = document.getElementById("overlayImg");
  if (img) img.removeAttribute("src");
  if (overlay) overlay.classList.add("hidden");
  document.body.classList.remove("overlay-open");
}

// ---------------------
// Selection marks
// ---------------------
function refreshSelectionMarks() {
  // 画像チェック
  document.querySelectorAll(".gitem").forEach((el) => {
    const id = String(el.dataset.id);
    const on = selectMode && selectedIds.has(id);
    el.classList.toggle("is-selected", on);
    el.classList.toggle("selectable", selectMode);
  });

  // summary（見た目だけ。実際の選択は長押しハンドラでまとめ処理）
  document.querySelectorAll(".gsummary, .gsummary-month").forEach((sum) => {
    sum.classList.toggle("selectable", selectMode);
  });
}

// ---------------------
// Long press + click binding
// ---------------------
function bindPressAndClicks() {
  // 通常タップ：画像はオーバーレイ（選択モードならチェック）
  galleryEl.onclick = async (e) => {
    const item = e.target.closest(".gitem");
    if (!item) return;

    const id = String(item.dataset.id);

    if (selectMode) {
      toggleSelected(id);
      return;
    }

    try {
      await openOverlayById(id);
    } catch (err) {
      console.error(err);
      alert(`表示に失敗しました\n${err?.message || err}`);
    }
  };

  // 長押し：画像/日付/月/年
  installLongPress(galleryEl, (target) => {
    // 画像
    const item = target.closest?.(".gitem");
    if (item) {
      enterSelectMode();
      toggleSelected(String(item.dataset.id));
      return;
    }

    // 日付（その日まとめて）
    const daySummary = target.closest?.(".gsection > summary");
    if (daySummary) {
      const section = daySummary.closest(".gsection");
      const dayKeyStr = section?.dataset?.date;
      if (!dayKeyStr) return;

      enterSelectMode();

      // その日配下の画像IDを全部
      const ids = [...section.querySelectorAll(".gitem")].map(x => String(x.dataset.id));
      bulkToggle(ids);
      return;
    }

    // 月（その月まとめて）
    const monthSummary = target.closest?.(".gmonth > summary");
    if (monthSummary) {
      const month = monthSummary.closest(".gmonth");
      if (!month) return;

      enterSelectMode();

      const ids = [...month.querySelectorAll(".gitem")].map(x => String(x.dataset.id));
      bulkToggle(ids);
      return;
    }

    // 年（表示中の年を全部）
    const yearChip = target.closest?.(".yearchip");
    const yearFixed = target.closest?.(".yearfixed");
    const y = yearChip?.dataset?.year || yearFixed?.dataset?.year;
    if (y) {
      enterSelectMode();
      const ids = allItems
        .filter(it => yearKey(it.createdAt) === String(y))
        .map(it => String(it.id));
      bulkToggle(ids);
    }
  });

  // yearbarの長押しも拾えるように（yearbar要素にも）
  installLongPress(yearbarEl, (target) => {
    const yearChip = target.closest?.(".yearchip");
    const yearFixed = target.closest?.(".yearfixed");
    const y = yearChip?.dataset?.year || yearFixed?.dataset?.year;
    if (!y) return;

    enterSelectMode();
    const ids = allItems
      .filter(it => yearKey(it.createdAt) === String(y))
      .map(it => String(it.id));
    bulkToggle(ids);
  });
}

function bulkToggle(ids) {
  // 全部選択されてたら解除、そうでなければ全選択
  const allOn = ids.length > 0 && ids.every(id => selectedIds.has(id));
  if (allOn) ids.forEach(id => selectedIds.delete(id));
  else ids.forEach(id => selectedIds.add(id));

  renderTopbarRight();
  refreshSelectionMarks();
}

// 長押し検出（背景スクロールや誤作動を減らす）
function installLongPress(root, onFire) {
  if (!root) return;

  let timer = null;
  let startX = 0;
  let startY = 0;
  let fired = false;

  const HOLD_MS = 450;
  const MOVE_TOL = 10;

  root.addEventListener("pointerdown", (e) => {
    fired = false;
    startX = e.clientX;
    startY = e.clientY;

    timer = setTimeout(() => {
      fired = true;
      try { onFire(e.target); } catch {}
    }, HOLD_MS);
  });

  root.addEventListener("pointermove", (e) => {
    if (!timer) return;
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    if (dx > MOVE_TOL || dy > MOVE_TOL) {
      clearTimeout(timer);
      timer = null;
    }
  });

  const end = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  root.addEventListener("pointerup", end);
  root.addEventListener("pointercancel", end);
  root.addEventListener("pointerleave", end);

  // 長押し発火した直後のclickを抑制したい場合はここで対処できる
}

// ---------------------
// Delete action
// ---------------------
async function onDeleteSelected() {
  if (selectedIds.size === 0) return;

  if (!confirm(`${selectedIds.size}件を削除しますか？`)) return;

  for (const id of selectedIds) {
    await deleteGalleryItem(id);
  }

  await loadAllItems();
  exitSelectMode();
}

// ---------------------
// Data loading
// ---------------------
async function loadAllItems() {
  const rows = await listGallery(3650);

  allItems = (rows || []).map((r) => ({
    id: r.id,
    createdAt: new Date(r.created_at).getTime(),
    thumbUrl: r.thumbUrl,
    meta: r.meta || {},
  }));

  const years = getYearsFromAllItems();
  if (years.length === 0) {
    selectedYear = null;
  } else if (!selectedYear || !years.includes(selectedYear)) {
    selectedYear = years[0];
  }

  renderYearbar();
  renderCurrentYear();
  renderTopbarRight();
}

// init
loadAllItems();
