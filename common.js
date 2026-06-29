
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [], cell = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { cell += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cell += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (c !== "\r") { cell += c; }
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift().map(h => h.trim());
  return rows
    .filter(r => r.some(v => String(v).trim() !== ""))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}

function escapeAttr(value) {
  return String(value || "").replaceAll('"', "&quot;");
}

function clean(value) {
  return (value || "").toString().trim();
}

function bildText(n) {
  return Number(n) === 1 ? "1 bild" : `${n} bilder`;
}

function sortNatural(a, b) {
  return String(a).localeCompare(String(b), "sv", {numeric: true, sensitivity: "base"});
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function rememberCSV(key, text) {
  try { localStorage.setItem(key, text); } catch (e) {}
}

function getRememberedCSV(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

function clearRememberedCSV(keys) {
  try { keys.forEach(k => localStorage.removeItem(k)); } catch (e) {}
}

function downloadText(filename, text) {
  const blob = new Blob([text], {type: "text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function ensurePlantPhotoGallery() {
  let dialog = document.querySelector("#photoDialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "photoDialog";
    document.body.appendChild(dialog);
  }
  if (!document.querySelector("#plantGalleryStyles")) {
    const style = document.createElement("style");
    style.id = "plantGalleryStyles";
    style.textContent = `
      dialog.photo-gallery {
        width: 100vw; height: 100vh; max-width: none; max-height: none; margin: 0; padding: 0;
        background: #0d0c0b; color: white; border: 0;
      }
      dialog.photo-gallery::backdrop { background: rgba(0,0,0,.82); }
      .gallery-shell { width: 100%; height: 100%; display: grid; grid-template-rows: auto 1fr auto; }
      .gallery-top {
        min-height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 12px;
        padding: max(12px, env(safe-area-inset-top)) 14px 10px;
      }
      .gallery-title { min-width: 0; font-weight: 800; color: rgba(255,255,255,.88); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .gallery-close, .gallery-nav {
        border: 0; background: rgba(255,255,255,.14); color: white; border-radius: 999px;
        width: 44px; height: 44px; display: grid; place-items: center; font: 800 1.6rem/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .gallery-stage { position: relative; min-height: 0; display: grid; place-items: center; overflow: hidden; touch-action: pan-y; }
      .gallery-image { max-width: 100vw; max-height: calc(100vh - 145px); object-fit: contain; display: block; }
      .gallery-nav { position: absolute; top: 50%; transform: translateY(-50%); }
      .gallery-prev { left: 12px; }
      .gallery-next { right: 12px; }
      .gallery-bottom { padding: 10px 16px max(16px, env(safe-area-inset-bottom)); text-align: center; }
      .gallery-caption { font-weight: 800; color: rgba(255,255,255,.92); }
      .gallery-count { margin-top: 6px; color: rgba(255,255,255,.66); font-size: .9rem; font-weight: 700; }
      .gallery-dots { display: flex; justify-content: center; gap: 7px; margin-top: 10px; }
      .gallery-dot { width: 7px; height: 7px; border-radius: 999px; background: rgba(255,255,255,.32); }
      .gallery-dot.active { background: white; }
      @media (max-width: 700px) {
        .gallery-nav { display: none; }
        .gallery-image { max-height: calc(100vh - 132px); }
      }
    `;
    document.head.appendChild(style);
  }
  if (dialog.dataset.ready === "true") return dialog;
  dialog.className = "photo-gallery";
  dialog.innerHTML = `
    <div class="gallery-shell">
      <div class="gallery-top">
        <div class="gallery-title" id="galleryTitle"></div>
        <button class="gallery-close" type="button" aria-label="Stäng">×</button>
      </div>
      <div class="gallery-stage">
        <button class="gallery-nav gallery-prev" type="button" aria-label="Föregående bild">‹</button>
        <img class="gallery-image" id="modalImg" alt="">
        <button class="gallery-nav gallery-next" type="button" aria-label="Nästa bild">›</button>
      </div>
      <div class="gallery-bottom">
        <div class="gallery-caption" id="modalCaption"></div>
        <div class="gallery-count" id="galleryCount"></div>
        <div class="gallery-dots" id="galleryDots"></div>
      </div>
    </div>`;
  dialog.dataset.ready = "true";
  dialog.galleryState = {items: [], index: 0, startX: 0, startY: 0};

  const show = index => {
    const state = dialog.galleryState;
    if (!state.items.length) return;
    state.index = (index + state.items.length) % state.items.length;
    const item = state.items[state.index];
    dialog.querySelector("#modalImg").src = item.file;
    dialog.querySelector("#modalImg").alt = item.alt || item.title || "";
    dialog.querySelector("#galleryTitle").textContent = item.title || "";
    dialog.querySelector("#modalCaption").textContent = item.caption || item.label || item.title || "";
    dialog.querySelector("#galleryCount").textContent = `${state.index + 1} av ${state.items.length}`;
    dialog.querySelector("#galleryDots").innerHTML = state.items.map((_, dotIndex) =>
      `<span class="gallery-dot ${dotIndex === state.index ? "active" : ""}"></span>`
    ).join("");
  };
  dialog.galleryShow = show;
  dialog.querySelector(".gallery-close").addEventListener("click", () => dialog.close());
  dialog.querySelector(".gallery-prev").addEventListener("click", event => {
    event.stopPropagation();
    show(dialog.galleryState.index - 1);
  });
  dialog.querySelector(".gallery-next").addEventListener("click", event => {
    event.stopPropagation();
    show(dialog.galleryState.index + 1);
  });
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("keydown", event => {
    if (event.key === "ArrowLeft") show(dialog.galleryState.index - 1);
    if (event.key === "ArrowRight") show(dialog.galleryState.index + 1);
  });
  const stage = dialog.querySelector(".gallery-stage");
  stage.addEventListener("touchstart", event => {
    const touch = event.changedTouches[0];
    dialog.galleryState.startX = touch.clientX;
    dialog.galleryState.startY = touch.clientY;
  }, {passive: true});
  stage.addEventListener("touchend", event => {
    const touch = event.changedTouches[0];
    const dx = touch.clientX - dialog.galleryState.startX;
    const dy = touch.clientY - dialog.galleryState.startY;
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      show(dialog.galleryState.index + (dx < 0 ? 1 : -1));
    }
  }, {passive: true});
  return dialog;
}

function openPlantPhotoGallery(mainPhoto) {
  const card = mainPhoto.closest(".plant-card, .card");
  if (!card) return;
  let items = [];
  try { items = JSON.parse(card.dataset.gallery || "[]"); } catch (e) { items = []; }
  if (!items.length && mainPhoto.src) {
    items = [{file: mainPhoto.getAttribute("src"), title: mainPhoto.alt, caption: mainPhoto.dataset.caption || mainPhoto.alt}];
  }
  if (!items.length) return;
  const current = mainPhoto.getAttribute("src") || "";
  const index = Math.max(0, items.findIndex(item => item.file === current || mainPhoto.src.endsWith(item.file)));
  const dialog = ensurePlantPhotoGallery();
  dialog.galleryState.items = items;
  dialog.galleryShow(index);
  dialog.showModal();
}
