export function readFileAsDataURL(file){
  return new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onload = ()=> resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export async function shrinkDataURL(dataUrl, maxSide=2048, quality=0.92){
  const img = new Image();
  img.src = dataUrl;
  await img.decode();

  const w = img.naturalWidth, h = img.naturalHeight;
  const scale = Math.min(1, maxSide / Math.max(w,h));
  const tw = Math.round(w * scale);
  const th = Math.round(h * scale);

  const c = document.createElement("canvas");
  c.width = tw; c.height = th;
  const cctx = c.getContext("2d");

  cctx.drawImage(img, 0, 0, tw, th);

  // 透過を保つならPNG
  return c.toDataURL("image/png");
}


export function coverDraw(ctx, img, x, y, w, h){
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;
  const r = Math.max(w/iw, h/ih);
  const nw = iw*r, nh = ih*r;
  const nx = x + (w - nw)/2;
  const ny = y + (h - nh)/2;
  ctx.drawImage(img, nx, ny, nw, nh);
}

export function coverDrawTransformed(ctx, img, x, y, w, h, edit){
  const e = edit || { x:0, y:0, scale:1, rotate:0 };

  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;

  const sCover = Math.max(w / iw, h / ih);
  const s = sCover * (e.scale ?? 1);

  const cx = x + w/2;
  const cy = y + h/2;

  ctx.save();
  ctx.translate(cx, cy);

  // ✅ 画面座標移動（回転に巻き込ませない）
  ctx.translate((e.x ?? 0), (e.y ?? 0));

  ctx.rotate(((e.rotate ?? 0) * Math.PI) / 180);
  ctx.scale(s, s);

  ctx.drawImage(img, -iw/2, -ih/2, iw, ih);
  ctx.restore();
}

// ============================================================
// CONTAIN draw (match <img object-fit: contain> behavior)
// ============================================================
export function containDraw(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;

  const r = Math.min(w / iw, h / ih); // contain
  const nw = iw * r;
  const nh = ih * r;

  const nx = x + (w - nw) / 2;
  const ny = y + (h - nh) / 2;

  ctx.drawImage(img, nx, ny, nw, nh);
}

export function containDrawTransformed(ctx, img, x, y, w, h, edit) {
  const e = edit || { x: 0, y: 0, scale: 1, rotate: 0 };

  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;

  // contain基準
  const sContain = Math.min(w / iw, h / ih);
  const s = sContain * (e.scale ?? 1);

  const cx = x + w / 2;
  const cy = y + h / 2;

  ctx.save();
  ctx.translate(cx, cy);

  // 画面座標での移動（回転に巻き込ませない）
  ctx.translate((e.x ?? 0), (e.y ?? 0));

  ctx.rotate(((e.rotate ?? 0) * Math.PI) / 180);
  ctx.scale(s, s);

  ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
  ctx.restore();
}
