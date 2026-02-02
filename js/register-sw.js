// register-sw.js
export function registerSW() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("/before-after-maker/sw.js", {
        scope: "/before-after-maker/"
      });
    } catch (e) {
      console.warn("SW register failed:", e);
    }
  });
}

