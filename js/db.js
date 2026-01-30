// js/db.js
// ------------------------------------------------------------
// Gallery DB + Storage helpers (Supabase)
// - private bucket + signed URL for display
// - addToGallery uploads full + thumb and inserts DB row
// ------------------------------------------------------------

import { supabase } from "./supabaseClient.js";
import { requireAuthOrRedirect } from "./passcodeAuth.js"; // ←あなたの実体に合わせる

const BUCKET = "gallery"; // Storage bucket name
const TABLE = "gallery";  // DB table name

async function mustUser() {
  // passcodeAuth.js の requireAuthOrRedirect() が session を返す想定
  const session = await requireAuthOrRedirect();
  const user = session?.user;
  if (!user) throw new Error("Not authenticated");
  return user;
}

async function blobToThumb(blob, maxSide = 640, quality = 0.86) {
  // 画像を読み込み
  const bmp = await createImageBitmap(blob);

  const w = bmp.width;
  const h = bmp.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  const c = document.createElement("canvas");
  c.width = tw;
  c.height = th;
  const ctx = c.getContext("2d");
  ctx.drawImage(bmp, 0, 0, tw, th);

  // JPEGで軽く
  const out = await new Promise((resolve) => c.toBlob(resolve, "image/jpeg", quality));
  if (!out) throw new Error("thumb encode failed");
  return out;
}

async function signedUrl(path, expiresSec = 60 * 10) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresSec);
  if (error) throw error;
  return data.signedUrl;
}

export async function addToGallery({ fullBlob, thumbBlob, meta }) {
  const user = await mustUser();

  // 保存セットID（DBのidにも使う）
  const id = crypto.randomUUID();

  // meta.projectId があれば同一案件配下にまとめる
  const projectId = meta?.projectId || crypto.randomUUID();
  const folder = `${user.id}/${projectId}/export/${id}`;

  const fullPath = `${folder}/full.png`;

  // thumb が来てなければ自動生成
  const tb = thumbBlob || (await blobToThumb(fullBlob));
  const thumbPath = `${folder}/thumb.jpg`;

  console.log("[UPLOAD]", { BUCKET, fullPath, thumbPath, userId: user.id });

  // 1) upload (bucket)
  {
    const { error } = await supabase.storage.from(BUCKET).upload(fullPath, fullBlob, {
      upsert: false,
      contentType: "image/png",
      cacheControl: "3600",
    });
    if (error) throw error;
  }

  {
    const { error } = await supabase.storage.from(BUCKET).upload(thumbPath, tb, {
      upsert: false,
      contentType: "image/jpeg",
      cacheControl: "3600",
    });
    if (error) throw error;
  }

  // 2) insert row (table)
  const row = {
    id,
    user_id: user.id,
    full_path: fullPath,
    thumb_path: thumbPath,
    meta: { ...(meta || {}), projectId },
  };

  {
    const { error } = await supabase.from(TABLE).insert(row);
    if (error) throw error;
  }

  return { ...row, created_at: new Date().toISOString() };
}

export async function listGallery(limit = 30) {
  await mustUser();

  const { data, error } = await supabase
    .from(TABLE)
    .select("id, created_at, thumb_path, full_path, meta")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  // 表示用：thumb を signed URL 化
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
    .from(TABLE)
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

  // db delete（RLSで自分の分だけ消せる想定）
  {
    const { error } = await supabase.from(TABLE).delete().eq("id", id);
    if (error) throw error;
  }
}

export async function clearGallery() {
  const items = await listGallery(500);
  for (const it of items) {
    await deleteGalleryItem(it.id);
  }
}
