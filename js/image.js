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
