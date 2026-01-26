import { coverDraw, coverDrawTransformed } from "./image.js";
// makeGridTemplate は “旧レイアウト互換” のために残してもOK
import { makeGridTemplate } from "./layout.js";

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

function drawTitle(ctx, text, W, y) {
  ctx.save();
  ctx.clearRect(0, 0, W, H);                 // まず透明にする（重要）
  ctx.fillStyle = "rgba(255,255,255,0.72)";  // ←透明感ある白（0.6〜0.85で調整）
  ctx.fillRect(0, 0, W, H);
  ctx.font = "800 46px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, y);
  ctx.restore();
}


function drawLabelText(ctx, text, x, y, opt = {}) {
  const color = opt.color || "#fff";
  const size = opt.size ?? 80;

  ctx.save();
  ctx.font = `600 ${size}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = color;

  // 背景なしの視認性UP（いらなければ消してOK）
  ctx.shadowColor = color === "#000" ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;

  ctx.fillText(text, x, y);
  ctx.restore();
}



function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

export async function composePNG(p, options) {
  const ratio = options?.ratio || "4:5";
  const title = options?.title || "施術前後写真";

  // ------------------------------------------------------------
  // labels: edit.js 互換（items方式）
  // ------------------------------------------------------------
  const optLabels = options?.labels ?? {};
  const projLabels = p.labels ?? {};

  const labels = {
    enabled: optLabels.enabled ?? projLabels.enabled ?? true,

    offsetX: optLabels.offsetX ?? projLabels.offsetX ?? 0,
    offsetY: optLabels.offsetY ?? projLabels.offsetY ?? 0,

    // 新：items[] = [{x,y,color}]
    items: Array.isArray(optLabels.items)
      ? optLabels.items
      : Array.isArray(projLabels.items)
      ? projLabels.items
      : null,

    // 旧の pos(before/after) を受けた場合の保険（互換）
    pos: optLabels.pos ?? projLabels.pos ?? null,
  };

  const W = 1080;
  const H = ratio === "1:1" ? 1080 : 1350;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // レイアウト固定値

  const PAD = 12;
  const HEADER_H = 0;   // ★タイトル使わないなら0
  const GAP = 12;

  const GRID_TOP = PAD + HEADER_H;
  const GRID_BOTTOM = H - PAD;

  const gridX = PAD;
  const gridY = GRID_TOP;
  const gridW = Math.max(1, W - PAD * 2);
  const gridH = Math.max(1, GRID_BOTTOM - GRID_TOP);

  // 画像読み込み（2枚前提）
  const need = 2;
  if ((p.images?.length || 0) < need) throw new Error("画像が不足しています（2枚必要）");

  const imgs = [];
  for (let i = 0; i < need; i++) {
    const im = new Image();
    im.src = p.images[i];
    await im.decode();
    imgs.push(im);
  }

  // セルの計算（split_lr / split_tb を優先）
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
    // 旧互換
    const legacy = makeGridTemplate(Number(p.count || 2), layout);
    cols = legacy.cols;
    rows = legacy.rows;
  }

  const total = cols * rows;
  const cellW = Math.max(1, (gridW - GAP * (cols - 1)) / cols);
  const cellH = Math.max(1, (gridH - GAP * (rows - 1)) / rows);

  // 背景やタイトルを入れたいならここ（今はあなたの仕様に合わせて無しでもOK）
  // drawTitle(ctx, title, W, PAD + HEADER_H / 2);

  // セル描画
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

      // ✅ Edit画面の基準サイズ（保存されてなければ「変換なし」）
      const bw = raw.baseW || cellW;
      const bh = raw.baseH || cellH;

      // ✅ 出力セルサイズへの倍率
      const fx = cellW / bw;
      const fy = cellH / bh;

      // ✅ 出力用 edit（x/y をスケール変換）
      const edit = {
        ...raw,
        x: (raw.x || 0) * fx,
        y: (raw.y || 0) * fy,
      };

      if (edit && (edit.x || edit.y || edit.rotate || edit.scale !== 1)) {
        coverDrawTransformed(ctx, imgs[idx], x, y, cellW, cellH, edit);
      } else {
        coverDraw(ctx, imgs[idx], x, y, cellW, cellH);
      }

      ctx.restore();

      idx++;
      if (idx >= need) break;
    }
    if (idx >= need) break;
  }

    // ------------------------------------------------------------
    // Label draw (before/after) for total===2
    // text only, color: #fff / #000, position from labels.items[i]
    // ------------------------------------------------------------
    if (labels.enabled && total === 2) {
      function resolveItem(i) {
        const it = labels.items?.[i];
        if (it && typeof it.x === "number" && typeof it.y === "number") {
          return {
            x: clamp01(it.x),
            y: clamp01(it.y),
            color: (it.color === "#000" || it.color === "black") ? "#000" : "#fff",
          };
        }
        // fallback
        return { x: 0.06, y: 0.06, color: "#fff" };
      }

      function drawAtCell(text, cellLeft, cellTop, cellW, cellH, i) {
      const it = resolveItem(i);
      const ox = Number(labels.offsetX || 0);
      const oy = Number(labels.offsetY || 0);

      const size = 80;
      const font =
        `600 ${size}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif`;

      // まず理想座標（セル内%）
      let x = cellLeft + it.x * cellW + ox;
      let y = cellTop + it.y * cellH + oy;

      // 文字サイズを測って “セルからはみ出さない” ように調整
      const pad = 12;
      ctx.save();
      ctx.font = font;
      const tw = ctx.measureText(text).width;
      ctx.restore();

      x = Math.max(cellLeft + pad, Math.min(cellLeft + cellW - pad - tw, x));
      y = Math.max(cellTop + pad, Math.min(cellTop + cellH - pad - size, y));

      drawLabelText(ctx, text, x, y, { color: it.color, size });
    }
      const cell0 = { x: gridX, y: gridY, w: cellW, h: cellH };

      if (cols === 2) {
        const cell1 = { x: gridX + (cellW + GAP), y: gridY, w: cellW, h: cellH };
        drawAtCell("before", cell0.x, cell0.y, cell0.w, cell0.h, 0);
        drawAtCell("after",  cell1.x, cell1.y, cell1.w, cell1.h, 1);
      } else {
        const cell1 = { x: gridX, y: gridY + (cellH + GAP), w: cellW, h: cellH };
        drawAtCell("before", cell0.x, cell0.y, cell0.w, cell0.h, 0);
        drawAtCell("after",  cell1.x, cell1.y, cell1.w, cell1.h, 1);
      }
    }

  return canvas.toDataURL("image/png");
}
