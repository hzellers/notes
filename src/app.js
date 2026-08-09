const captureInput = document.getElementById("capture-input");
if (captureInput) {
  captureInput.focus();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.error("Service worker registration failed:", err);
    });
  });
}

const debugRequested = new URLSearchParams(location.search).has("debug");
if (debugRequested) {
  const script = document.createElement("script");
  script.src = "vendor/eruda/eruda.js";
  script.onload = () => {
    window.eruda.init();
    const indicator = document.getElementById("debug-indicator");
    if (indicator) {
      indicator.textContent = "debug console active";
    }
  };
  document.body.appendChild(script);
}
