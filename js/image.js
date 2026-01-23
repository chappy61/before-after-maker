export function readFileAsDataURL(file){
  return new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onload = ()=> resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export async function shrinkDataURL(dataUrl, maxSide=2048, quality=0.9){
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

  return c.toDataURL("image/jpeg", quality);
}

export function coverDraw(ctx, img, x, y, w, h){
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const r = Math.max(w/iw, h/ih);
  const nw = iw*r, nh = ih*r;
  const nx = x + (w - nw)/2;
  const ny = y + (h - nh)/2;
  ctx.drawImage(img, nx, ny, nw, nh);
}
// image.js に追加
export function coverDrawTransformed(ctx, img, x, y, w, h, edit){
  const e = edit || { x:0, y:0, scale:1, rotate:0 };

  // cover fit の基礎スケール
  const sCover = Math.max(w / img.width, h / img.height);

  // 追加の拡大
  const s = sCover * (e.scale ?? 1);

  // セル中心
  const cx = x + w/2;
  const cy = y + h/2;

  ctx.save();
  // セルでclipしてる前提でもOK。ここ単体で使うならclipは外側で。
  ctx.translate(cx, cy);
  ctx.rotate(((e.rotate ?? 0) * Math.PI) / 180);
  ctx.translate((e.x ?? 0), (e.y ?? 0)); // ← “ズレ補正”の値
  ctx.scale(s, s);

  // 画像中心を原点に合わせて描く
  ctx.drawImage(img, -img.width/2, -img.height/2);

  ctx.restore();
}
