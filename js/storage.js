export const STORAGE_KEY = "ba_project_v1";

export function loadProject() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveProject(p) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
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
        color: "#fff", // "#fff" or "#000"
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
    count: null,
    layout: "split_lr",
    theme: null,
    images: [],
    edits: [],
    labels: { enabled: true, items: [] },
    title: "施術前後写真",
    ratio: "4:5",
  };
  saveProject(fresh);
  return fresh;
}
