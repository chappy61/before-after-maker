// js/passcodeAuth.js
import { supabase } from "./supabaseClient.js";

// ===== 設定（ここだけ変える）=====
const PASSCODE = "1234";               // 4桁（サロン用）
const EMAIL = "salon@app.local";       // Supabaseに作る共有ユーザー
const PASSWORD = "IdvmkmkfyUUn6w";      // Supabaseに設定したPW
// ロック（総当たり対策）
const MAX_TRIES = 3;
const LOCK_MINUTES = 5;
// ================================

const KEY_FAILS = "pc_fails";
const KEY_LOCK_UNTIL = "pc_lock_until";

const now = () => Date.now();

function isLocked() {
  const until = Number(localStorage.getItem(KEY_LOCK_UNTIL) || 0);
  return now() < until;
}
function remainingSec() {
  const until = Number(localStorage.getItem(KEY_LOCK_UNTIL) || 0);
  return Math.ceil(Math.max(0, until - now()) / 1000);
}
function recordFail() {
  const fails = Number(localStorage.getItem(KEY_FAILS) || 0) + 1;
  localStorage.setItem(KEY_FAILS, String(fails));
  if (fails >= MAX_TRIES) {
    localStorage.setItem(KEY_LOCK_UNTIL, String(now() + LOCK_MINUTES * 60 * 1000));
    localStorage.setItem(KEY_FAILS, "0");
  }
  return fails;
}
function clearFail() {
  localStorage.setItem(KEY_FAILS, "0");
  localStorage.removeItem(KEY_LOCK_UNTIL);
}

export async function loginWithPasscode(code) {
  if (isLocked()) {
    throw new Error(`ロック中です（残り約${remainingSec()}秒）`);
  }
  if (code !== PASSCODE) {
    const fails = recordFail();
    const left = Math.max(0, MAX_TRIES - fails);
    if (left === 0) throw new Error(`${LOCK_MINUTES}分ロックします`);
    throw new Error(`パスコードが違います（残り${left}回）`);
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (error) throw error;

  clearFail();
  return data.session;
}

export async function requireAuthOrRedirect(loginPath = "./k9x3.html") {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session) {
    location.href = loginPath;
    throw new Error("Not authenticated");
  }
  return session;
}

export async function logout() {
  await supabase.auth.signOut();
}
// ============================================================
// UI bind (k9x3.html)
// - iPhone風：ドット4つ + テンキー
// - 入力完了で loginWithPasscode(code) → 成功で next へ
// ============================================================

const dotsEl = document.getElementById("pcDots");
const noteEl = document.getElementById("pcNote");
const clearBtn = document.getElementById("clearBtn");

// k9x3.html 以外では何もしない
if (dotsEl) {
  const keys = document.querySelectorAll(".key[data-key]");
  const params = new URLSearchParams(location.search);
  const next = params.get("next") || "index.html";

  let input = "";
  let busy = false;

  function setNote(msg = "") {
    if (!noteEl) return;
    noteEl.textContent = msg;
  }

  function renderDots() {
    const dots = dotsEl.querySelectorAll(".dot");
    dots.forEach((d, i) => d.classList.toggle("filled", i < input.length));
  }

  function shake(msg) {
    setNote(msg || "");
    dotsEl.classList.remove("shake");
    // reflow
    void dotsEl.offsetWidth;
    dotsEl.classList.add("shake");
  }

  function reset(msg = "") {
    input = "";
    renderDots();
    setNote(msg);
  }

  async function commitIfReady() {
    if (input.length < 4) return;
    if (busy) return;

    busy = true;
    setNote("確認中…");

    try {
      await loginWithPasscode(input); // ← 既存ロジック呼び出し
      setNote("");
      location.href = next;
    } catch (err) {
      const msg = err?.message || String(err);
      shake(msg);
      reset(""); // 入力は消す（iPhoneっぽい挙動）
    } finally {
      busy = false;
    }
  }

  function pushDigit(d) {
    if (busy) return;
    if (input.length >= 4) return;
    input += d;
    renderDots();
    commitIfReady();
  }

  function del() {
    if (busy) return;
    if (!input.length) return;
    input = input.slice(0, -1);
    renderDots();
  }

  // テンキー
  keys.forEach((btn) => {
    btn.addEventListener("click", () => {
      const k = btn.dataset.key;
      if (k === "blank") return;
      if (k === "del") return del();
      if (k >= "0" && k <= "9") return pushDigit(k);
    });
  });

  // クリア
  clearBtn?.addEventListener("click", () => reset(""));

  // PCテスト用：物理キー
  window.addEventListener("keydown", (e) => {
    if (busy) return;

    if (e.key >= "0" && e.key <= "9") {
      pushDigit(e.key);
      return;
    }
    if (e.key === "Backspace") {
      del();
      return;
    }
    if (e.key === "Escape") {
      reset("");
    }
  });

  // ロック中なら最初に案内
  try {
    if (isLocked()) {
      setNote(`ロック中です（残り約${remainingSec()}秒）`);
    }
  } catch {}

  renderDots();
}
