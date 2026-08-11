// Mermaid is ~3.6MB vendored and only needed once someone actually opens a
// diagram editor, so it's loaded lazily via a plain <script> tag rather than
// imported up front -- the capture screen must never pay for it. The service
// worker precaches the file, so this resolves from Cache Storage even
// offline; it's still lazy purely to keep it off the capture path.
let mermaidLoadPromise = null;

function loadMermaid() {
  if (window.mermaid) return Promise.resolve(window.mermaid);
  if (mermaidLoadPromise) return mermaidLoadPromise;
  mermaidLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "vendor/mermaid/mermaid.min.js";
    script.onload = () => {
      window.mermaid.initialize({ startOnLoad: false });
      resolve(window.mermaid);
    };
    script.onerror = () => {
      mermaidLoadPromise = null;
      reject(new Error("Couldn't load the diagram renderer"));
    };
    document.body.appendChild(script);
  });
  return mermaidLoadPromise;
}

let renderCounter = 0;

// Renders Mermaid source into `container`. A syntax error is shown in
// `errorEl` and the previous successful render is left in place rather than
// cleared -- the panel must never go blank, only flag the current draft as
// broken.
export async function renderMermaid(source, container, errorEl) {
  const text = String(source || "").trim();
  if (!text) {
    container.innerHTML = "";
    errorEl.hidden = true;
    errorEl.textContent = "";
    return;
  }

  const id = `mermaid-render-${++renderCounter}`;
  try {
    const mermaid = await loadMermaid();
    const { svg } = await mermaid.render(id, text);
    container.innerHTML = svg;
    errorEl.hidden = true;
    errorEl.textContent = "";
  } catch (err) {
    errorEl.hidden = false;
    errorEl.textContent = err && err.message ? err.message : String(err);
    // On success the rendered <svg> itself legitimately carries this same
    // id (mermaid names the root element after it), so only clean up a
    // stray detached measurement node on the failure path -- doing this
    // unconditionally in a `finally` deleted the just-inserted SVG right
    // after a successful render, since both share the id.
    const stray = document.getElementById(id);
    if (stray) stray.remove();
  }
}
