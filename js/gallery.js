import { listGallery, deleteGalleryItem } from "./db.js";

const galleryEl = document.getElementById("gallery");
const yearbarEl = document.getElementById("yearbar");

const selectBtn = document.getElementById("selectModeBtn");
const deleteBtn = document.getElementById("deleteSelectedBtn");

// ---------------------
// State
// ---------------------
let selectMode = false;
const selected = new Set();

let selectedYear = null; // 表示する年（フッターで切替）
let objectUrls = [];     // createObjectURL 管理（再描画で解放）

// データ保持（年切替のために一度読み込む）
let allItems = [];

// ---------------------
// Utils
// ---------------------
function pad2(n) { return String(n).padStart(2, "0"); }

function dateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; // YYYY-MM-DD
}
function ymKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; // YYYY-MM
}
function yearKey(ts) { return String(new Date(ts).getFullYear()); }

function dateLabelFromKey(key) {
  const [, mm, dd] = key.split("-");
  return `${mm}/${dd}`;
}
function ymLabel(key) {
  const [y, m] = key.split("-");
  return `${y}年${m}月`;
}
function timeLabel(ts) {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function safeHTML(s) {
  return String(s).replace(/[&<>"']/g, (m) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]
  ));
}

function revokeAllObjectUrls() {
  for (const u of objectUrls) {
    try { URL.revokeObjectURL(u); } catch {}
  }
  objectUrls = [];
}

// ---------------------
// UI helpers
// ---------------------
function updateTopbarUI() {
  if (selectBtn) selectBtn.textContent = selectMode ? "完了" : "選択";

  if (deleteBtn) {
    deleteBtn.disabled = selected.size === 0;
    deleteBtn.textContent = selected.size ? `削除(${selected.size})` : "削除";
  }
}

function setSelectMode(v) {
  selectMode = v;
  selected.clear();
  updateTopbarUI();
  // 選択表示反映のため再描画
  renderCurrentYear();
}

function setYear(y) {
  if (selectedYear === y) return;

  selectedYear = y;
  // 年を変えたら選択は解除（事故防止）
  selectMode = false;
  selected.clear();
  updateTopbarUI();

  renderYearbar();
  renderCurrentYear();
}

// ---------------------
// Data grouping
// ---------------------
function groupByMonthAndDay(items) {
  // monthMap: YYYY-MM -> dayMap
  const monthMap = new Map();

  for (const it of items) {
    const ym = ymKey(it.createdAt);
    const d = dateKey(it.createdAt);

    if (!monthMap.has(ym)) monthMap.set(ym, new Map());
    const dayMap = monthMap.get(ym);

    if (!dayMap.has(d)) dayMap.set(d, []);
    dayMap.get(d).push(it);
  }

  // sort inside each day (newest first)
  for (const [, dayMap] of monthMap) {
    for (const [, arr] of dayMap) {
      arr.sort((a, b) => b.createdAt - a.createdAt);
    }
  }

  return monthMap;
}

function getYearsFromAllItems() {
  const set = new Set(allItems.map(it => yearKey(it.createdAt)));
  return [...set].sort().reverse(); // newest year first
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

  // selectedYear が未設定なら最新年
  if (!selectedYear) selectedYear = years[0];

  // ★ 年が1個なら「固定表示」にする（でも出す！）
  if (years.length === 1) {
    yearbarEl.innerHTML = `<div class="yearfixed">${safeHTML(years[0])}</div>`;
    return;
  }

  const chips = years.map(y => {
    const active = (y === selectedYear) ? " is-active" : "";
    return `<button class="yearchip${active}" data-year="${safeHTML(y)}">${safeHTML(y)}年</button>`;
  }).join("");

  yearbarEl.innerHTML = chips;

  yearbarEl.onclick = (e) => {
    const btn = e.target.closest(".yearchip");
    if (!btn) return;
    setYear(String(btn.dataset.year));
  };
}

// ---------------------
// Render: Current Year (Month -> Day)
// ---------------------
function renderCurrentYear() {
  if (!galleryEl) return;

  revokeAllObjectUrls();

  const years = getYearsFromAllItems();
  if (years.length === 0) {
    galleryEl.innerHTML = `<div class="gallery-empty">保存した画像がここに表示されます</div>`;
    return;
  }
  if (!selectedYear) selectedYear = years[0];

  // 選択中の年だけに絞る
  const items = allItems.filter(it => yearKey(it.createdAt) === selectedYear);

  // 月→日グルーピング
  const monthMap = groupByMonthAndDay(items);
  const months = [...monthMap.keys()].sort().reverse();

  // ★ 月を1つだけ使う（最新 or 1月固定）
  const targetMonth = months.find(m => m.endsWith("-01")) || months[0]; // 1月優先
  const monthList = targetMonth ? [targetMonth] : [];

  const monthSections = monthList.map((ym) => {
    const dayMap = monthMap.get(ym);
    const days = [...dayMap.keys()].sort().reverse();

    const daySections = days.map((dayKeyStr) => {
      const arr = dayMap.get(dayKeyStr);
      const label = dateLabelFromKey(dayKeyStr);

      const thumbs = arr.map((it) => {
        const url = URL.createObjectURL(it.thumbBlob);
        objectUrls.push(url);

        const t = timeLabel(it.createdAt);
        const id = safeHTML(it.id);

        const isSel = selected.has(String(it.id));
        const selClass = isSel ? " is-selected" : "";

        return `
          <div class="gitem${selClass}" data-id="${id}" title="${safeHTML(dayKeyStr)} ${t}">
            <img src="${url}" alt="thumb" />
            <div class="gtime">${t}</div>
          </div>
        `;
      }).join("");

      return `
        <details class="gsection">
          <summary class="gsummary">
            <div class="gmeta">
              <div class="gdate">${label}</div>
            </div>
            <div class="gchev">▼</div>
          </summary>
          <div class="ggrid">
            ${thumbs}
          </div>
        </details>
      `;
    }).join("");

    return `
      <details class="gmonth" open>
        <summary class="gsummary gsummary-month">
          <div class="gmeta">
            <div class="gdate">${ym.split("-")[1]}</div>
          </div>
          <div class="gchev">▼</div>
        </summary>
        <div class="gmonth-body">
          ${daySections}
        </div>
      </details>
    `;
  }).join("");

  galleryEl.innerHTML = monthSections;

  // イベントを付け直す
  bindGalleryEvents();
  bindAccordion();
  updateTopbarUI();
}

// ---------------------
// Accordion behavior
// 月：開いたら他の月は閉じる
// 日：開いたら同じ月の他の日は閉じる
// ---------------------
function bindAccordion() {
  if (!galleryEl) return;

  galleryEl.querySelectorAll(".gmonth").forEach((monthDetails) => {
    monthDetails.addEventListener("toggle", () => {
      if (!monthDetails.open) return;

      galleryEl.querySelectorAll(".gmonth").forEach((d) => {
        if (d !== monthDetails) d.open = false;
      });
    });
  });

  galleryEl.querySelectorAll(".gsection").forEach((dayDetails) => {
    dayDetails.addEventListener("toggle", () => {
      if (!dayDetails.open) return;

      const monthBody = dayDetails.closest(".gmonth-body") || galleryEl;
      monthBody.querySelectorAll(".gsection").forEach((d) => {
        if (d !== dayDetails) d.open = false;
      });
    });
  });
}

// ---------------------
// Gallery interactions
// ---------------------
function toggleSelect(itemEl, id) {
  if (selected.has(id)) {
    selected.delete(id);
    itemEl.classList.remove("is-selected");
  } else {
    selected.add(id);
    itemEl.classList.add("is-selected");
  }
  updateTopbarUI();
}

function bindGalleryEvents() {
  if (!galleryEl) return;

  galleryEl.onclick = (e) => {
    const item = e.target.closest(".gitem");
    if (!item) return;

    const id = String(item.dataset.id);

    if (selectMode) {
      toggleSelect(item, id);
      return;
    }

    window.location.href = `gallery.html?id=${encodeURIComponent(id)}`;
  };

  // 長押しで選択モード（スマホ）
  let pressTimer = null;
  let pressTarget = null;

  const startPress = (ev) => {
    const item = ev.target.closest(".gitem");
    if (!item) return;

    pressTarget = item;
    if (selectMode) return;

    pressTimer = setTimeout(() => {
      selectMode = true;
      selected.clear();
      const id = String(pressTarget.dataset.id);
      toggleSelect(pressTarget, id);
      updateTopbarUI();
    }, 450);
  };

  const endPress = () => {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
    pressTarget = null;
  };

  galleryEl.onpointerdown = startPress;
  galleryEl.onpointerup = endPress;
  galleryEl.onpointercancel = endPress;
  galleryEl.onpointerleave = endPress;
}

// ---------------------
// Topbar actions
// ---------------------
selectBtn?.addEventListener("click", () => {
  setSelectMode(!selectMode);
});

deleteBtn?.addEventListener("click", async () => {
  if (selected.size === 0) return;

  if (!confirm(`${selected.size}件を削除しますか？`)) return;

  for (const id of selected) {
    await deleteGalleryItem(id);
  }

  // データを再取得してUI更新
  await loadAllItems();
  setSelectMode(false);
});

// ---------------------
// Data loading
// ---------------------
async function loadAllItems() {
  // たくさんあっても年で切替できるので上限は大きめ
  allItems = await listGallery(3650);

  // 年が消えた/変わった時の保険
  const years = getYearsFromAllItems();
  if (years.length === 0) {
    selectedYear = null;
  } else if (!selectedYear || !years.includes(selectedYear)) {
    selectedYear = years[0];
  }

  renderYearbar();
  renderCurrentYear();
}

// unload: objectURL解放
window.addEventListener("beforeunload", revokeAllObjectUrls);

// init
loadAllItems();
