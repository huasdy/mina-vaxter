
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
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function clean(value) {
  return (value || "").toString().trim();
}

function collectionChips(category, row) {
  const haystack = [
    category,
    row && row.id,
    row && row.name,
    row && row.latin,
    row && row.type,
    row && row.tags,
    row && row.status,
    row && row.scent,
    row && row.source,
    row && row.notes,
    row && row.group,
    row && row.batch
  ].map(clean).join(" ").toLowerCase();
  const chips = [];
  const add = value => {
    if (value && !chips.includes(value)) chips.push(value);
  };

  if (category === "Hibiskus") {
    add("Projekt");
    add("Egen frösådd");
  } else if (category === "Pelargon") {
    if (haystack.includes("doft")) add("Doft");
    if (haystack.includes("vild") || haystack.includes("bonsai") || haystack.includes("brokbladig")) add("Unik");
  } else if (category === "Citrus") {
    add("Inne");
  } else if (category === "Udda") {
    if (haystack.includes("doft") || haystack.includes("patchouli") || haystack.includes("salvia")) add("Doft");
    if (haystack.includes("frö") || haystack.includes("sådd")) add("Egen frösådd");
    if (!haystack.includes("fredskalla")) add("Unik");
    if (haystack.includes("fredskalla") || haystack.includes("hjärtbräken")) add("Inne");
  }

  return chips.length ? chips : [category];
}

function collectionChipHtml(category, row, escapeFn = htmlEscape) {
  return collectionChips(category, row)
    .map((label, index) => `<span class="chip ${index === 0 ? "green" : ""}">${escapeFn(label)}</span>`)
    .join("");
}

function bildText(n) {
  return Number(n) === 1 ? "1 bild" : `${n} bilder`;
}

function logBookIcon() {
  return `
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M9 5.5 H21.5 C23.4 5.5 25 7.1 25 9 V26.5 H9 C7.3 26.5 6 25.2 6 23.5 V8.5 C6 6.8 7.3 5.5 9 5.5 Z"
        fill="none" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M10.5 5.5 V26.5" fill="none" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M14.5 12 H21.2 M14.5 17 H20" fill="none" stroke-width="2.2" stroke-linecap="round"/>
    </svg>
  `;
}

function milestoneIcon(type) {
  const key = clean(type).toLowerCase();
  const icons = {
    "sådd": "🌱",
    "grodd": "🌿",
    "förökning": "↟",
    "omplanterad": "🪴",
    "toppad/beskuren": "✂️",
    "knopp": "●",
    "ohyra upptäckt/behandlad": "!",
    "flyttad ut/in": "↔",
    "blomning": "✿",
    "avslutad/död": "×"
  };
  return icons[key] || "•";
}

const plantMilestoneTypes = [
  "Sådd",
  "Grodd",
  "Förökning",
  "Omplanterad",
  "Toppad/beskuren",
  "Knopp",
  "Blomning",
  "Ohyra upptäckt/behandlad",
  "Flyttad ut/in",
  "Avslutad/död"
];

const plantMilestoneStorageKey = "mina-vaxter-milestone-additions-v1";
const plantMilestoneLegacyStorageKey = "mina-vaxter-plant-log-additions-v1";

function getPlantMilestoneAdditions() {
  try {
    const stored = localStorage.getItem(plantMilestoneStorageKey) || localStorage.getItem(plantMilestoneLegacyStorageKey) || "[]";
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function savePlantMilestoneAdditions(rows) {
  try { localStorage.setItem(plantMilestoneStorageKey, JSON.stringify(rows || [])); } catch (e) {}
  updatePlantMilestoneQueueUI();
}

function addPlantMilestoneEntry(entry) {
  const id = clean(entry && entry.id);
  const date = clean(entry && entry.date);
  const type = clean(entry && entry.type);
  if (!id || !date || !type) return null;
  const row = {
    id,
    date,
    type,
    note: clean(entry.note),
    local: "true",
    createdAt: new Date().toISOString()
  };
  const rows = getPlantMilestoneAdditions();
  rows.push(row);
  savePlantMilestoneAdditions(rows);
  return row;
}

function addPlantMilestoneEntries(entries) {
  const incoming = Array.isArray(entries) ? entries : [];
  const rows = getPlantMilestoneAdditions();
  const existing = new Set(rows.map(row => [
    clean(row.id),
    clean(row.date),
    clean(row.type),
    clean(row.note)
  ].join("|")));
  const createdAt = new Date().toISOString();
  const added = [];
  incoming.forEach(entry => {
    const id = clean(entry && entry.id);
    const date = clean(entry && entry.date);
    const type = clean(entry && entry.type);
    const note = clean(entry && entry.note);
    if (!id || !date || !type) return;
    const key = [id, date, type, note].join("|");
    if (existing.has(key)) return;
    existing.add(key);
    const row = {id, date, type, note, local: "true", createdAt};
    rows.push(row);
    added.push(row);
  });
  if (added.length) savePlantMilestoneAdditions(rows);
  return added;
}

function deletePlantMilestoneAddition(index) {
  const rows = getPlantMilestoneAdditions();
  const itemIndex = Number(index);
  if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= rows.length) return false;
  rows.splice(itemIndex, 1);
  savePlantMilestoneAdditions(rows);
  return true;
}

function clearPlantMilestoneAdditions() {
  savePlantMilestoneAdditions([]);
}

function buildPlantMilestoneExport(rows = getPlantMilestoneAdditions()) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: "Mina Växter lokal milstolpskö",
    items: (rows || []).map(row => ({
      id: clean(row.id),
      date: clean(row.date),
      type: clean(row.type),
      note: clean(row.note),
      createdAt: clean(row.createdAt)
    })).filter(row => row.id && row.date && row.type)
  };
}

function exportPlantMilestoneAdditions() {
  const payload = buildPlantMilestoneExport();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type: "application/json;charset=utf-8"});
  downloadBlob("mina-vaxter-milstolpar.json", blob);
  return payload;
}

function importPlantMilestoneAdditions(payload) {
  const items = Array.isArray(payload && payload.items) ? payload.items : [];
  return addPlantMilestoneEntries(items);
}

function combinedPlantMilestones(baseMilestones, plantId) {
  const id = clean(plantId);
  const localRows = getPlantMilestoneAdditions().filter(row => clean(row.id) === id);
  return [...(baseMilestones || []), ...localRows]
    .sort((a, b) => sortNatural(b.date, a.date) || sortNatural(b.createdAt || "", a.createdAt || "") || sortNatural(b.type, a.type));
}

function combinedMilestonesByPlant(rows) {
  const map = milestonesByPlant(rows || []);
  getPlantMilestoneAdditions().forEach(row => {
    const id = clean(row.id);
    if (!id) return;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
  });
  map.forEach(list => list.sort((a, b) => sortNatural(b.date, a.date) || sortNatural(b.createdAt || "", a.createdAt || "") || sortNatural(b.type, a.type)));
  return map;
}

function milestonesByPlant(rows) {
  const map = new Map();
  rows.forEach(row => {
    const id = clean(row.id);
    if (!id) return;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
  });
  map.forEach(list => list.sort((a, b) => sortNatural(b.date, a.date) || sortNatural(b.type, a.type)));
  return map;
}

function latestPlantMilestone(milestones) {
  return (milestones || []).slice().sort((a, b) => sortNatural(b.date, a.date) || sortNatural(b.type, a.type))[0] || null;
}

function combinedLogsByPlant(rows) {
  return combinedMilestonesByPlant(rows);
}

function latestPlantLog(logs) {
  return latestPlantMilestone(logs);
}

function milestoneSummary(log) {
  if (!log) return "";
  return `
    <div class="milestone">
      <div class="milestone-label">Senaste milstolpe</div>
      <div class="milestone-value"><span>${htmlEscape(milestoneIcon(log.type))}</span><strong>${htmlEscape(log.type)}</strong><span>${htmlEscape(log.date)}</span></div>
    </div>
  `;
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
  downloadBlob(filename, blob);
}

