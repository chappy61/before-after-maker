export function dataURLToBlob(dataUrl){
  const [head, body] = dataUrl.split(",");
  const mime = head.match(/data:(.*?);base64/)?.[1] || "application/octet-stream";
  const bin = atob(body);
  const u8 = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: mime });
}

export async function makeThumbBlobFromDataURL(dataUrl, maxW=360){
  const img = new Image();
  img.src = dataUrl;
  await img.decode();

  const scale = Math.min(1, maxW / img.naturalWidth);
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);

  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d").drawImage(img, 0, 0, w, h);

  return new Promise((resolve)=>{
    c.toBlob((blob)=> resolve(blob), "image/jpeg", 0.85);
  });
}
