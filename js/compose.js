import { themeToColor } from "./theme.js";
import { coverDraw, coverDrawTransformed } from "./image.js";
// makeGridTemplate は “旧レイアウト互換” のために残してもOK
import { makeGridTemplate } from "./layout.js";

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

function drawChip(ctx, text, x, y, opt={}){
  const color = opt.color || "white"; // white/black
  const alpha = opt.alpha ?? 0.70;    // 半透明感
  ctx.save();
  ctx.font = "900 38px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.textBaseline = "alphabetic";

  const padX = 22, padY = 14;
  const tw = ctx.measureText(text).width;
  const th = 44;

  const bw = tw + padX*2;
  const bh = th + padY*2;

  roundedRectPath(ctx, x, y - bh, bw, bh, 999);

  if(color === "black"){
    ctx.fillStyle = `rgba(0,0,0,${0.55*alpha})`;
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.92})`;
    ctx.fillText(text, x + padX, y - padY - 8);
  }else{
    ctx.fillStyle = `rgba(255,255,255,${0.85*alpha})`;
    ctx.fill();
    ctx.fillStyle = `rgba(26,26,26,${0.95})`;
    ctx.fillText(text, x + padX, y - padY - 8);
  }
  ctx.restore();
}

/**
 * p = { layout, theme, images[], edits[], labels? }
 * options = { title, ratio, labels? }
 *
 * layout:
 *  - 新: "split_lr" (左右) / "split_tb" (上下)
 *  - 旧: "vertical"/"horizontal" も互換で残す
 */
export async function composePNG(p, options){
  const ratio = options?.ratio || "4:5";
  const title = options?.title || "施術前後写真";


  const labels = {
    enabled: options?.labels?.enabled ?? p.labels?.enabled ?? true,
    color: options?.labels?.color ?? p.labels?.color ?? "white",
    offsetX: options?.labels?.offsetX ?? p.labels?.offsetX ?? 0,
    offsetY: options?.labels?.offsetY ?? p.labels?.offsetY ?? 0,
    alpha: options?.labels?.alpha ?? 0.70,
  };

  const W = 1080;
  const H = (ratio === "1:1") ? 1080 : 1350;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // 背景
  ctx.fillStyle = themeToColor(p.theme || "green");
  ctx.fillRect(0, 0, W, H);

  // レイアウト固定値
  const PAD = 40;
  const HEADER_H = 96;
  const GAP = 14;
  const GRID_TOP = PAD + HEADER_H;
  const GRID_BOTTOM = H - PAD;

  drawTitle(ctx, title, W, PAD + HEADER_H/2);

  const gridX = PAD;
  const gridY = GRID_TOP;
  const gridW = Math.max(1, W - PAD*2);
  const gridH = Math.max(1, GRID_BOTTOM - GRID_TOP);

  // 画像読み込み（今は2枚前提で最短）
  const need = 2;
  if((p.images?.length || 0) < need) throw new Error("画像が不足しています（2枚必要）");

  const imgs = [];
  for(let i=0;i<need;i++){
    const im = new Image();
    im.src = p.images[i];
    await im.decode();
    imgs.push(im);
  }

  // セルの計算（split_lr / split_tb を優先）
  const layout = p.layout || "split_lr";

  let cols = 2, rows = 1; // デフォ左右
  if(layout === "split_tb"){
    cols = 1; rows = 2;
  }else if(layout === "split_lr"){
    cols = 2; rows = 1;
  }else{
    // 旧互換：makeGridTemplate
    const legacy = makeGridTemplate(Number(p.count || 2), layout);
    cols = legacy.cols; rows = legacy.rows;
  }

  const total = cols * rows;
  const cellW = Math.max(1, (gridW - GAP*(cols-1)) / cols);
  const cellH = Math.max(1, (gridH - GAP*(rows-1)) / rows);

  // セル描画
  let idx = 0;
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const x = gridX + c*(cellW + GAP);
      const y = gridY + r*(cellH + GAP);
      const rad = Math.min(26, cellW/6, cellH/6);

      ctx.save();
      roundedRectPath(ctx, x, y, cellW, cellH, rad);
      ctx.clip();

      const edit = p.edits?.[idx] || { x:0, y:0, scale:1, rotate:0 };

      // 回転/拡大/位置があるなら transformed、なければ従来 coverDraw
      if(edit && (edit.x||edit.y||edit.rotate||edit.scale !== 1)){
        coverDrawTransformed(ctx, imgs[idx], x, y, cellW, cellH, edit);
      }else{
        coverDraw(ctx, imgs[idx], x, y, cellW, cellH);
      }

      ctx.restore();

      // うっすら枠
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,.22)";
      ctx.lineWidth = 2;
      roundedRectPath(ctx, x, y, cellW, cellH, rad);
      ctx.stroke();
      ctx.restore();

      idx++;
      if(idx >= need) break;
    }
    if(idx >= need) break;
  }

  // ラベル（2枚のとき）
  if(labels.enabled && total === 2){
    const offX = labels.offsetX;
    const offY = labels.offsetY;

    // 置き場所：左上固定（理想画像に合わせる）
    // チップ関数が“yは下端”なので、上に置くため y計算を変える
    // ここでは chipを「上に出す」ために y = gridY + 80 くらいにする
    const chipYTop = gridY + 80 + offY;

    if(cols === 2){
      // 左右
      drawChip(ctx, "before", gridX + 18 + offX, chipYTop, labels);
      drawChip(ctx, "after",  gridX + (cellW + GAP) + 18 + offX, chipYTop, labels);
    }else{
      // 上下
      drawChip(ctx, "before", gridX + 18 + offX, gridY + 80 + offY, labels);
      drawChip(ctx, "after",  gridX + 18 + offX, gridY + (cellH + GAP) + 80 + offY, labels);
    }
  }

  return canvas.toDataURL("image/png");
}