function downloadBlob(filename, blob) {
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
      .gallery-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
      .gallery-tools { display: flex; align-items: center; gap: 6px; padding: 4px; border-radius: 999px; background: rgba(255,255,255,.08); }
      .gallery-tool, .gallery-close, .gallery-nav {
        border: 0; background: rgba(255,255,255,.14); color: white; border-radius: 999px;
        width: 44px; min-width: 44px; height: 44px; flex: 0 0 44px; padding: 0; display: grid; place-items: center; font: 800 1.25rem/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .gallery-tool { width: 38px; height: 36px; font-size: 1rem; }
      .gallery-reset { width: auto; min-width: 56px; padding: 0 12px; font-size: .82rem; }
      .gallery-tool:disabled { opacity: .38; cursor: default; }
      .gallery-close { font-size: 1.6rem; }
        .gallery-stage { position: relative; min-height: 0; display: grid; place-items: center; overflow: hidden; touch-action: none; overscroll-behavior: contain; }
        .gallery-image {
          max-width: calc(100% - 16px); max-height: 100%; object-fit: contain; display: block;
          transform: translate3d(var(--pan-x, 0px), var(--pan-y, 0px), 0) scale(var(--zoom, 1));
          transform-origin: center center; transition: transform .14s ease; cursor: zoom-in; user-select: none; -webkit-user-drag: none;
        }
      .gallery-image.zoomed { cursor: grab; transition: none; }
      .gallery-image.dragging { cursor: grabbing; }
      .gallery-nav { position: absolute; top: 50%; transform: translateY(-50%); z-index: 2; }
      .gallery-prev { left: 12px; }
      .gallery-next { right: 12px; }
      .gallery-nav[hidden] { display: none; }
      .gallery-bottom { padding: 10px 16px max(16px, env(safe-area-inset-bottom)); text-align: center; }
      .gallery-caption { font-weight: 800; color: rgba(255,255,255,.92); }
      .gallery-count { margin-top: 6px; color: rgba(255,255,255,.66); font-size: .9rem; font-weight: 700; }
      .gallery-dots { display: flex; justify-content: center; gap: 7px; margin-top: 10px; }
      .gallery-dot { width: 7px; height: 7px; border-radius: 999px; background: rgba(255,255,255,.32); }
      .gallery-dot.active { background: white; }
      @media (max-width: 700px) {
        .gallery-tools { display: none; }
        .gallery-nav {
          display: grid; width: 42px; height: 52px; border-radius: 999px;
          background: rgba(0,0,0,.32); backdrop-filter: blur(8px);
        }
        .gallery-nav[hidden] { display: none; }
        .gallery-prev { left: 8px; }
          .gallery-next { right: 8px; }
          .gallery-image { max-width: calc(100% - 16px); max-height: 100%; }
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
        <div class="gallery-actions">
          <div class="gallery-tools" aria-label="Bildzoom">
            <button class="gallery-tool gallery-zoom-out" type="button" aria-label="Zooma ut">−</button>
            <button class="gallery-tool gallery-reset" type="button" aria-label="Återställ zoom">100%</button>
            <button class="gallery-tool gallery-zoom-in" type="button" aria-label="Zooma in">+</button>
          </div>
          <button class="gallery-close" type="button" aria-label="Stäng">×</button>
        </div>
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
  dialog.galleryState = {
    items: [], index: 0, startX: 0, startY: 0,
    zoom: 1, panX: 0, panY: 0, lastTap: 0, lastClick: 0, pointers: new Map(),
    dragStartX: 0, dragStartY: 0, startPanX: 0, startPanY: 0, pinchDistance: 0, pinchZoom: 1,
    lastPointerAt: 0, lastTouchTap: 0, lastSwipeAt: 0, didSwipe: false
  };
  const isGallerySwipe = (dx, dy) => Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy) * 1.08;

  const img = dialog.querySelector("#modalImg");
  const zoomOutButton = dialog.querySelector(".gallery-zoom-out");
  const zoomInButton = dialog.querySelector(".gallery-zoom-in");
  const resetButton = dialog.querySelector(".gallery-reset");
  const updateZoomControls = () => {
    const state = dialog.galleryState;
    zoomOutButton.disabled = state.zoom <= 1.01;
    zoomInButton.disabled = state.zoom >= 3.99;
    resetButton.textContent = state.zoom <= 1.01 ? "100%" : `${Math.round(state.zoom * 100)}%`;
  };
  const clampPan = () => {
    const state = dialog.galleryState;
    const maxX = Math.max(0, ((img.clientWidth || 0) * state.zoom - stage.clientWidth) / 2);
    const maxY = Math.max(0, ((img.clientHeight || 0) * state.zoom - stage.clientHeight) / 2);
    state.panX = Math.min(maxX, Math.max(-maxX, state.panX));
    state.panY = Math.min(maxY, Math.max(-maxY, state.panY));
  };
  const applyZoom = () => {
    const state = dialog.galleryState;
    if (state.zoom <= 1.01) {
      state.zoom = 1; state.panX = 0; state.panY = 0;
    } else {
      clampPan();
    }
    img.style.setProperty("--zoom", state.zoom);
    img.style.setProperty("--pan-x", `${state.panX}px`);
    img.style.setProperty("--pan-y", `${state.panY}px`);
    img.classList.toggle("zoomed", state.zoom > 1);
    updateZoomControls();
  };
  const resetZoom = () => {
    const state = dialog.galleryState;
    state.zoom = 1; state.panX = 0; state.panY = 0;
    applyZoom();
  };
  const setZoom = zoom => {
    const state = dialog.galleryState;
    state.zoom = Math.min(4, Math.max(1, zoom));
    applyZoom();
  };
  const zoomBy = amount => setZoom(dialog.galleryState.zoom + amount);
  const toggleZoom = () => {
    const state = dialog.galleryState;
    if (state.zoom > 1) resetZoom();
    else setZoom(2.4);
  };
  const distance = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  const show = index => {
    const state = dialog.galleryState;
    if (!state.items.length) return;
    resetZoom();
    state.index = (index + state.items.length) % state.items.length;
    const item = state.items[state.index];
    img.src = item.file;
    img.alt = item.alt || item.title || "";
    dialog.querySelector("#galleryTitle").textContent = item.title || "";
    dialog.querySelector("#modalCaption").textContent = item.caption || item.label || item.title || "";
    dialog.querySelector("#galleryCount").textContent = `${state.index + 1} av ${state.items.length}`;
    dialog.querySelector("#galleryDots").innerHTML = state.items.map((_, dotIndex) =>
      `<span class="gallery-dot ${dotIndex === state.index ? "active" : ""}"></span>`
    ).join("");
    dialog.querySelector(".gallery-prev").hidden = state.items.length < 2;
    dialog.querySelector(".gallery-next").hidden = state.items.length < 2;
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
  zoomOutButton.addEventListener("click", event => {
    event.stopPropagation();
    zoomBy(-.35);
  });
  zoomInButton.addEventListener("click", event => {
    event.stopPropagation();
    zoomBy(.35);
  });
  resetButton.addEventListener("click", event => {
    event.stopPropagation();
    resetZoom();
  });
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("keydown", event => {
    if (event.key === "ArrowLeft") show(dialog.galleryState.index - 1);
    if (event.key === "ArrowRight") show(dialog.galleryState.index + 1);
    if (event.key === "+" || event.key === "=") zoomBy(.35);
    if (event.key === "-" || event.key === "_") zoomBy(-.35);
    if (event.key === "0" || event.key === "Escape") resetZoom();
  });

  const stage = dialog.querySelector(".gallery-stage");
  stage.addEventListener("click", event => {
    if (event.target.closest(".gallery-nav")) return;
    if (dialog.galleryState.didSwipe) {
      dialog.galleryState.didSwipe = false;
      dialog.galleryState.lastClick = 0;
      return;
    }
    const state = dialog.galleryState;
    const now = Date.now();
    if (now - state.lastClick < 340) {
      event.preventDefault();
      window.clearTimeout(state.tapNavTimer);
      toggleZoom();
      state.lastClick = 0;
    } else {
      state.lastClick = now;
      window.clearTimeout(state.tapNavTimer);
      state.tapNavTimer = window.setTimeout(() => {
        if (state.zoom > 1 || state.items.length < 2) return;
        const rect = stage.getBoundingClientRect();
        const x = event.clientX - rect.left;
        if (x < rect.width * .28) show(state.index - 1);
        if (x > rect.width * .72) show(state.index + 1);
      }, 360);
    }
  });

  stage.addEventListener("pointerdown", event => {
    if (!event.isPrimary && event.pointerType === "mouse") return;
    const state = dialog.galleryState;
    stage.setPointerCapture(event.pointerId);
    state.lastPointerAt = Date.now();
    state.pointers.set(event.pointerId, {clientX: event.clientX, clientY: event.clientY});
    if (state.pointers.size === 1) {
      state.startX = event.clientX;
      state.startY = event.clientY;
      state.dragStartX = event.clientX;
      state.dragStartY = event.clientY;
      state.startPanX = state.panX;
      state.startPanY = state.panY;
      img.classList.toggle("dragging", state.zoom > 1);
    }
    if (state.pointers.size === 2) {
      const points = [...state.pointers.values()];
      state.pinchDistance = distance(points[0], points[1]);
      state.pinchZoom = state.zoom;
    }
  });

  stage.addEventListener("pointermove", event => {
    const state = dialog.galleryState;
    if (!state.pointers.has(event.pointerId)) return;
    state.pointers.set(event.pointerId, {clientX: event.clientX, clientY: event.clientY});
    if (state.pointers.size === 2) {
      const points = [...state.pointers.values()];
      const nextDistance = distance(points[0], points[1]);
      if (state.pinchDistance > 0) setZoom(state.pinchZoom * (nextDistance / state.pinchDistance));
      return;
    }
    if (state.zoom > 1 && state.pointers.size === 1) {
      state.panX = state.startPanX + event.clientX - state.dragStartX;
      state.panY = state.startPanY + event.clientY - state.dragStartY;
      applyZoom();
    }
  });

  stage.addEventListener("pointerup", event => {
    const state = dialog.galleryState;
    if (Date.now() - state.lastSwipeAt < 260) {
      state.pointers.delete(event.pointerId);
      img.classList.remove("dragging");
      return;
    }
    const startX = state.startX;
    const startY = state.startY;
    state.pointers.delete(event.pointerId);
    img.classList.remove("dragging");
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    applyZoom();
    if (state.zoom > 1 && Math.hypot(dx, dy) > 8) {
      state.didSwipe = true;
      return;
    }
    if (state.zoom <= 1 && isGallerySwipe(dx, dy)) {
      state.didSwipe = true;
      show(state.index + (dx < 0 ? 1 : -1));
      return;
    }
  });

  stage.addEventListener("pointercancel", event => {
    dialog.galleryState.pointers.delete(event.pointerId);
    img.classList.remove("dragging");
  });

  stage.addEventListener("wheel", event => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? .18 : -.18;
    setZoom(dialog.galleryState.zoom + delta);
  }, {passive: false});

  stage.addEventListener("touchstart", event => {
    const state = dialog.galleryState;
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      state.startX = touch.clientX;
      state.startY = touch.clientY;
      state.dragStartX = touch.clientX;
      state.dragStartY = touch.clientY;
      state.startPanX = state.panX;
      state.startPanY = state.panY;
    }
    if (event.touches.length === 2) {
      state.pinchDistance = distance(event.touches[0], event.touches[1]);
      state.pinchZoom = state.zoom;
    }
  }, {passive: false});

  stage.addEventListener("touchmove", event => {
    const state = dialog.galleryState;
    if (event.touches.length === 2) {
      event.preventDefault();
      const nextDistance = distance(event.touches[0], event.touches[1]);
      if (state.pinchDistance > 0) setZoom(state.pinchZoom * (nextDistance / state.pinchDistance));
      return;
    }
    if (state.zoom > 1 && event.touches.length === 1) {
      event.preventDefault();
      const touch = event.touches[0];
      state.panX = state.startPanX + touch.clientX - state.dragStartX;
      state.panY = state.startPanY + touch.clientY - state.dragStartY;
      applyZoom();
    }
  }, {passive: false});

  stage.addEventListener("touchend", event => {
    const state = dialog.galleryState;
    const touch = event.changedTouches[0];
    if (!touch || event.touches.length > 0) return;
    const dx = touch.clientX - state.startX;
    const dy = touch.clientY - state.startY;
    applyZoom();
    if (state.zoom > 1 && Math.hypot(dx, dy) > 8) {
      state.didSwipe = true;
      state.lastSwipeAt = Date.now();
      return;
    }
    if (state.zoom <= 1 && isGallerySwipe(dx, dy)) {
      state.didSwipe = true;
      state.lastSwipeAt = Date.now();
      show(state.index + (dx < 0 ? 1 : -1));
      return;
    }
  }, {passive: false});
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

function ensurePlantMilestones() {
  if (document.body.dataset.plantMilestonesReady === "true") return;
  document.body.dataset.plantMilestonesReady = "true";

  const style = document.createElement("style");
  style.id = "plantLogStyles";
  style.textContent = `
    .plant-card .card-body { position: relative; }
    .plant-card .card-body h2 { padding-right: 0; overflow-wrap: normal; word-break: normal; hyphens: none; }
    .plant-log-btn {
      border: 1px solid rgba(125,79,59,.35); background: var(--paper, #fffdf8); color: var(--accent, #7d4f3b);
      border-radius: 999px; width: 38px; height: 38px; padding: 0; display: grid; place-items: center;
      font: inherit; font-size: 1rem; font-weight: 800; cursor: pointer; line-height: 1;
    }
    .plant-log-btn svg { width: 21px; height: 21px; display: block; stroke: currentColor; }
    .plant-log-btn:active { transform: scale(.96); }
    .plant-card-head {
      display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 10px; margin-bottom: 10px;
    }
    .plant-card-head h2 { min-width: 0; }
    .plant-card-head .import-actions, .plant-card-head .favorite-log-action {
      position: static; display: flex; align-items: center; justify-content: flex-end; gap: 6px;
    }
    .milestone {
      border-top: 1px solid var(--line, #ded2c2); padding-top: 11px; display: grid; gap: 4px;
    }
    .milestone-label {
      color: var(--accent, #7d4f3b); text-transform: uppercase; letter-spacing: .16em;
      font-size: .72rem; font-weight: 900;
    }
    .milestone-value {
      display: flex; align-items: center; flex-wrap: wrap; gap: 7px; color: var(--muted, #6f655b);
      font-size: .9rem; font-weight: 750;
    }
    .milestone-value strong { color: var(--ink, #2b251f); }
    dialog.plant-log-dialog {
      width: min(94vw, 680px); max-height: 86vh; overflow: auto; border: 0; border-radius: 22px;
      padding: 0; background: var(--paper, #fffdf8); color: var(--ink, #2b251f);
      box-shadow: 0 24px 80px rgba(0,0,0,.26);
    }
    dialog.plant-log-dialog::backdrop { background: rgba(22,18,15,.50); }
    .plant-log-panel { padding: 20px; display: grid; gap: 16px; }
    .plant-log-panel header { padding: 0; text-align: left; display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
    .plant-log-panel h2 { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 2rem; line-height: 1.02; }
    .plant-log-panel p { margin: 5px 0 0; color: var(--muted, #6f655b); font-weight: 700; }
    .plant-log-close {
      border: 1px solid var(--line, #ded2c2); background: transparent; color: var(--ink, #2b251f);
      border-radius: 999px; width: 42px; min-width: 42px; height: 42px; flex: 0 0 42px; padding: 0; display: grid; place-items: center;
      font-size: 1.4rem; line-height: 1; cursor: pointer;
    }
    .plant-log-list { display: grid; gap: 10px; }
    .plant-log-form {
      border: 1px solid var(--line, #ded2c2); border-radius: 18px; padding: 13px;
      background: rgba(255,255,255,.48); display: grid; gap: 10px;
    }
    .plant-log-form-title {
      color: var(--accent, #7d4f3b); text-transform: uppercase; letter-spacing: .14em;
      font-size: .72rem; font-weight: 900;
    }
    .plant-log-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); gap: 8px; }
    .plant-log-form input, .plant-log-form select, .plant-log-form textarea {
      width: 100%; border: 1px solid var(--line, #ded2c2); border-radius: 13px;
      padding: 10px 11px; background: var(--paper, #fffdf8); color: var(--ink, #2b251f);
      font: inherit; font-weight: 750; box-sizing: border-box;
    }
    .plant-log-form textarea { min-height: 74px; resize: vertical; }
    .plant-log-submit {
      border: 0; border-radius: 999px; padding: 11px 15px; background: var(--accent, #7d4f3b);
      color: white; font: inherit; font-weight: 900; cursor: pointer;
    }
    .plant-log-item {
      border: 1px solid var(--line, #ded2c2); border-radius: 16px; padding: 12px 13px;
      background: rgba(255,255,255,.48);
    }
    .plant-log-meta {
      display: flex; align-items: center; flex-wrap: wrap; gap: 7px; font-size: .88rem; font-weight: 850;
    }
    .plant-log-date { color: var(--muted, #6f655b); }
    .plant-log-type { color: var(--ink, #2b251f); }
    .plant-log-note { margin-top: 6px; color: var(--muted, #6f655b); line-height: 1.42; }
    .plant-log-empty {
      color: var(--muted, #6f655b); border: 1px dashed var(--line, #ded2c2);
      border-radius: 16px; padding: 18px; text-align: center; font-weight: 800;
    }
    .milestone-queue-button {
      position: fixed; right: 16px; bottom: max(76px, calc(env(safe-area-inset-bottom) + 76px)); z-index: 19;
      border: 0; border-radius: 999px; min-width: 52px; height: 48px; padding: 0 13px;
      background: rgba(96,119,97,.68); color: white; box-shadow: 0 12px 34px rgba(43,37,31,.14);
      font: inherit; font-size: .82rem; font-weight: 900; cursor: pointer;
    }
    .milestone-queue-button.has-items { background: rgba(96,119,97,.92); box-shadow: 0 12px 34px rgba(43,37,31,.18); }
    .milestone-queue-button[hidden] { display: none; }
    dialog.milestone-queue-dialog {
      width: min(94vw, 720px); max-height: 88vh; overflow: auto; border: 0; border-radius: 22px;
      padding: 0; background: var(--paper, #fffdf8); color: var(--ink, #2b251f); box-shadow: 0 24px 80px rgba(0,0,0,.24);
    }
    dialog.milestone-queue-dialog::backdrop { background: rgba(22,18,15,.48); }
    .milestone-queue-panel { padding: 18px; display: grid; gap: 14px; }
    .milestone-queue-panel header { padding: 0; text-align: left; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .milestone-queue-panel h2 { margin: 0; font-size: 1.5rem; line-height: 1.1; }
    .milestone-queue-panel p { margin: 4px 0 0; color: var(--muted, #6f655b); }
    .milestone-queue-close {
      border: 1px solid var(--line, #ded2c2); background: transparent; color: var(--ink, #2b251f);
      border-radius: 999px; width: 40px; min-width: 40px; height: 40px; flex: 0 0 40px; padding: 0; display: grid; place-items: center;
      font-size: 1.35rem; line-height: 1; cursor: pointer;
    }
    .milestone-queue-list { display: grid; gap: 10px; }
    .milestone-queue-item {
      display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center;
      border: 1px solid var(--line, #ded2c2); border-radius: 16px; padding: 10px 11px; background: rgba(255,255,255,.54);
    }
    .milestone-queue-item strong { display: block; }
    .milestone-queue-item small { color: var(--muted, #6f655b); display: block; margin-top: 2px; }
    .milestone-queue-delete { border: 0; background: transparent; color: var(--accent, #7d4f3b); font: inherit; font-weight: 850; cursor: pointer; padding: 8px; }
    .milestone-queue-empty { color: var(--muted, #6f655b); border: 1px dashed var(--line, #ded2c2); border-radius: 16px; padding: 18px; text-align: center; font-weight: 700; }
    .milestone-queue-buttons { display: flex; justify-content: flex-end; gap: 9px; flex-wrap: wrap; }
    .milestone-queue-buttons button {
      border: 1px solid var(--line, #ded2c2); border-radius: 999px; padding: 10px 13px; font: inherit; font-weight: 850; cursor: pointer;
    }
    .milestone-queue-buttons .primary { background: var(--accent, #7d4f3b); color: white; border-color: var(--accent, #7d4f3b); }
    .milestone-queue-buttons .secondary { background: white; color: var(--accent, #7d4f3b); border-color: rgba(125,79,59,.35); }
    @media (max-width: 560px) {
      .plant-log-fields { grid-template-columns: 1fr; }
      .plant-log-panel { padding: 16px; }
    }
  `;
  document.head.appendChild(style);

  const dialog = document.createElement("dialog");
  dialog.id = "plantLogDialog";
  dialog.className = "plant-log-dialog";
  document.body.appendChild(dialog);

  const queueButton = document.createElement("button");
  queueButton.id = "plantMilestoneQueueButton";
  queueButton.className = "milestone-queue-button";
  queueButton.type = "button";
  queueButton.title = "Milstolpskö";
  queueButton.setAttribute("aria-label", "Milstolpskö");
  document.body.appendChild(queueButton);

  const queueDialog = document.createElement("dialog");
  queueDialog.id = "plantMilestoneQueueDialog";
  queueDialog.className = "milestone-queue-dialog";
  document.body.appendChild(queueDialog);

  const importInput = document.createElement("input");
  importInput.id = "plantMilestoneImportInput";
  importInput.type = "file";
  importInput.accept = "application/json,.json";
  importInput.hidden = true;
  document.body.appendChild(importInput);

  document.addEventListener("click", event => {
    const button = event.target.closest(".plant-log-btn");
    if (!button) return;
    const card = button.closest(".plant-card");
    if (!card) return;
    openPlantMilestones(card);
  });

  queueButton.addEventListener("click", openPlantMilestoneQueue);
  importInput.addEventListener("change", async () => {
    const file = importInput.files && importInput.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await readFileText(file));
      const count = Array.isArray(parsed.items) ? parsed.items.length : 0;
      const exportedAt = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString("sv-SE") : "okänd tid";
      if (!confirm(`Importera milstolpar?\n\nFilen innehåller ${count} milstolpar.\nExporterad: ${exportedAt}\n\nNya milstolpar läggs till i kön.`)) return;
      const added = importPlantMilestoneAdditions(parsed);
      alert(`${added.length} nya milstolpar importerades.`);
      window.dispatchEvent(new CustomEvent("plant-milestone-added", {detail: {count: added.length}}));
      openPlantMilestoneQueue();
    } catch (error) {
      alert("Kunde inte läsa milstolpsfilen.");
    } finally {
      importInput.value = "";
    }
  });

  updatePlantMilestoneQueueUI();
}

