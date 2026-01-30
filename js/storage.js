// storage.js
import { supabase } from "./supabaseClient.js";

// ====== Local cache (small metadata only) ======
export const STORAGE_KEY = "ba_project_v1";

// ====== Supabase Storage ======
const BUCKET = "gallery";

// ---------- localStorage ----------
export function loadProject() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveProject(p) {
  try {
    // ⚠️ 画像(dataURL)を入れるとここが爆発するので、
    // できるだけ p.images には "storage path" を入れる運用に寄せる
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch (e) {
    // 容量いっぱいでもアプリを落とさない（クラウドが正になるため）
    console.warn("localStorage full, skip cache:", e?.name);
  }
}

export function ensureProject() {
  const existing = loadProject();
  if (existing && typeof existing === "object") {
    // --- migrate / normalize ---
    if (!Array.isArray(existing.images)) existing.images = [];
    if (!Array.isArray(existing.edits)) existing.edits = [];
    if (!existing.layout) existing.layout = "split_lr";
    if (!existing.ratio) existing.ratio = "4:5";
    if (!existing.title) existing.title = "施術前後写真";

    // labels: new schema
    if (!existing.labels || typeof existing.labels !== "object") {
      existing.labels = { enabled: true, items: [] };
    }
    if (typeof existing.labels.enabled !== "boolean") existing.labels.enabled = true;
    if (!Array.isArray(existing.labels.items)) existing.labels.items = [];

    const use = Math.min(2, existing.images.length);
    while (existing.labels.items.length < use) {
      const i = existing.labels.items.length;
      existing.labels.items.push({
        x: i === 0 ? 0.06 : 0.56,
        y: 0.08,
        color: "#fff",
      });
    }
    existing.labels.items = existing.labels.items.slice(0, use);

    // edits: ensure length
    while (existing.edits.length < existing.images.length) {
      existing.edits.push({ x: 0, y: 0, scale: 1, rotate: 0 });
    }
    existing.edits = existing.edits.slice(0, existing.images.length);

    saveProject(existing);
    return existing;
  }

  // --- new project ---
  const fresh = {
    version: 1,
    projectId: null, // ← storageのフォルダ名に使うならここ
    count: null,
    layout: "split_lr",
    theme: null,
    images: [],       // dataURL OR storage path
    edits: [],
    labels: { enabled: true, items: [] },
    title: "施術前後写真",
    ratio: "4:5",
  };
  saveProject(fresh);
  return fresh;
}

// ---------- helpers ----------
export function isDataUrl(s) {
  return typeof s === "string" && s.startsWith("data:");
}

// "foo.jpg" -> "jpg"
export function extFromName(name, fallback = "jpg") {
  if (!name) return fallback;
  const p = String(name).split(".").pop();
  return (p && p.length <= 5 ? p : fallback).toLowerCase();
}

// ---------- Supabase Storage: upload / signed url / remove ----------
export async function requireUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data?.user) throw new Error("Not signed in");
  return data.user;
}

/**
 * Upload one image (File/Blob) to Supabase Storage.
 * Returns storage path like: `${userId}/${projectId}/${uuid}.jpg`
 */
export async function uploadImageToGallery({ fileOrBlob, projectId, ext = "jpg" }) {
  const user = await requireUser();
  const uid = user.id;

  const safeProjectId = projectId || crypto.randomUUID();
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const path = `${uid}/${safeProjectId}/${fileName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, fileOrBlob, {
      upsert: false,
      contentType: fileOrBlob.type || "image/jpeg",
      cacheControl: "3600",
    });

  if (error) throw error;
  return { path, projectId: safeProjectId, userId: uid };
}
// home.js 用の薄いラッパー（互換用）
export async function uploadToGallery(path, fileOrBlob) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, fileOrBlob, {
      upsert: false,
      contentType: fileOrBlob.type || "image/jpeg",
      cacheControl: "3600",
    });

  if (error) throw error;
  return path;
}

/**
 * Create signed URL for private bucket.
 */
export async function getSignedUrl(path, expiresSec = 600) {
  // すでにURLなら、そのまま返す（2重署名を防ぐ）
  if (typeof path === "string" && /^https?:\/\//i.test(path)) return path;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresSec);

  if (error) throw error;
  return data.signedUrl;
}

/**
 * Delete images by paths.
 */
export async function deleteGalleryPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) throw error;
}

/**
 * Resolve image reference to usable URL for <img src>.
 * - dataURL => return as is
 * - storage path => signed url
 */
export async function resolveImageSrc(imgRef, expiresInSec = 60 * 10) {
  if (isDataUrl(imgRef)) return imgRef;
  return await getSignedUrl(imgRef, expiresInSec);
}

