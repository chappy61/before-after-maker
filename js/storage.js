export const STORAGE_KEY = "ba_project_v1";

export function loadProject(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch{
    return null;
  }
}

export function saveProject(p){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

export function ensureProject(){
  const existing = loadProject();
  if(existing && typeof existing === "object") return existing;
  return {
    version: 1,
    count: null,
    layout: null,
    theme: null,
    images: [],
    title: "施術前後写真",
    ratio: "4:5"
  };
}

