// js/compose.js (preview-aligned export)
// ------------------------------------------------------------
// Export PNG that matches Edit preview as closely as possible
// - Uses the same "cell/pane" basis for x/y/scale/rotate as edit.js
// - Avoids extra x/y rescaling on save
// - Supabase signed URL is cross-origin -> fetch as Blob -> blob: URL
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

  ctx.shadowColor =
    color === "#000" ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)";
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

  if (isDataUrl(src)) {
    img.src = src;
    await img.decode();
    return { img, revoke: null };
  }

  const url = isHttpUrl(src) ? src : await getSignedUrl(src, expiresSec);

  const res = await fetch(url, { mode: "cors", cache: "no-store" });
  if (!res.ok) {
    throw new Error(`image fetch failed: ${res.status} ${res.statusText}`);
  }

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);

  img.src = blobUrl;
  await img.decode();

  return { img, revoke: () => URL.revokeObjectURL(blobUrl) };
}

function resolveLayout(p, need) {
  if (p.layout && typeof p.layout === "object") {
    const cols = Number(p.layout.cols || 0) || 1;
    const rows = Number(p.layout.rows || 0) || 1;
    return { cols, rows };
  }

  const layout = p.layout || "split_lr";
  if (layout === "split_tb") return { cols: 1, rows: 2 };
  if (layout === "split_lr") return { cols: 2, rows: 1 };

  const legacy = makeGridTemplate(Number(p.count || need), layout);
  return { cols: legacy.cols, rows: legacy.rows };
}

function labelTextLocal(labels, need, i) {
  const t = labels.items?.[i]?.text;
  if (typeof t === "string" && t.trim() !== "") return t.trim();

  if (need === 2) return i === 0 ? "before" : "after";
  return `#${i + 1}`;
}

function resolveLabelItem(labels, i) {
  const it = labels.items?.[i];
  const rawSize = Number(it?.size);

  return {
    x: typeof it?.x === "number" ? clamp01(it.x) : 0.06,
    y: typeof it?.y === "number" ? clamp01(it.y) : 0.06,
    color: it?.color === "#000" || it?.color === "black" ? "#000" : "#fff",
    size: Number.isFinite(rawSize) ? rawSize : 18,
  };
}

export async function composePNG(p, options) {
  const ratio = options?.ratio || "4:5";

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
        : [],
  };

  const W = 1080;
  const H = ratio === "1:1" ? 1080 : 1350;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas context を取得できませんでした");

  const PAD = 12;
  const GAP = 12;

  const gridX = PAD;
  const gridY = PAD;
  const gridW = Math.max(1, W - PAD * 2);
  const gridH = Math.max(1, H - PAD * 2);

  const need = Math.min(6, p.images?.length || 0);
  if (need < 2) throw new Error("画像が不足しています（2枚以上必要）");

  const imgs = [];
  const revokers = [];

  try {
    for (let i = 0; i < need; i++) {
      const { img, revoke } = await loadImageForCanvas(p.images[i], 600);
      imgs.push(img);
      if (revoke) revokers.push(revoke);
    }

    const { cols, rows } = resolveLayout(p, need);

    const cellW = Math.max(1, (gridW - GAP * (cols - 1)) / cols);
    const cellH = Math.max(1, (gridH - GAP * (rows - 1)) / rows);

    // ============================================================
    // Images
    // - Save side now uses the exact cell as the pane basis.
    // - No extra fx/fy rescaling of x/y.
    // ============================================================
    for (let i = 0; i < need; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;

      const x = gridX + c * (cellW + GAP);
      const y = gridY + r * (cellH + GAP);

      ctx.save();
      roundedRectPath(ctx, x, y, cellW, cellH, 0);
      ctx.clip();

      const raw = p.edits?.[i] || { x: 0, y: 0, scale: 1, rotate: 0 };

      coverDrawTransformed(ctx, imgs[i], x, y, cellW, cellH, {
        x: raw.x || 0,
        y: raw.y || 0,
        rotate: raw.rotate || 0,
        scale: raw.scale ?? 1,
      });

      ctx.restore();
    }

    // ============================================================
    // Labels
    // - Draw against the same full cell basis as the image/pane.
    // ============================================================
    if (labels.enabled) {
      const ox = Number(labels.offsetX || 0);
      const oy = Number(labels.offsetY || 0);

      for (let i = 0; i < need; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;

        const cellLeft = gridX + c * (cellW + GAP);
        const cellTop = gridY + r * (cellH + GAP);

        const frameLeft = cellLeft;
        const frameTop = cellTop;
        const frameW = cellW;
        const frameH = cellH;

        const it = resolveLabelItem(labels, i);
        const text = labelTextLocal(labels, need, i);

        // edit.js の size はだいたい 18px 基準なので、書き出し時に拡大
        const sizeScale = need <= 2 ? 80 / 18 : need <= 4 ? 64 / 18 : 54 / 18;
        const size = Math.round(it.size * sizeScale);

        let tx = frameLeft + it.x * frameW + ox;
        let ty = frameTop + it.y * frameH + oy;

        const pad = 12;
        ctx.save();
        ctx.font = `600 ${size}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif`;
        const tw = ctx.measureText(text).width;
        ctx.restore();

        tx = Math.max(
          frameLeft + pad,
          Math.min(frameLeft + frameW - pad - tw, tx),
        );
        ty = Math.max(
          frameTop + pad,
          Math.min(frameTop + frameH - pad - size, ty),
        );

        drawLabelText(ctx, text, tx, ty, {
          color: it.color,
          size,
        });
      }
    }

    return canvas.toDataURL("image/png");
  } finally {
    for (const revoke of revokers) revoke();
  }
}
