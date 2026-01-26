// js/db.js (Supabase版)
// gallery bucket + gallery table を使う
import { supabase } from "./supabaseClient.js";

const BUCKET = "gallery";

// 軽いサムネ生成（十分ならこのまま）
// もっと綺麗にしたいなら後でCanvasで縮小に変えよう
async function blobToThumb(blob, max = 360, quality = 0.86) {
  const img = new Image();
  const url = URL.createObjectURL(blob);
  img.src = url;
  await img.decode();
  URL.revokeObjectURL(url);

  const w = img.naturalWidth || 1;
  const h = img.naturalHeight || 1;
  const s = Math.min(1, max / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * s));
  const th = Math.max(1, Math.round(h * s));

  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, tw, th);

  const out = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
  );
  return out || blob; // 失敗時は原寸
}

async function mustUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data?.user) throw new Error("未ログインです");
  return data.user;
}

function extFromBlob(blob, fallback = "png") {
  const t = (blob?.type || "").toLowerCase();
  if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
  if (t.includes("webp")) return "webp";
  if (t.includes("png")) return "png";
  return fallback;
}

export async function addToGallery({ fullBlob, thumbBlob, meta }) {
  const user = await mustUser();

  const id = crypto.randomUUID();
  const folder = `${user.id}/${id}`;

  const fullExt = extFromBlob(fullBlob, "png");
  const fullPath = `${folder}/full.${fullExt}`;

  // thumb が来てなければ自動生成
  const tb = thumbBlob || (await blobToThumb(fullBlob));
  const thumbExt = extFromBlob(tb, "jpg");
  const thumbPath = `${folder}/thumb.${thumbExt}`;

  // 1) upload (private bucket)
  {
    const { error } = await supabase.storage.from(BUCKET).upload(fullPath, fullBlob, {
      upsert: false,
      contentType: fullBlob.type || "image/png",
    });
    if (error) throw error;
  }

  {
    const { error } = await supabase.storage.from(BUCKET).upload(thumbPath, tb, {
      upsert: false,
      contentType: tb.type || "image/jpeg",
    });
    if (error) throw error;
  }

  // 2) insert row
  const row = {
    id,
    user_id: user.id,
    full_path: fullPath,
    thumb_path: thumbPath,
    meta: meta || {},
  };

  {
    const { error } = await supabase.from("gallery").insert(row);
    if (error) throw error;
  }

  return { ...row, created_at: new Date().toISOString() };
}

async function signedUrl(path, expiresSec = 60 * 10) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresSec);
  if (error) throw error;
  return data.signedUrl;
}

export async function listGallery(limit = 30) {
  await mustUser();

  const { data, error } = await supabase
    .from("gallery")
    .select("id, created_at, thumb_path, full_path, meta")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  // signed URL を付与（表示用）
  const out = await Promise.all(
    (data || []).map(async (it) => {
      const thumbUrl = await signedUrl(it.thumb_path || it.full_path);
      return { ...it, thumbUrl };
    })
  );

  return out;
}

export async function getGalleryItem(id) {
  await mustUser();

  const { data, error } = await supabase
    .from("gallery")
    .select("id, created_at, thumb_path, full_path, meta")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const fullUrl = await signedUrl(data.full_path, 60 * 10);
  const thumbUrl = data.thumb_path ? await signedUrl(data.thumb_path, 60 * 10) : null;

  return { ...data, fullUrl, thumbUrl };
}

export async function deleteGalleryItem(id) {
  await mustUser();

  // row取ってパス確定
  const item = await getGalleryItem(id);
  if (!item) return;

  // storage delete
  const paths = [item.full_path, item.thumb_path].filter(Boolean);
  {
    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    if (error) throw error;
  }

  // db delete（RLSで自分の分だけ消せる）
  {
    const { error } = await supabase.from("gallery").delete().eq("id", id);
    if (error) throw error;
  }
}

export async function clearGallery() {
  // 危険操作なのでまず一覧取ってから消す（自分の分だけ）
  const items = await listGallery(500);
  for (const it of items) {
    await deleteGalleryItem(it.id);
  }
}