function updatePlantMilestoneQueueUI() {
  const button = document.querySelector("#plantMilestoneQueueButton");
  if (!button) return;
  const count = getPlantMilestoneAdditions().length;
  button.classList.toggle("has-items", count > 0);
  button.textContent = count ? `Milstolpar (${count})` : "Milstolpar";
}

function openPlantMilestoneQueue() {
  const dialog = document.querySelector("#plantMilestoneQueueDialog");
  if (!dialog) return;
  const items = getPlantMilestoneAdditions();
  const rows = items.map((item, index) => {
    const meta = [item.date, item.type].filter(Boolean).join(" · ");
    return `
      <article class="milestone-queue-item">
        <div>
          <strong>${htmlEscape(item.id)}</strong>
          <small>${htmlEscape(meta)}</small>
          ${clean(item.note) ? `<small>${htmlEscape(item.note)}</small>` : ""}
        </div>
        <button class="milestone-queue-delete" type="button" data-delete-milestone="${index}">Ta bort</button>
      </article>
    `;
  }).join("");
  dialog.innerHTML = `
    <div class="milestone-queue-panel">
      <header>
        <div>
          <h2>Milstolpskö</h2>
          <p>${items.length ? "Sparade lokalt i den här webbläsaren." : "Kön är tom just nu."}</p>
        </div>
        <button class="milestone-queue-close" type="button" aria-label="Stäng">×</button>
      </header>
      <div class="milestone-queue-list">${rows || '<div class="milestone-queue-empty">Inga nya milstolpar i kön.</div>'}</div>
      <div class="milestone-queue-buttons">
        <button class="primary" type="button" data-export-milestones ${items.length ? "" : "disabled"}>Exportera milstolpar</button>
        <button class="secondary" type="button" data-import-milestones>Importera fil</button>
        <button class="secondary" type="button" data-clear-milestones ${items.length ? "" : "disabled"}>Rensa kö</button>
      </div>
    </div>
  `;
  if (!dialog.open) dialog.showModal();
  dialog.querySelector(".milestone-queue-close").addEventListener("click", () => dialog.close());
  dialog.querySelectorAll("[data-delete-milestone]").forEach(button => {
    button.addEventListener("click", () => {
      deletePlantMilestoneAddition(button.dataset.deleteMilestone);
      window.dispatchEvent(new CustomEvent("plant-milestone-added", {detail: {deleted: true}}));
      openPlantMilestoneQueue();
    });
  });
  dialog.querySelector("[data-export-milestones]").addEventListener("click", () => {
    exportPlantMilestoneAdditions();
  });
  dialog.querySelector("[data-import-milestones]").addEventListener("click", () => {
    document.querySelector("#plantMilestoneImportInput")?.click();
  });
  dialog.querySelector("[data-clear-milestones]").addEventListener("click", () => {
    if (!confirm("Ta bort alla milstolpar i kön? Gör detta först när de är sparade permanent i katalogen.")) return;
    clearPlantMilestoneAdditions();
    window.dispatchEvent(new CustomEvent("plant-milestone-added", {detail: {cleared: true}}));
    openPlantMilestoneQueue();
  });
}

