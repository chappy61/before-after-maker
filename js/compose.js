// js/compose.js (cover unified)
// ------------------------------------------------------------
// Export PNG that matches Edit preview (cover basis)
// - Supabase signed URL is cross-origin -> fetch as Blob -> blob: URL to avoid tainted canvas
// ------------------------------------------------------------

import { coverDrawTransformed } from "./image.js";
import { makeGridTemplate } from "./layout.js";
import { getSignedUrl } from "./storage.js";

function roundedRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function isHttpUrl(s) {
  return typeof s === "string" && /^https?:\/\//i.test(s);
}

function isDataUrl(s) {
  return typeof s === "string" && /^data:/i.test(s);
}

function drawLabelText(ctx, text, x, y, opt = {}) {
  const color = opt.color || "#fff";
  const size = opt.size ?? 80;

  ctx.save();
  ctx.font = `600 ${size}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = color;

  ctx.shadowColor = color === "#000" ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;

  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * Load image safely for canvas export.
 * - If src is storage path: create signed URL then fetch blob
 * - If src is http(s): fetch blob
 * - If src is dataURL: use directly
 * Returns { img, revoke } where revoke() should be called after use.
 */
async function loadImageForCanvas(src, expiresSec = 600) {
  const img = new Image();

  // dataURL はそのままOK
  if (isDataUrl(src)) {
    img.src = src;
    await img.decode();
    return { img, revoke: null };
  }

  // URL or storage path -> resolve to URL
  const url = isHttpUrl(src) ? src : await getSignedUrl(src, expiresSec);

  // ここが重要：fetchして blob: に変換（canvas taint回避）
  const res = await fetch(url, { mode: "cors", cache: "no-store" });
  if (!res.ok) throw new Error(`image fetch failed: ${res.status} ${res.statusText}`);
  const blob = await res.blob();

  const blobUrl = URL.createObjectURL(blob);
  img.src = blobUrl;
  await img.decode();

  return { img, revoke: () => URL.revokeObjectURL(blobUrl) };
}

export async function composePNG(p, options) {
  const ratio = options?.ratio || "4:5";

  // labels (items方式)
  const optLabels = options?.labels ?? {};
  const projLabels = p.labels ?? {};

  const labels = {
    enabled: optLabels.enabled ?? projLabels.enabled ?? true,
    offsetX: optLabels.offsetX ?? projLabels.offsetX ?? 0,
    offsetY: optLabels.offsetY ?? projLabels.offsetY ?? 0,
    items: Array.isArray(optLabels.items)
      ? optLabels.items
      : Array.isArray(projLabels.items)
      ? projLabels.items
      : null,
  };

  const W = 1080;
  const H = ratio === "1:1" ? 1080 : 1350;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // layout fixed
  const PAD = 12;
  const GAP = 12;

  const gridX = PAD;
  const gridY = PAD;
  const gridW = Math.max(1, W - PAD * 2);
  const gridH = Math.max(1, H - PAD * 2);

  // need 2 images
  const need = 2;
  if ((p.images?.length || 0) < need) throw new Error("画像が不足しています（2枚必要）");

  // load images (safe for canvas)
  const imgs = [];
  const revokers = [];
  try {
    for (let i = 0; i < need; i++) {
      const { img, revoke } = await loadImageForCanvas(p.images[i], 600);
      imgs.push(img);
      if (revoke) revokers.push(revoke);
    }

    // cell calc
    const layout = p.layout || "split_lr";
    let cols = 2,
      rows = 1;

    if (layout === "split_tb") {
      cols = 1;
      rows = 2;
    } else if (layout === "split_lr") {
      cols = 2;
      rows = 1;
    } else {
      const legacy = makeGridTemplate(Number(p.count || 2), layout);
      cols = legacy.cols;
      rows = legacy.rows;
    }

    const total = cols * rows;
    const cellW = Math.max(1, (gridW - GAP * (cols - 1)) / cols);
    const cellH = Math.max(1, (gridH - GAP * (rows - 1)) / rows);

    // draw cells
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = gridX + c * (cellW + GAP);
        const y = gridY + r * (cellH + GAP);
        const rad = Math.min(26, cellW / 6, cellH / 6);

        ctx.save();
        roundedRectPath(ctx, x, y, cellW, cellH, rad);
        ctx.clip();

        const raw = p.edits?.[idx] || { x: 0, y: 0, scale: 1, rotate: 0 };

        // 編集pane(px) → 出力cell(px)
        const bw = raw.baseW || cellW;
        const bh = raw.baseH || cellH;
        const fx = cellW / bw;
        const fy = cellH / bh;

        const edit = {
          x: (raw.x || 0) * fx,
          y: (raw.y || 0) * fy,
          rotate: raw.rotate || 0,
          scale: raw.scale ?? 1, // ユーザー倍率そのまま
        };

        // ===== Editのpane比率に合わせてcellを再計算 =====
        const bw2 = raw.baseW || cellW;
        const bh2 = raw.baseH || cellH;
        const paneAR = bw2 / bh2;

        // cellW基準で高さ決定（Editと同じ比率）
        let drawCellW = cellW;
        let drawCellH = drawCellW / paneAR;

        // 高さはみ出すなら高さ基準に切替
        if (drawCellH > cellH) {
          drawCellH = cellH;
          drawCellW = drawCellH * paneAR;
        }

        // 中央寄せ
        const cx = x + (cellW - drawCellW) / 2;
        const cy = y + (cellH - drawCellH) / 2;

        // ===== 描画 =====
coverDrawTransformed(ctx, imgs[idx], cx, cy, drawCellW, drawCellH, edit);

        ctx.restore();

        idx++;
        if (idx >= need) break;
      }
      if (idx >= need) break;
    }

    // labels
    if (labels.enabled && total === 2) {
      function resolveItem(i) {
        const it = labels.items?.[i];
        if (it && typeof it.x === "number" && typeof it.y === "number") {
          return {
            x: clamp01(it.x),
            y: clamp01(it.y),
            color: it.color === "#000" || it.color === "black" ? "#000" : "#fff",
          };
        }
        return { x: 0.06, y: 0.06, color: "#fff" };
      }

      function drawAtCell(text, cellLeft, cellTop, cw, ch, i) {
        const it = resolveItem(i);
        const ox = Number(labels.offsetX || 0);
        const oy = Number(labels.offsetY || 0);

        const size = 80;
        const font = `600 ${size}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif`;

        let tx = cellLeft + it.x * cw + ox;
        let ty = cellTop + it.y * ch + oy;

        // keep in bounds
        const pad = 12;
        ctx.save();
        ctx.font = font;
        const tw = ctx.measureText(text).width;
        ctx.restore();

        tx = Math.max(cellLeft + pad, Math.min(cellLeft + cw - pad - tw, tx));
        ty = Math.max(cellTop + pad, Math.min(cellTop + ch - pad - size, ty));

        drawLabelText(ctx, text, tx, ty, { color: it.color, size });
      }

      const cell0 = { x: gridX, y: gridY, w: cellW, h: cellH };

      if (cols === 2) {
        const cell1 = { x: gridX + (cellW + GAP), y: gridY, w: cellW, h: cellH };
        drawAtCell("before", cell0.x, cell0.y, cell0.w, cell0.h, 0);
        drawAtCell("after", cell1.x, cell1.y, cell1.w, cell1.h, 1);
      } else {
        const cell1 = { x: gridX, y: gridY + (cellH + GAP), w: cellW, h: cellH };
        drawAtCell("before", cell0.x, cell0.y, cell0.w, cell0.h, 0);
        drawAtCell("after", cell1.x, cell1.y, cell1.w, cell1.h, 1);
      }
    }

    // ✅ これで tainted 回避できて toDataURL が通る
    return canvas.toDataURL("image/png");
  } finally {
    // blob: URL を掃除
    for (const r of revokers) r();
  }
}
