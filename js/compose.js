import { themeToColor } from "./theme.js";
import { makeGridTemplate } from "./layout.js";
import { coverDraw } from "./image.js";

function roundedRectPath(ctx, x, y, w, h, r){
  const rr = Math.max(0, Math.min(r, w/2, h/2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawTitle(ctx, text, W, y){
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.font = "800 46px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W/2, y);
  ctx.restore();
}

function drawChip(ctx, text, x, y){
  ctx.save();
  ctx.font = "900 38px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.textBaseline = "alphabetic";
  const padX = 22, padY = 14;
  const tw = ctx.measureText(text).width;
  const th = 44;

  const bw = tw + padX*2;
  const bh = th + padY*2;

  roundedRectPath(ctx, x, y - bh, bw, bh, 999);
  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.fill();

  ctx.fillStyle = "#1a1a1a";
  ctx.fillText(text, x + padX, y - padY - 8);
  ctx.restore();
}

/**
 * p = {count, layout, theme, images[]}
 * options = { title: string, ratio: "4:5"|"1:1" }
 */
export async function composePNG(p, options){
  const ratio = options?.ratio || "4:5";
  const title = options?.title || "施術前後写真";

  const W = 1080;
  const H = (ratio === "1:1") ? 1080 : 1350;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // 背景
  ctx.fillStyle = themeToColor(p.theme || "green");
  ctx.fillRect(0, 0, W, H);

  // レイアウト（安全な固定値）
  const PAD = 40;              // 外枠余白
  const HEADER_H = 96;         // タイトル領域
  const GAP = 14;              // 画像間
  const GRID_TOP = PAD + HEADER_H;
  const GRID_BOTTOM = H - PAD;

  // タイトル
  drawTitle(ctx, title, W, PAD + HEADER_H/2);

  // グリッド領域（必ず正にする）
  const gridX = PAD;
  const gridY = GRID_TOP;
  const gridW = Math.max(1, W - PAD*2);
  const gridH = Math.max(1, GRID_BOTTOM - GRID_TOP);

  // cols/rows
  const count = Number(p.count || 2);
  const layout = p.layout || "vertical";
  const { cols, rows } = makeGridTemplate(count, layout);
  const total = cols * rows;

  // セルサイズ（必ず正にする）
  const cellW = Math.max(1, (gridW - GAP*(cols-1)) / cols);
  const cellH = Math.max(1, (gridH - GAP*(rows-1)) / rows);

  // 画像読み込み
  const imgs = [];
  for(let i=0;i<total;i++){
    const src = p.images?.[i];
    if(!src) throw new Error("画像が不足しています");
    const im = new Image();
    im.src = src;
    await im.decode();
    imgs.push(im);
  }

  // セル描画
  let idx = 0;
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const x = gridX + c*(cellW + GAP);
      const y = gridY + r*(cellH + GAP);
      const rad = Math.min(26, cellW/6, cellH/6);

      // clip
      ctx.save();
      roundedRectPath(ctx, x, y, cellW, cellH, rad);
      ctx.clip();
      coverDraw(ctx, imgs[idx], x, y, cellW, cellH);
      ctx.restore();

      // うっすら枠
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,.28)";
      ctx.lineWidth = 2;
      roundedRectPath(ctx, x, y, cellW, cellH, rad);
      ctx.stroke();
      ctx.restore();

      idx++;
    }
  }

  // before/after（2枚のときだけ）
  if(total === 2){
    if(layout === "vertical"){
      drawChip(ctx, "before", gridX + 18, gridY + cellH - 18);
      // after は右下
      ctx.save();
      // 右側セルの右端から逆算して置く
      const afterX = gridX + (cellW + GAP) + 18;
      // 右に寄せたいなら文字幅計測で逆算もできるけど、まずはこれでOK
      drawChip(ctx, "after", afterX, gridY + cellH - 18);
      ctx.restore();
    }else{
      drawChip(ctx, "before", gridX + 18, gridY + cellH - 18);
      drawChip(ctx, "after", gridX + 18, gridY + (cellH + GAP) + cellH - 18);
    }
  }

  return canvas.toDataURL("image/png");
}