function openPlantMilestones(card) {
  const dialog = document.querySelector("#plantLogDialog");
  if (!dialog) return;
  let milestones = [];
  try { milestones = JSON.parse(card.dataset.milestones || card.dataset.log || "[]"); } catch (e) { milestones = []; }
  const title = card.dataset.plantName || card.dataset.plantId || "Växt";
  const id = card.dataset.plantId || "";
  milestones = combinedPlantMilestones(milestones, id);
  const options = plantMilestoneTypes
    .map(type => `<option value="${htmlEscape(type)}">${htmlEscape(type)}</option>`)
    .join("");
  const rows = milestones.map(milestone => `
    <article class="plant-log-item">
      <div class="plant-log-meta">
        <span>${htmlEscape(milestoneIcon(milestone.type))}</span>
        <span class="plant-log-date">${htmlEscape(milestone.date)}</span>
        <span class="plant-log-type">${htmlEscape(milestone.type)}</span>
      </div>
      ${clean(milestone.note) ? `<div class="plant-log-note">${htmlEscape(milestone.note)}</div>` : ""}
    </article>
  `).join("");
  dialog.innerHTML = `
    <div class="plant-log-panel">
      <header>
        <div>
          <h2>${htmlEscape(title)}</h2>
          <p>${htmlEscape(id)}</p>
        </div>
        <button class="plant-log-close" type="button" aria-label="Stäng">×</button>
      </header>
      <form class="plant-log-form" method="dialog">
        <div class="plant-log-form-title">Ny milstolpe</div>
        <div class="plant-log-fields">
          <input name="date" type="date" value="${htmlEscape(localDateString())}" aria-label="Datum" required>
          <select name="type" aria-label="Typ av milstolpe" required>${options}</select>
        </div>
        <textarea name="note" maxlength="160" placeholder="Kort anteckning, frivilligt"></textarea>
        <button class="plant-log-submit" type="submit">Spara milstolpe</button>
      </form>
      <div class="plant-log-list">${rows || '<div class="plant-log-empty">Inga milstolpar ännu.</div>'}</div>
    </div>
  `;
  dialog.querySelector(".plant-log-close").addEventListener("click", () => dialog.close(), {once: true});
  dialog.querySelector(".plant-log-form").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.currentTarget;
    const entry = addPlantMilestoneEntry({
      id,
      date: form.elements.date.value,
      type: form.elements.type.value,
      note: form.elements.note.value
    });
    if (entry) {
      window.dispatchEvent(new CustomEvent("plant-milestone-added", {detail: entry}));
      dialog.close();
    }
  });
  dialog.showModal();
}

