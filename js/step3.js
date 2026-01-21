import { ensureProject, saveProject } from "./storage.js";

const colorGrid = document.getElementById("colorGrid");
const nextBtn = document.getElementById("nextBtn");
const backBtn = document.getElementById("backBtn");
const info = document.getElementById("info");

function render(p){
  [...colorGrid.querySelectorAll(".color-card")].forEach(btn=>{
    btn.classList.toggle("selected", btn.dataset.theme === p.theme);
  });

  nextBtn.disabled = !p.theme;

  const count = p.count ?? "未選択";
  const layout = p.layout
    ? (p.layout === "vertical" ? "縦（左右）" : "横（上下）")
    : "未選択";
  const theme = p.theme ?? "未選択";

  info.textContent = `現在：枚数 ${count} / 並び方 ${layout} / カラー ${theme}`;
}

function setTheme(theme){
  const p = ensureProject();
  p.theme = theme;
  saveProject(p);
  render(p);
}

colorGrid.addEventListener("click", (e)=>{
  const btn = e.target.closest(".color-card");
  if(!btn) return;
  setTheme(btn.dataset.theme);
});

backBtn.addEventListener("click", ()=> {
  window.location.href = "step2.html";
});

nextBtn.addEventListener("click", ()=> {
  window.location.href = "step4.html";
});

render(ensureProject());
