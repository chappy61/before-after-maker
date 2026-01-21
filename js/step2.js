import { ensureProject, saveProject } from "./storage.js";

const layoutGrid = document.getElementById("layoutGrid");
const nextBtn = document.getElementById("nextBtn");
const backBtn = document.getElementById("backBtn");
const info = document.getElementById("info");

function render(p){
  [...layoutGrid.querySelectorAll(".card")].forEach(btn=>{
    btn.classList.toggle("selected", btn.dataset.layout === p.layout);
  });

  nextBtn.disabled = !p.layout;

  const count = p.count ?? "未選択";
  const layoutText = p.layout
    ? (p.layout === "vertical" ? "縦（左右）" : "横（上下）")
    : "未選択";

  info.textContent = `現在：枚数 ${count} / 並び方 ${layoutText}`;
}

function setLayout(layout){
  const p = ensureProject();
  p.layout = layout;

  // downstream reset（安全側）
  p.theme = null;
  p.images = [];

  saveProject(p);
  render(p);
}

layoutGrid.addEventListener("click", (e)=>{
  const btn = e.target.closest(".card");
  if(!btn) return;
  setLayout(btn.dataset.layout);
});

backBtn.addEventListener("click", ()=> {
  window.location.href = "step1.html";
});

nextBtn.addEventListener("click", ()=> {
  window.location.href = "step3.html";
});

render(ensureProject());