function ensurePlantLogs() {
  ensurePlantMilestones();
}

const plantImageImportDB = "mina-vaxter-image-import";
const plantImageImportDBVersion = 2;
const plantImageImportStore = "photos";
let plantImageImportPending = null;

function htmlEscape(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function localDateString(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function safeFilePart(value, fallback = "bild") {
  return String(value || fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

function extensionForImage(item) {
  const name = String(item.originalFileName || "");
  const match = name.match(/\.([a-z0-9]{2,5})$/i);
  if (match) return match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
  if (item.mime === "image/png") return "png";
  if (item.mime === "image/heic") return "heic";
  if (item.mime === "image/webp") return "webp";
  return "jpg";
}

function imageImportBlob(item) {
  if (item.blob instanceof Blob) return item.blob;
  if (item.data instanceof Blob) return item.data;
  if (item.data) return new Blob([item.data], {type: item.mime || "image/jpeg"});
  return new Blob([], {type: item.mime || "application/octet-stream"});
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return {dosTime, dosDate};
}

function crc32(bytes) {
  if (!crc32.table) {
    crc32.table = Array.from({length: 256}, (_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    });
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crc32.table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(bytes, value) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(bytes, value) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

async function createZipBlob(entries) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const {dosTime, dosDate} = dosDateTime();

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = new Uint8Array(await entry.blob.arrayBuffer());
    const crc = crc32(data);
    const local = [];
    writeUint32(local, 0x04034b50);
    writeUint16(local, 20);
    writeUint16(local, 0x0800);
    writeUint16(local, 0);
    writeUint16(local, dosTime);
    writeUint16(local, dosDate);
    writeUint32(local, crc);
    writeUint32(local, data.length);
    writeUint32(local, data.length);
    writeUint16(local, nameBytes.length);
    writeUint16(local, 0);
    chunks.push(new Uint8Array(local), nameBytes, data);

    const centralEntry = [];
    writeUint32(centralEntry, 0x02014b50);
    writeUint16(centralEntry, 20);
    writeUint16(centralEntry, 20);
    writeUint16(centralEntry, 0x0800);
    writeUint16(centralEntry, 0);
    writeUint16(centralEntry, dosTime);
    writeUint16(centralEntry, dosDate);
    writeUint32(centralEntry, crc);
    writeUint32(centralEntry, data.length);
    writeUint32(centralEntry, data.length);
    writeUint16(centralEntry, nameBytes.length);
    writeUint16(centralEntry, 0);
    writeUint16(centralEntry, 0);
    writeUint16(centralEntry, 0);
    writeUint16(centralEntry, 0);
    writeUint32(centralEntry, 0);
    writeUint32(centralEntry, offset);
    central.push(new Uint8Array(centralEntry), nameBytes);

    offset += local.length + nameBytes.length + data.length;
  }

  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = [];
  writeUint32(end, 0x06054b50);
  writeUint16(end, 0);
  writeUint16(end, 0);
  writeUint16(end, entries.length);
  writeUint16(end, entries.length);
  writeUint32(end, centralSize);
  writeUint32(end, offset);
  writeUint16(end, 0);

  return new Blob([...chunks, ...central, new Uint8Array(end)], {type: "application/zip"});
}

function openPlantImageImportDB() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB saknas i den här webbläsaren."));
      return;
    }
    const request = indexedDB.open(plantImageImportDB, plantImageImportDBVersion);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(plantImageImportStore)
        ? request.transaction.objectStore(plantImageImportStore)
        : db.createObjectStore(plantImageImportStore, {keyPath: "id"});
      if (!store.indexNames.contains("plantId")) {
        store.createIndex("plantId", "plantId", {unique: false});
      }
      if (!store.indexNames.contains("createdAt")) {
        store.createIndex("createdAt", "createdAt", {unique: false});
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getImageImportItems() {
  const db = await openPlantImageImportDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(plantImageImportStore, "readonly");
    const request = tx.objectStore(plantImageImportStore).getAll();
    request.onsuccess = () => resolve((request.result || []).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))));
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function addImageImportItem(item) {
  const db = await openPlantImageImportDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(plantImageImportStore, "readwrite");
    tx.objectStore(plantImageImportStore).put(item);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function deleteImageImportItem(id) {
  const db = await openPlantImageImportDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(plantImageImportStore, "readwrite");
    tx.objectStore(plantImageImportStore).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function clearImageImportItems() {
  const db = await openPlantImageImportDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(plantImageImportStore, "readwrite");
    tx.objectStore(plantImageImportStore).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

function ensurePlantImageImport() {
  if (document.body.dataset.imageImportReady === "true") return;
  document.body.dataset.imageImportReady = "true";

  const style = document.createElement("style");
  style.id = "plantImageImportStyles";
  style.textContent = `
    .plant-card .card-body { position: relative; }
    .plant-card .card-body h2 { padding-right: 0; overflow-wrap: normal; word-break: normal; hyphens: none; }
    .import-actions {
      position: relative; top: auto; right: auto; align-self: flex-end;
      display: flex; align-items: center; justify-content: flex-end; gap: 6px;
      margin-top: -4px;
    }
    .plant-card-head .import-actions, .plant-card-head .favorite-log-action {
      position: static; top: auto; right: auto; display: flex; align-items: center; justify-content: flex-end; gap: 6px;
    }
    .add-photo-btn {
      border: 1px solid rgba(125,79,59,.35); background: var(--paper, #fffdf8); color: var(--accent, #7d4f3b);
      border-radius: 999px; width: 38px; height: 38px; padding: 0; display: grid; place-items: center;
      font: inherit; font-size: 1rem; font-weight: 800; cursor: pointer; line-height: 1;
    }
    .add-photo-btn svg { width: 22px; height: 22px; display: block; stroke: currentColor; }
    .add-photo-btn:active { transform: scale(.96); }
    .import-badge {
      position: absolute; top: 31px; right: -4px; min-width: 18px; height: 18px; display: grid; place-items: center;
      background: rgba(96,119,97,.94); color: white; border: 2px solid var(--paper, #fffdf8);
      border-radius: 999px; padding: 0 5px; font-size: .68rem; font-weight: 900; box-shadow: 0 3px 10px rgba(43,37,31,.18);
    }
    .import-badge[hidden] { display: none; }
    .plant-card.image-drop-target {
      outline: 3px solid rgba(125,79,59,.48); outline-offset: 5px;
      box-shadow: 0 18px 54px rgba(125,79,59,.20);
    }
    .plant-card.image-drop-target::after {
      content: "Släpp bild här"; position: absolute; inset: 10px; z-index: 8; display: grid; place-items: center;
      border: 2px dashed rgba(125,79,59,.55); border-radius: inherit;
      background: rgba(255,253,248,.82); color: var(--accent, #7d4f3b);
      font-weight: 900; font-size: 1.05rem; pointer-events: none;
      backdrop-filter: blur(4px);
    }
    .import-queue-button {
      position: fixed; right: 16px; bottom: max(16px, env(safe-area-inset-bottom)); z-index: 20;
      border: 0; border-radius: 999px; width: 48px; height: 48px; padding: 0; background: rgba(125,79,59,.86); color: white;
      box-shadow: 0 12px 34px rgba(43,37,31,.20); font: inherit; font-size: .88rem; font-weight: 900; cursor: pointer;
    }
    .import-queue-button.has-items {
      left: 16px; right: 16px; width: auto; height: 52px; padding: 12px 15px;
    }
    dialog.import-dialog {
      width: min(94vw, 760px); max-height: 88vh; overflow: auto; border: 0; border-radius: 22px;
      padding: 0; background: var(--paper, #fffdf8); color: var(--ink, #2b251f); box-shadow: 0 24px 80px rgba(0,0,0,.24);
    }
    dialog.import-dialog::backdrop { background: rgba(22,18,15,.48); }
    .import-panel { padding: 18px; display: grid; gap: 14px; }
    .import-panel header { padding: 0; text-align: left; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .import-panel h2 { margin: 0; font-size: 1.5rem; line-height: 1.1; }
    .import-panel p { margin: 4px 0 0; color: var(--muted, #6f655b); }
    .import-close {
      border: 1px solid var(--line, #ded2c2); background: transparent; color: var(--ink, #2b251f);
      border-radius: 999px; width: 40px; min-width: 40px; height: 40px; flex: 0 0 40px; padding: 0; display: grid; place-items: center;
      font-size: 1.35rem; line-height: 1; cursor: pointer;
    }
    .import-form { display: grid; gap: 12px; }
    .import-preview { width: 100%; max-height: 320px; object-fit: contain; border-radius: 16px; background: #eadfce; }
    .import-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .import-fields label { display: grid; gap: 5px; color: var(--muted, #6f655b); font-size: .86rem; font-weight: 800; }
    .import-fields input, .import-fields select, .import-fields textarea {
      width: 100%; border: 1px solid var(--line, #ded2c2); border-radius: 14px; padding: 10px 11px;
      background: white; color: var(--ink, #2b251f); font: inherit;
    }
    .import-fields textarea { grid-column: 1 / -1; min-height: 74px; resize: vertical; }
    .import-buttons { display: flex; justify-content: flex-end; gap: 9px; flex-wrap: wrap; }
    .import-buttons button {
      border: 1px solid var(--line, #ded2c2); border-radius: 999px; padding: 10px 13px; font: inherit; font-weight: 850; cursor: pointer;
    }
    .import-buttons .primary { background: var(--accent, #7d4f3b); color: white; border-color: var(--accent, #7d4f3b); }
    .import-buttons .secondary { background: white; color: var(--accent, #7d4f3b); border-color: rgba(125,79,59,.35); }
    .import-list { display: grid; gap: 10px; }
    .import-item {
      display: grid; grid-template-columns: 76px 1fr auto; gap: 11px; align-items: center;
      border: 1px solid var(--line, #ded2c2); border-radius: 16px; padding: 9px; background: rgba(255,255,255,.54);
    }
    .import-item img { width: 76px; height: 76px; object-fit: cover; border-radius: 12px; background: #eadfce; }
    .import-item strong { display: block; }
    .import-item small { color: var(--muted, #6f655b); display: block; margin-top: 2px; }
    .import-delete { border: 0; background: transparent; color: var(--accent, #7d4f3b); font: inherit; font-weight: 850; cursor: pointer; padding: 8px; }
    .import-empty { color: var(--muted, #6f655b); border: 1px dashed var(--line, #ded2c2); border-radius: 16px; padding: 18px; text-align: center; font-weight: 700; }
    @media (max-width: 680px) {
      .import-fields { grid-template-columns: 1fr; }
      .import-item { grid-template-columns: 64px 1fr; }
      .import-item img { width: 64px; height: 64px; }
      .import-delete { grid-column: 2; justify-self: start; padding-left: 0; }
    }
  `;
  document.head.appendChild(style);

  const input = document.createElement("input");
  input.id = "plantImageImportInput";
  input.type = "file";
  input.accept = "image/*";
  input.hidden = true;
  document.body.appendChild(input);

  const queueButton = document.createElement("button");
  queueButton.className = "import-queue-button";
  queueButton.type = "button";
  queueButton.textContent = "Kö";
  queueButton.setAttribute("aria-label", "Bildkö");
  queueButton.title = "Bildkö";
  document.body.appendChild(queueButton);

  const dialog = document.createElement("dialog");
  dialog.id = "plantImageImportDialog";
  dialog.className = "import-dialog";
  document.body.appendChild(dialog);

  const imageFileFromTransfer = dataTransfer => {
    if (!dataTransfer) return null;
    return [...(dataTransfer.files || [])].find(file => file && file.type && file.type.startsWith("image/")) || null;
  };

  const hasImageTransfer = dataTransfer => {
    if (!dataTransfer) return false;
    if (imageFileFromTransfer(dataTransfer)) return true;
    return [...(dataTransfer.items || [])].some(item => item.kind === "file" && item.type && item.type.startsWith("image/"));
  };

  const setPendingPlantFromCard = card => {
    plantImageImportPending = {
      category: card.dataset.category || document.title || "",
      plantId: card.dataset.plantId || "",
      plantName: card.dataset.plantName || card.dataset.plantId || ""
    };
  };

  const clearDropTargets = () => {
    document.querySelectorAll(".plant-card.image-drop-target").forEach(card => card.classList.remove("image-drop-target"));
  };

  const closestPlantCard = target => {
    return target && typeof target.closest === "function" ? target.closest(".plant-card[data-plant-id]") : null;
  };

  document.addEventListener("click", event => {
    const button = event.target.closest(".add-photo-btn");
    if (!button) return;
    const card = button.closest(".plant-card");
    if (!card) return;
    setPendingPlantFromCard(card);
    input.value = "";
    input.click();
  });

  document.addEventListener("dragenter", event => {
    const hasImage = hasImageTransfer(event.dataTransfer);
    const card = closestPlantCard(event.target);
    if (!hasImage || !card) return;
    event.preventDefault();
    clearDropTargets();
    card.classList.add("image-drop-target");
  });

  document.addEventListener("dragover", event => {
    const hasImage = hasImageTransfer(event.dataTransfer);
    const card = closestPlantCard(event.target);
    if (!hasImage || !card) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!card.classList.contains("image-drop-target")) {
      clearDropTargets();
      card.classList.add("image-drop-target");
    }
  });

  document.addEventListener("dragleave", event => {
    if (!event.target || typeof event.target.closest !== "function" || !event.target.closest(".plant-card.image-drop-target")) return;
    const next = event.relatedTarget;
    if (next && event.target.closest(".plant-card")?.contains(next)) return;
    clearDropTargets();
  });

  document.addEventListener("drop", event => {
    const file = imageFileFromTransfer(event.dataTransfer);
    const card = closestPlantCard(event.target);
    clearDropTargets();
    if (!file || !card) return;
    event.preventDefault();
    setPendingPlantFromCard(card);
    openImageImportForm(file);
  });

  document.addEventListener("dragend", clearDropTargets);

  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file || !plantImageImportPending) return;
    openImageImportForm(file);
  });

  queueButton.addEventListener("click", openImageImportQueue);
  updatePlantImageImportUI();
}

function cameraLineIcon() {
  return `
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M4.8 11.8 C4.8 9.8 6.4 8.3 8.3 8.3 H11.7 L13.1 5.9 C13.6 5.1 14.4 4.7 15.3 4.7 H16.7 C17.6 4.7 18.4 5.1 18.9 5.9 L20.3 8.3 H23.7 C25.6 8.3 27.2 9.8 27.2 11.8 V23.8 C27.2 25.7 25.7 27.2 23.7 27.2 H8.3 C6.4 27.2 4.8 25.7 4.8 23.8 Z"
        fill="none" stroke-width="2.6" stroke-linejoin="round"/>
      <circle cx="16" cy="17.4" r="5.2" fill="none" stroke-width="2.6"/>
    </svg>
  `;
}

async function openImageImportForm(file) {
  const dialog = document.querySelector("#plantImageImportDialog");
  const previewUrl = URL.createObjectURL(file);
  const today = localDateString();
  dialog.innerHTML = `
    <form method="dialog" class="import-panel import-form" id="plantImageImportForm">
      <header>
        <div>
          <h2>Lägg till bild</h2>
          <p>${htmlEscape(plantImageImportPending.plantName)} · sparas i lokal importkö</p>
        </div>
        <button class="import-close" value="cancel" type="submit" aria-label="Stäng">×</button>
      </header>
      <img class="import-preview" src="${previewUrl}" alt="">
      <div class="import-fields">
        <label>Datum<input name="date" type="date" value="${today}"></label>
        <label>Bildtyp
          <select name="type">
            <option value="hel">hel</option>
            <option value="stam">stam</option>
            <option value="blomma">blomma</option>
            <option value="blad">blad</option>
            <option value="detalj">detalj</option>
            <option value="knopp">knopp</option>
            <option value="stickling">stickling</option>
            <option value="etikett">etikett</option>
          </select>
        </label>
        <textarea name="note" placeholder="Kort anteckning, frivilligt"></textarea>
      </div>
      <div class="import-buttons">
        <button class="secondary" value="cancel" type="submit">Avbryt</button>
        <button class="primary" value="save" type="submit">Spara i bildkö</button>
      </div>
    </form>
  `;
  dialog.showModal();
  dialog.addEventListener("close", () => URL.revokeObjectURL(previewUrl), {once: true});
  dialog.querySelector("#plantImageImportForm").addEventListener("submit", async event => {
    if (event.submitter && event.submitter.value !== "save") return;
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const createdAt = new Date().toISOString();
    const imageData = await file.arrayBuffer();
    await addImageImportItem({
      id: `${createdAt}-${Math.random().toString(16).slice(2)}`,
      createdAt,
      category: plantImageImportPending.category,
      plantId: plantImageImportPending.plantId,
      plantName: plantImageImportPending.plantName,
      date: data.get("date") || today,
      type: data.get("type") || "hel",
      note: String(data.get("note") || "").trim(),
      originalFileName: file.name || "iphone-bild.jpg",
      mime: file.type || "image/jpeg",
      size: file.size || 0,
      data: imageData
    });
    dialog.close();
    plantImageImportPending = null;
    updatePlantImageImportUI();
    openImageImportQueue();
  }, {once: true});
}

async function updatePlantImageImportUI() {
  let items = [];
  try { items = await getImageImportItems(); } catch (error) { items = []; }
  const button = document.querySelector(".import-queue-button");
  if (button) {
    button.classList.toggle("has-items", items.length > 0);
    button.textContent = items.length ? `Bildkö (${items.length})` : "Kö";
    button.setAttribute("aria-label", items.length ? `Bildkö med ${items.length} bilder` : "Bildkö");
  }
  const counts = items.reduce((map, item) => {
    map[item.plantId] = (map[item.plantId] || 0) + 1;
    return map;
  }, {});
  document.querySelectorAll(".plant-card[data-plant-id]").forEach(card => {
    const badge = card.querySelector("[data-import-badge]");
    if (!badge) return;
    const count = counts[card.dataset.plantId] || 0;
    badge.hidden = count === 0;
    badge.textContent = String(count);
  });
}

async function openImageImportQueue() {
  const dialog = document.querySelector("#plantImageImportDialog");
  let items = [];
  try { items = await getImageImportItems(); } catch (error) { items = []; }
  const urls = [];
  const rows = items.map(item => {
    const url = URL.createObjectURL(imageImportBlob(item));
    urls.push(url);
    const meta = [item.category, item.plantId, item.date, item.type, item.originalFileName].filter(Boolean).join(" · ");
    return `
      <article class="import-item">
        <img src="${url}" alt="">
        <div>
          <strong>${htmlEscape(item.plantName || item.plantId)}</strong>
          <small>${htmlEscape(meta)}</small>
          ${item.note ? `<small>${htmlEscape(item.note)}</small>` : ""}
        </div>
        <button class="import-delete" type="button" data-delete-import="${htmlEscape(item.id)}">Ta bort</button>
      </article>
    `;
  }).join("");
  dialog.innerHTML = `
    <div class="import-panel">
      <header>
        <div>
          <h2>Nya bilder att importera</h2>
          <p>${items.length ? "Sparade lokalt i den här webbläsaren." : "Kön är tom just nu."}</p>
        </div>
        <button class="import-close" type="button" aria-label="Stäng">×</button>
      </header>
      <div class="import-list">${rows || '<div class="import-empty">Inga nya bilder i kön.</div>'}</div>
      <div class="import-buttons">
        <button class="primary" type="button" data-export-package ${items.length ? "" : "disabled"}>Exportera bildpaket</button>
        <button class="secondary" type="button" data-clear-import ${items.length ? "" : "disabled"}>Rensa kö</button>
      </div>
    </div>
  `;
  dialog.showModal();
  dialog.addEventListener("close", () => urls.forEach(url => URL.revokeObjectURL(url)), {once: true});
  dialog.querySelector(".import-close").addEventListener("click", () => dialog.close());
  dialog.querySelectorAll("[data-delete-import]").forEach(button => {
    button.addEventListener("click", async () => {
      await deleteImageImportItem(button.dataset.deleteImport);
      updatePlantImageImportUI();
      openImageImportQueue();
    });
  });
  const clearButton = dialog.querySelector("[data-clear-import]");
  clearButton.addEventListener("click", async () => {
    if (!confirm("Ta bort alla bilder i importkön?")) return;
    await clearImageImportItems();
    updatePlantImageImportUI();
    openImageImportQueue();
  });
  const packageButton = dialog.querySelector("[data-export-package]");
  packageButton.addEventListener("click", async () => {
    packageButton.disabled = true;
    packageButton.textContent = "Skapar paket...";
    try {
      const zip = await createImageImportPackage(items);
      downloadBlob(`mina-vaxter-bildpaket-${localDateString()}.zip`, zip);
      packageButton.textContent = "Exportera bildpaket";
    } catch (error) {
      packageButton.textContent = "Kunde inte exportera";
      alert("Kunde inte skapa bildpaketet. Prova igen.");
    } finally {
      packageButton.disabled = false;
    }
  });
}

function buildImageImportManifest(items) {
  const counters = {};
  return {
    exportedAt: new Date().toISOString(),
    source: "Mina Växter lokal bildkö",
    items: items.map(item => {
      const key = [item.plantId, item.date, item.type].map(part => safeFilePart(part)).join("_");
      counters[key] = (counters[key] || 0) + 1;
      const sequence = String(counters[key]).padStart(2, "0");
      const extension = extensionForImage(item);
      const suggestedFileName = `${safeFilePart(item.plantId)}_${item.date}_${safeFilePart(item.type)}_${sequence}.${extension}`;
      return {
        id: item.id,
        category: item.category,
        plantId: item.plantId,
        plantName: item.plantName,
        date: item.date,
        type: item.type,
        note: item.note,
        originalFileName: item.originalFileName,
        mime: item.mime,
        size: item.size,
        suggestedFileName,
        packagePath: `images/${suggestedFileName}`,
        createdAt: item.createdAt
      };
    })
  };
}

async function createImageImportPackage(items) {
  const manifest = buildImageImportManifest(items);
  const entries = [
    {
      name: "manifest.json",
      blob: new Blob([JSON.stringify(manifest, null, 2)], {type: "application/json;charset=utf-8"})
    }
  ];
  manifest.items.forEach((manifestItem, index) => {
    entries.push({
      name: manifestItem.packagePath,
      blob: imageImportBlob(items[index])
    });
  });
  return createZipBlob(entries);
}

const plantFavoritesKey = "mina-vaxter-favorites-v1";

function getPlantFavorites() {
  try { return JSON.parse(localStorage.getItem(plantFavoritesKey) || "{}"); }
  catch (error) { return {}; }
}

function savePlantFavorites(favorites) {
  try { localStorage.setItem(plantFavoritesKey, JSON.stringify(favorites)); }
  catch (error) {}
}

function favoriteKey(category, plantId) {
  return `${category || ""}:${plantId || ""}`;
}

function favoriteFromCard(card) {
  const title = clean(card.dataset.plantName || card.querySelector("h2")?.textContent || card.dataset.plantId);
  const image = card.querySelector(".main-photo")?.getAttribute("src") || "";
  const dateLabel = card.querySelector(".date-ribbon")?.textContent || "";
  const latin = card.querySelector(".latin")?.textContent || "";
  const chips = [...card.querySelectorAll(".chip")].map(chip => clean(chip.textContent)).filter(Boolean).slice(0, 5);
  const notes = clean(card.querySelector(".notes")?.textContent || "");
  return {
    key: favoriteKey(card.dataset.category, card.dataset.plantId),
    category: card.dataset.category || "",
    plantId: card.dataset.plantId || "",
    plantName: title,
    latin,
    image,
    dateLabel,
    chips,
    notes,
    page: card.dataset.page || location.pathname.split("/").pop() || "index.html",
    updatedAt: new Date().toISOString()
  };
}

function ensurePlantFavorites() {
  if (document.body.dataset.favoritesReady === "true") return;
  document.body.dataset.favoritesReady = "true";
  if (!document.querySelector("#plantFavoriteStyles")) {
    const style = document.createElement("style");
    style.id = "plantFavoriteStyles";
    style.textContent = `
      .plant-card { position: relative; }
      .favorite-corner {
        position: absolute; top: 0; right: 0; z-index: 2; width: 46px; height: 46px; border: 0; padding: 0;
        background: transparent; cursor: pointer; color: rgba(125,79,59,.34);
      }
      .favorite-corner::before {
        content: ""; position: absolute; top: 0; right: 0; width: 0; height: 0;
        border-top: 46px solid rgba(255,253,248,.72); border-left: 46px solid transparent;
        filter: drop-shadow(-1px 2px 2px rgba(43,37,31,.10));
      }
      .favorite-corner::after {
        content: ""; position: absolute; top: 7px; right: 7px; width: 14px; height: 14px;
        border-top: 2px solid currentColor; border-right: 2px solid currentColor; transform: rotate(0deg);
      }
      .favorite-corner.active { color: #8f5638; }
      .favorite-corner.active::before { border-top-color: #e0b55c; }
      .favorite-corner:active { transform: scale(.97); }
      .favorite-empty {
        background: rgba(255,253,248,.78); border: 1px solid var(--line, #ded2c2); border-radius: 18px;
        padding: 24px; color: var(--muted, #6f655b); text-align: center; font-weight: 700;
      }
      .favorite-card-link { color: inherit; text-decoration: none; display: contents; }
    `;
    document.head.appendChild(style);
  }
  document.addEventListener("click", event => {
    const button = event.target.closest(".favorite-corner");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const card = button.closest(".plant-card");
    if (!card) return;
    const favorites = getPlantFavorites();
    const item = favoriteFromCard(card);
    if (favorites[item.key]) delete favorites[item.key];
    else favorites[item.key] = item;
    savePlantFavorites(favorites);
    updatePlantFavoriteUI();
    if (typeof renderFavoritesPage === "function" && document.querySelector("#favoriteGrid")) renderFavoritesPage();
  });
  updatePlantFavoriteUI();
}

function updatePlantFavoriteUI() {
  const favorites = getPlantFavorites();
  document.querySelectorAll(".plant-card[data-plant-id]").forEach(card => {
    if (!card.querySelector(".favorite-corner")) {
      const button = document.createElement("button");
      button.className = "favorite-corner";
      button.type = "button";
      button.setAttribute("aria-label", "Markera som favorit");
      button.title = "Favorit";
      card.appendChild(button);
    }
    const key = favoriteKey(card.dataset.category, card.dataset.plantId);
    const button = card.querySelector(".favorite-corner");
    const active = !!favorites[key];
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.setAttribute("aria-label", active ? "Ta bort favorit" : "Markera som favorit");
	    if (active) {
	      const existing = favorites[key] || {};
	      favorites[key] = {...existing, ...favoriteFromCard(card), focusNote: existing.focusNote || ""};
	    }
	  });
  savePlantFavorites(favorites);
}
