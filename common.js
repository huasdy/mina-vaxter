
function redirectStandaloneMobileCatalog() {
  const displayStandalone = typeof window.matchMedia === "function"
    && window.matchMedia("(display-mode: standalone)").matches;
  const standalone = window.navigator.standalone === true || displayStandalone;
  const pageName = window.location.pathname.split("/").pop();
  const categoryByPage = {
    "hibiskusar.html": "Hibiskus",
    "pelargoner.html": "Pelargon",
    "citrus.html": "Citrus",
    "udda.html": "Udda",
    "favoriter.html": "Hundöron",
    "sticklingar.html": "Sticklingar"
  };
  const targetView = categoryByPage[pageName];
  if (!standalone || window.innerWidth > 700 || !targetView) return false;

  const scriptUrl = new URL(document.currentScript?.src || "", window.location.href);
  const mobileUrl = new URL("iphone.html", window.location.href);
  const cacheVersion = scriptUrl.searchParams.get("v");
  if (cacheVersion) mobileUrl.searchParams.set("v", cacheVersion);
  if (targetView === "Hundöron") mobileUrl.searchParams.set("vy", "hundoron");
  else if (targetView === "Sticklingar") mobileUrl.searchParams.set("vy", "sticklingar");
  else mobileUrl.searchParams.set("kategori", targetView);
  window.location.replace(mobileUrl.toString());
  return true;
}

redirectStandaloneMobileCatalog();

function floatingSyncIcon() {
  return `
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M25 8v7h-7"/>
      <path d="M7 24v-7h7"/>
      <path d="M9.9 10.1A9 9 0 0 1 25 15"/>
      <path d="M22.1 21.9A9 9 0 0 1 7 17"/>
    </svg>
  `;
}

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

function plantIdentityName(row, fallback = "") {
  return clean(row && row.name) || clean(row && row.id) || clean(fallback);
}

function plantDisplayName(row, fallback = "") {
  return plantIdentityName(row, fallback) || clean(row && row.nickname);
}

function plantDisplayLabel(row, fallback = "") {
  const nickname = clean(row && row.nickname);
  const identity = plantIdentityName(row, fallback);
  return nickname && identity ? `${identity} · ${nickname}` : identity || nickname;
}

function plantHeadingHtml(row, fallback = "") {
  const nickname = clean(row && row.nickname);
  const identity = plantIdentityName(row, fallback);
  const title = identity || nickname;
  return `<h2>${htmlEscape(title)}</h2>${nickname && identity ? `<div class="plant-nickname">${htmlEscape(nickname)}</div>` : ""}`;
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
    row && row.arrival_type
  ].map(clean).join(" ").toLowerCase();
  const chips = [];
  const add = value => {
    if (value && !chips.includes(value)) chips.push(value);
  };
  const hasSownMilestone = (row && Array.isArray(row.logs) ? row.logs : [])
    .some(log => clean(log && log.type).toLocaleLowerCase("sv") === "sådd");

  if (getPlantCuttingsStatus(row && row.id, row && row.cuttings_available, row && row.cuttings_updated_at)) add("🌱 Stickling");
  if (hasSownMilestone) add("Frö");

  if (category === "Hibiskus") {
    if (clean(row && row.breeding_selected).toLowerCase() === "ja") add("🏷 Utvald");
  } else if (category === "Pelargon") {
    if (haystack.includes("doft")) add("Doft");
  } else if (category === "Citrus") {
    add("Inne");
  } else if (category === "Udda") {
    if (haystack.includes("doft") || haystack.includes("patchouli") || haystack.includes("salvia")) add("Doft");
    if (haystack.includes("fredskalla") || haystack.includes("hjärtbräken")) add("Inne");
  }

  return chips.length ? chips : [category];
}

function collectionChipHtml(category, row, escapeFn = htmlEscape) {
  return collectionChips(category, row)
    .map((label, index) => `<span class="chip ${index === 0 ? "green" : ""}"${label === "🌱 Stickling" ? ' data-status-chip="cuttings"' : ""}>${escapeFn(label)}</span>`)
    .join("");
}

function bildText(n) {
  return Number(n) === 1 ? "1 bild" : `${n} bilder`;
}

const plantStatusesStorageKey = "mina-vaxter-plant-statuses-v1";
const plantStatusChangesStorageKey = "mina-vaxter-plant-status-changes-v1";

function getPlantStatuses() {
  try {
    const parsed = JSON.parse(localStorage.getItem(plantStatusesStorageKey) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function getPlantStatusChanges() {
  try {
    const parsed = JSON.parse(localStorage.getItem(plantStatusChangesStorageKey) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function savePlantStatuses(statuses) {
  try { localStorage.setItem(plantStatusesStorageKey, JSON.stringify(statuses || {})); } catch (e) {}
}

function savePlantStatusChanges(changes) {
  try { localStorage.setItem(plantStatusChangesStorageKey, JSON.stringify(changes || {})); } catch (e) {}
}

function statusIsOn(value) {
  return ["ja", "true", "1", "på"].includes(clean(value).toLocaleLowerCase("sv"));
}

function getPlantCuttingsStatus(plantId, publishedValue = "", publishedUpdatedAt = "") {
  const id = clean(plantId);
  const local = getPlantStatuses()[id];
  if (!local) return statusIsOn(publishedValue);
  const localUpdatedAt = clean(local.updatedAt);
  if (publishedUpdatedAt && localUpdatedAt && publishedUpdatedAt >= localUpdatedAt) return statusIsOn(publishedValue);
  return Boolean(local.cuttingsAvailable);
}

function setPlantCuttingsStatus(plantId, category, enabled) {
  const id = clean(plantId);
  if (!id) return null;
  const entry = {
    id,
    category: clean(category) || "Pelargon",
    cuttingsAvailable: Boolean(enabled),
    updatedAt: new Date().toISOString()
  };
  const statuses = getPlantStatuses();
  statuses[id] = entry;
  savePlantStatuses(statuses);
  const changes = getPlantStatusChanges();
  changes[id] = entry;
  savePlantStatusChanges(changes);
  updatePlantCuttingsUI(id, entry.category, entry.cuttingsAvailable);
  updatePlantImageImportUI();
  window.dispatchEvent(new CustomEvent("plant-status-changed", {detail: entry}));
  return entry;
}

function buildPlantStatusExport(rows = Object.values(getPlantStatusChanges())) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: "Mina Växter lokala växtstatusar",
    items: (rows || []).map(row => ({
      id: clean(row.id),
      category: clean(row.category) || "Pelargon",
      cuttingsAvailable: Boolean(row.cuttingsAvailable),
      updatedAt: clean(row.updatedAt)
    })).filter(row => row.id && row.updatedAt)
  };
}

function deletePlantStatusChange(plantId) {
  const changes = getPlantStatusChanges();
  delete changes[clean(plantId)];
  savePlantStatusChanges(changes);
}

function clearPlantStatusChanges() {
  savePlantStatusChanges({});
}

function updatePlantCuttingsUI(plantId, category, enabled) {
  document.querySelectorAll('.plant-card[data-plant-id]').forEach(card => {
    if (card.dataset.plantId !== plantId || clean(card.dataset.category) !== clean(category)) return;
    card.dataset.cuttingsAvailable = enabled ? "ja" : "nej";
    const chips = card.querySelector(".plant-card-chip-slot .chips");
    if (!chips) return;
    chips.querySelectorAll('[data-status-chip="cuttings"]').forEach(chip => chip.remove());
    if (enabled) {
      const chip = document.createElement("span");
      chip.className = "chip green";
      chip.dataset.statusChip = "cuttings";
      chip.textContent = "🌱 Stickling";
      chips.prepend(chip);
    }
  });
}

const plantCardNotesStorageKey = "mina-vaxter-card-notes-v1";
const plantCardNoteChangesStorageKey = "mina-vaxter-card-note-changes-v1";

function getPlantCardNotes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(plantCardNotesStorageKey) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function getPlantCardNoteChanges() {
  try {
    const parsed = JSON.parse(localStorage.getItem(plantCardNoteChangesStorageKey) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function savePlantCardNoteChanges(changes) {
  try { localStorage.setItem(plantCardNoteChangesStorageKey, JSON.stringify(changes)); } catch (e) {}
}

function noteValue(entry) {
  return clean(entry && typeof entry === "object" ? entry.note : entry);
}

function noteUpdatedAt(entry) {
  return clean(entry && typeof entry === "object" ? entry.updatedAt : "");
}

function getPlantCardNote(plantId, publishedNote = "", publishedUpdatedAt = "") {
  const id = clean(plantId);
  const notes = getPlantCardNotes();
  if (!Object.prototype.hasOwnProperty.call(notes, id)) return clean(publishedNote);
  const local = notes[id];
  const localUpdatedAt = noteUpdatedAt(local);
  if (publishedUpdatedAt && localUpdatedAt && publishedUpdatedAt >= localUpdatedAt) return clean(publishedNote);
  return noteValue(local);
}

function plantCardNoteField(plantId, publishedNote = "", publishedUpdatedAt = "", category = "Pelargon") {
  const id = clean(plantId);
  return `
    <label class="card-note">
      <span class="card-note-label">Anteckning</span>
      <textarea class="card-note-input" data-card-note-id="${escapeAttr(id)}" data-card-note-category="${escapeAttr(category)}" maxlength="180" rows="2" placeholder="Skriv en enkel anteckning…">${htmlEscape(getPlantCardNote(id, publishedNote, publishedUpdatedAt))}</textarea>
    </label>
  `;
}

function buildPlantCardNoteExport(rows = Object.values(getPlantCardNoteChanges())) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: "Mina Växter lokala kortanteckningar",
    items: (rows || []).map(row => ({
      id: clean(row.id),
      category: clean(row.category) || "Pelargon",
      note: noteValue(row),
      updatedAt: noteUpdatedAt(row)
    })).filter(row => row.id && row.updatedAt)
  };
}

function deletePlantCardNoteChange(plantId) {
  const changes = getPlantCardNoteChanges();
  delete changes[clean(plantId)];
  savePlantCardNoteChanges(changes);
}

function clearPlantCardNoteChanges() {
  savePlantCardNoteChanges({});
}

function ensurePlantCardNotes() {
  if (document.body.dataset.plantCardNotesReady === "true") return;
  document.body.dataset.plantCardNotesReady = "true";
  const savedNotes = getPlantCardNotes();
  const savedChanges = getPlantCardNoteChanges();
  let migrated = false;
  Object.entries(savedNotes).forEach(([id, value]) => {
    if (value && typeof value === "object") return;
    const entry = {id: clean(id), category: "Pelargon", note: clean(value), updatedAt: new Date().toISOString()};
    savedNotes[id] = entry;
    savedChanges[id] = entry;
    migrated = true;
  });
  if (migrated) {
    try { localStorage.setItem(plantCardNotesStorageKey, JSON.stringify(savedNotes)); } catch (e) {}
    savePlantCardNoteChanges(savedChanges);
  }
  document.addEventListener("input", event => {
    const input = event.target.closest(".card-note-input[data-card-note-id]");
    if (!input) return;
    const id = clean(input.dataset.cardNoteId);
    if (!id) return;
    const notes = getPlantCardNotes();
    const entry = {id, category: clean(input.dataset.cardNoteCategory) || "Pelargon", note: input.value.trim(), updatedAt: new Date().toISOString()};
    notes[id] = entry;
    try { localStorage.setItem(plantCardNotesStorageKey, JSON.stringify(notes)); } catch (e) {}
    const changes = getPlantCardNoteChanges();
    changes[id] = entry;
    savePlantCardNoteChanges(changes);
    updatePlantImageImportUI();
  });
}

function logBookIcon() {
  return `
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M13.2 5.2h5.6l.8 3a9 9 0 0 1 2.2 1.3l3-.8 2.8 4.8-2.2 2.2a9 9 0 0 1 0 2.6l2.2 2.2-2.8 4.8-3-.8a9 9 0 0 1-2.2 1.3l-.8 3h-5.6l-.8-3a9 9 0 0 1-2.2-1.3l-3 .8-2.8-4.8 2.2-2.2a9 9 0 0 1 0-2.6l-2.2-2.2 2.8-4.8 3 .8a9 9 0 0 1 2.2-1.3z" fill="none" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="16" cy="17" r="3.4" fill="none" stroke-width="2.2"/>
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
    "omplantering": "🪴",
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
const plantMilestoneCleanupH02Sown20251116Key = "mina-vaxter-cleanup-h02-sown-2025-11-16-v1";

function cleanUpIncorrectH02SownMilestones(rows) {
  try {
    if (localStorage.getItem(plantMilestoneCleanupH02Sown20251116Key) === "true") return rows;
    const cleanedRows = rows.filter(row => !(
      /^PL-H02(?:-|$)/i.test(clean(row && row.id)) &&
      clean(row && row.date) === "2025-11-16" &&
      clean(row && row.type).toLocaleLowerCase("sv") === "sådd"
    ));
    if (cleanedRows.length !== rows.length) {
      localStorage.setItem(plantMilestoneStorageKey, JSON.stringify(cleanedRows));
    }
    localStorage.setItem(plantMilestoneCleanupH02Sown20251116Key, "true");
    return cleanedRows;
  } catch (e) {
    return rows;
  }
}

function getPlantMilestoneAdditions() {
  try {
    const stored = localStorage.getItem(plantMilestoneStorageKey) || localStorage.getItem(plantMilestoneLegacyStorageKey) || "[]";
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? cleanUpIncorrectH02SownMilestones(parsed) : [];
  } catch (e) {
    return [];
  }
}

function savePlantMilestoneAdditions(rows) {
  try { localStorage.setItem(plantMilestoneStorageKey, JSON.stringify(rows || [])); } catch (e) {}
  updatePlantImageImportUI();
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

function plantMilestoneKey(row) {
  return [
    clean(row && row.id),
    clean(row && row.date),
    clean(row && row.type),
    clean(row && row.note)
  ].join("|");
}

function buildSyncManifest(imageItems, milestoneItems, cardNoteItems, plantStatusItems) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: "Mina Växter synkpaket",
    targetFolder: "iCloud Drive/Downloads",
    contains: {
      images: imageItems.length,
      milestones: milestoneItems.length,
      cardNotes: cardNoteItems.length,
      plantStatuses: plantStatusItems.length
    },
    note: "Hundöron och fokusnotiser är lokal arbetslista och ingår inte i synkpaketet."
  };
}

function combinedPlantMilestones(baseMilestones, plantId) {
  const id = clean(plantId);
  const localRows = getPlantMilestoneAdditions().filter(row => clean(row.id) === id);
  const seen = new Set();
  return [...(baseMilestones || []), ...localRows]
    .filter(row => {
      const key = plantMilestoneKey(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => sortNatural(b.date, a.date) || sortNatural(b.createdAt || "", a.createdAt || "") || sortNatural(b.type, a.type));
}

function combinedMilestonesByPlant(rows) {
  const baseRows = rows || [];
  const baseKeys = new Set(baseRows.map(plantMilestoneKey));
  const localRows = getPlantMilestoneAdditions();
  const pendingRows = localRows.filter(row => !baseKeys.has(plantMilestoneKey(row)));
  if (pendingRows.length !== localRows.length) savePlantMilestoneAdditions(pendingRows);

  const seen = new Set();
  const combinedRows = [...baseRows, ...pendingRows].filter(row => {
    const key = plantMilestoneKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return milestonesByPlant(combinedRows);
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

function milestoneSummary(log) {
  if (!log) return "";
  return `
    <div class="milestone">
      <div class="milestone-label">Senaste milstolpe</div>
      <div class="milestone-value"><span>${htmlEscape(milestoneIcon(log.type))}</span><strong>${htmlEscape(log.type)}</strong><span>${htmlEscape(log.date)}</span></div>
    </div>
  `;
}

function isConcludedPlantMilestone(log) {
  const type = clean(log && log.type).toLocaleLowerCase("sv");
  return type.startsWith("avslutad") || type === "död" || type === "avliden";
}

function plantCardIsConcluded(card) {
  let milestones = [];
  try { milestones = JSON.parse(card.dataset.milestones || "[]"); } catch (e) { milestones = []; }
  return isConcludedPlantMilestone(latestPlantMilestone(milestones));
}

function ensureConcludedPlantFilter() {
  if (document.body.dataset.concludedPlantFilterReady === "true") return;
  const grid = document.querySelector("#grid, .grid");
  if (!grid) return;
  document.body.dataset.concludedPlantFilterReady = "true";
  const concludedValue = "__concluded_only__";
  let select = document.querySelector("#typeFilter, #statusFilter");
  if (select) {
    if (!select.querySelector(`option[value="${concludedValue}"]`)) {
      const option = document.createElement("option");
      option.value = concludedValue;
      option.textContent = "Avslutade";
      select.appendChild(option);
    }
  } else {
    select = document.createElement("select");
    select.className = "concluded-filter-select";
    select.setAttribute("aria-label", "Filtrera aktiva eller avslutade växter");
    select.innerHTML = `<option value="">Aktiva växter</option><option value="${concludedValue}">Avslutade</option>`;
    const stats = document.querySelector("#stats, .stats");
    if (stats) stats.before(select);
  }

  const applyFilter = () => {
    const cards = [...grid.querySelectorAll(".plant-card[data-milestones]")];
    const concludedOnly = select.value === concludedValue;
    let concludedCount = 0;
    cards.forEach(card => {
      const concluded = plantCardIsConcluded(card);
      if (concluded) concludedCount += 1;
      card.dataset.concludedHidden = concludedOnly ? (!concluded ? "true" : "false") : (concluded ? "true" : "false");
    });
    const option = select.querySelector(`option[value="${concludedValue}"]`);
    if (option) option.textContent = `Avslutade (${concludedCount})`;
    document.dispatchEvent(new CustomEvent("plant-concluded-filter-applied", {
      detail: {
        concludedOnly,
        concludedCount,
        activeCount: cards.length - concludedCount
      }
    }));
  };

  select.addEventListener("change", applyFilter);
  new MutationObserver(applyFilter).observe(grid, {childList: true});
  applyFilter();
}

function sortNatural(a, b) {
  return String(a).localeCompare(String(b), "sv", {numeric: true, sensitivity: "base"});
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
      .gallery-shell { width: 100%; height: 100%; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
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
          width: calc(100% - 16px); height: 100%; min-width: 0; min-height: 0;
          max-width: none; max-height: none; object-fit: contain; display: block;
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
          .gallery-image { width: calc(100% - 16px); height: 100%; }
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
            <button class="gallery-tool gallery-reset" type="button" aria-label="Anpassa hela bilden till fönstret">Passa</button>
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
    resetButton.textContent = state.zoom <= 1.01 ? "Passa" : `${Math.round(state.zoom * 100)}%`;
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
    .plant-card {
      --plant-image-height: 356px;
      --plant-heading-height: 82px;
      --plant-chip-height: 36px;
      --plant-gallery-height: 50px;
      min-height: 0;
      height: auto;
      align-self: start;
    }
    .grid { align-items: start; }
    .plant-card > .image-wrap {
      height: var(--plant-image-height) !important; min-height: var(--plant-image-height);
      aspect-ratio: auto !important; flex: 0 0 var(--plant-image-height);
    }
    .plant-card .card-body {
      position: relative; display: grid !important;
      grid-template-rows: var(--plant-heading-height) var(--plant-chip-height) 58px 64px 108px;
      align-content: start;
      gap: 12px; flex: 1;
    }
    .plant-card .plant-card-head {
      height: var(--plant-heading-height); min-height: var(--plant-heading-height);
      display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start;
      gap: 10px; margin: 0; overflow: hidden;
    }
    .plant-card .plant-title-block { min-width: 0; }
    .plant-card .plant-title-block .plant-nickname,
    .plant-card .plant-title-block .latin { margin-top: 4px; }
    .plant-card .plant-title-block h2 {
      display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3;
      overflow: hidden;
    }
    .plant-card .plant-card-head .import-actions,
    .plant-card .plant-card-head .favorite-log-action {
      position: static; display: flex; align-items: center; justify-content: flex-end;
      flex-direction: column; gap: 6px; margin: 0;
    }
    .plant-card .plant-card-chip-slot {
      height: var(--plant-chip-height); min-height: var(--plant-chip-height);
      overflow: hidden; display: flex; align-items: flex-start;
    }
    .plant-card .plant-card-chip-slot .chips { display: flex; flex-wrap: wrap; gap: 7px; align-content: flex-start; }
    .plant-card .plant-card-chip-slot .chip {
      background: var(--chip, #efe6da); color: var(--muted, #6f655b); border-radius: 999px;
      padding: 5px 9px; font-size: .8rem; font-weight: 700;
    }
    .plant-card .plant-card-chip-slot .chip.green { background: rgba(96,119,97,.17); color: #435943; }
    .plant-card .plant-card-gallery-slot {
      position: absolute; top: 0; left: 0; right: 0; z-index: 4;
      height: var(--plant-gallery-height); overflow: hidden;
      padding: 5px 58px 5px 12px; display: flex; align-items: center;
      border: 0; border-bottom: 1px solid rgba(255,255,255,.18); border-radius: 0;
      background: rgba(255,253,248,.46);
      box-shadow: none;
    }
    .plant-card .plant-card-gallery-slot:not(.has-gallery) { display: none; }
    .plant-card .plant-card-gallery-slot .thumbs {
      width: 100%; height: 40px; margin: 0; padding: 0;
      display: flex; flex-wrap: nowrap; gap: 8px; overflow-x: auto; overflow-y: hidden;
    }
    .plant-card .plant-card-gallery-slot .thumb,
    .plant-card .plant-card-gallery-slot .photo-button {
      width: 40px; height: 40px; flex: 0 0 40px; padding: 0;
      border: 2px solid transparent; border-radius: 9px; overflow: hidden; cursor: pointer;
      background: rgba(255,253,248,.82);
    }
    .plant-card .plant-card-gallery-slot .thumb.active,
    .plant-card .plant-card-gallery-slot .photo-button.active {
      border-color: var(--accent, #7d4f3b);
    }
    .plant-card .plant-card-gallery-slot .thumb img,
    .plant-card .plant-card-gallery-slot .photo-button img {
      width: 100%; height: 100%; object-fit: cover; display: block;
    }
    .plant-card .plant-card-gallery-slot .photo-strip { height: 40px; padding: 0; }
    .plant-card .date-ribbon { display: none !important; }
    .plant-card .plant-card-info { min-width: 0; height: 58px; overflow: hidden; }
    .plant-card .plant-card-info:has(.edit-form) { height: auto; overflow: visible; }
    .plant-card .plant-card-milestone-slot { height: 64px; min-height: 64px; overflow: hidden; }
    .plant-card .plant-card-notes-slot { height: 108px; min-height: 108px; overflow: hidden; }
    .plant-card .plant-card-notes-slot .notes { margin-top: 0; }
    .plant-card .plant-card-notes-slot.favorite-focus { height: 108px; min-height: 108px; margin-top: 0; }
    .plant-card .plant-card-notes-slot:has(.card-note) { height: 108px; overflow: visible; }
    .plant-card:has(.plant-card-info .edit-form) .card-body {
      grid-template-rows: var(--plant-heading-height) var(--plant-chip-height) auto 64px 108px;
    }
    .card-note { display: grid; gap: 6px; }
    .card-note-label {
      color: var(--accent, #7d4f3b); font-size: .72rem; font-weight: 900;
      letter-spacing: .12em; text-transform: uppercase;
    }
    .card-note-input {
      width: 100%; height: 72px; min-height: 72px; border: 1px solid var(--line, #ded2c2); border-radius: 14px;
      padding: 10px 11px; resize: none; overflow-y: auto; background: rgba(255,255,255,.46);
      color: var(--ink, #2b251f); font: inherit; font-size: .92rem; line-height: 1.35;
    }
    .card-note-input::placeholder { color: rgba(111,101,91,.68); }
    .plant-card[data-concluded-hidden="true"] { display: none !important; }
    .concluded-filter-select {
      width: auto; max-width: 100%; margin: 0 0 10px; border: 1px solid var(--line, #ded2c2);
      border-radius: 999px; padding: 9px 34px 9px 12px; background: var(--paper, #fffdf8);
      color: var(--ink, #2b251f); font: inherit; font-weight: 800;
    }
    @media (max-width: 700px) {
      .plant-card {
        --plant-image-height: min(280px, 65vw);
        --plant-heading-height: 48px;
      }
      .plant-card .card-body {
        grid-template-rows: none;
        grid-auto-rows: auto;
        gap: 10px;
      }
      .plant-card .plant-card-head {
        height: auto;
        min-height: var(--plant-heading-height);
        overflow: visible;
      }
      .plant-card .plant-card-head .import-actions,
      .plant-card .plant-card-head .favorite-log-action {
        flex-direction: row;
      }
      .plant-card .plant-card-chip-slot {
        height: auto;
        min-height: 0;
      }
      .plant-card .plant-card-chip-slot:has(.chips:empty),
      .plant-card .plant-card-info:empty,
      .plant-card .plant-card-milestone-slot:empty,
      .plant-card .plant-card-notes-slot:empty {
        display: none;
      }
      .plant-card .plant-card-milestone-slot {
        height: auto;
        min-height: 64px;
      }
    }
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
      border-radius: 999px; width: 42px; min-width: 42px; height: 42px; flex: 0 0 42px; padding: 0;
      display: inline-flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 1.4rem; font-weight: 900; line-height: 1; cursor: pointer;
    }
    .plant-panel-section { display: grid; gap: 9px; }
    .plant-panel-section-title {
      color: var(--accent, #7d4f3b); text-transform: uppercase; letter-spacing: .14em;
      font-size: .72rem; font-weight: 900;
    }
    .plant-status-row {
      border: 1px solid var(--line, #ded2c2); border-radius: 16px; padding: 12px 13px;
      background: rgba(255,255,255,.48); display: flex; align-items: center; justify-content: space-between;
      gap: 16px; cursor: pointer;
    }
    .plant-status-copy { display: grid; gap: 3px; }
    .plant-status-copy strong { color: var(--ink, #2b251f); }
    .plant-status-copy small { color: var(--muted, #6f655b); font-weight: 700; line-height: 1.3; }
    .plant-status-switch { position: relative; flex: 0 0 auto; width: 48px; height: 28px; }
    .plant-status-switch input { position: absolute; opacity: 0; pointer-events: none; }
    .plant-status-switch span {
      position: absolute; inset: 0; border-radius: 999px; background: var(--line, #ded2c2); transition: .16s ease;
    }
    .plant-status-switch span::after {
      content: ""; position: absolute; width: 22px; height: 22px; left: 3px; top: 3px;
      border-radius: 50%; background: var(--paper, #fffdf8); box-shadow: 0 1px 4px rgba(0,0,0,.18); transition: .16s ease;
    }
    .plant-status-switch input:checked + span { background: #607761; }
    .plant-status-switch input:checked + span::after { transform: translateX(20px); }
    .plant-status-switch input:focus-visible + span { outline: 3px solid rgba(125,79,59,.26); outline-offset: 2px; }
    .plant-log-history-title {
      list-style: none; cursor: pointer; display: flex; align-items: center; gap: 9px;
      border: 1px solid var(--line, #ded2c2); border-radius: 14px; padding: 10px 12px;
      background: rgba(255,255,255,.48);
      color: var(--accent, #7d4f3b); text-transform: uppercase; letter-spacing: .14em;
      font-size: .72rem; font-weight: 900;
    }
    .plant-log-history-title::-webkit-details-marker { display: none; }
    .plant-log-history-title::after {
      content: "⌄"; margin-left: auto; color: var(--muted, #6f655b); font-size: 1.15rem;
      line-height: 1; transition: transform .16s ease;
    }
    .plant-log-history[open] .plant-log-history-title::after { transform: rotate(180deg); }
    .plant-log-history-count {
      min-width: 24px; padding: 3px 7px; border-radius: 999px; text-align: center;
      background: var(--chip, #efe6da); color: var(--muted, #6f655b); letter-spacing: 0;
    }
    .plant-log-list { display: grid; gap: 10px; }
    .plant-log-history .plant-log-list { margin-top: 10px; }
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
    @media (max-width: 700px) {
      nav a[href="verktyg.html"],
      #printBtn,
      #bulkMilestoneBtn,
      #batchArchiveBtn {
        display: none !important;
      }
    }
    @media (max-width: 560px) {
      .plant-log-fields { grid-template-columns: 1fr; }
      .plant-log-panel { padding: 16px; }
    }
  `;
  document.head.appendChild(style);
  ensureConcludedPlantFilter();
  ensurePlantCardNotes();

  const dialog = document.createElement("dialog");
  dialog.id = "plantLogDialog";
  dialog.className = "plant-log-dialog";
  document.body.appendChild(dialog);

  document.addEventListener("click", event => {
    const button = event.target.closest(".plant-log-btn");
    if (!button) return;
    const card = button.closest(".plant-card");
    if (!card) return;
    openPlantPanel(card);
  });
}

function openPlantPanel(card) {
  const dialog = document.querySelector("#plantLogDialog");
  if (!dialog) return;
  let milestones = [];
  try { milestones = JSON.parse(card.dataset.milestones || card.dataset.log || "[]"); } catch (e) { milestones = []; }
  const title = card.dataset.plantName || card.dataset.plantId || "Växt";
  const id = card.dataset.plantId || "";
  const category = card.dataset.category || "Pelargon";
  const cuttingsAvailable = getPlantCuttingsStatus(id, card.dataset.cuttingsAvailable, card.dataset.cuttingsUpdatedAt);
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
      <section class="plant-panel-section" aria-labelledby="plantStatusTitle">
        <div class="plant-panel-section-title" id="plantStatusTitle">Status</div>
        <label class="plant-status-row">
          <span class="plant-status-copy"><strong>Sticklingar</strong><small>Visar att sticklingar finns tillgängliga från moderplantan.</small></span>
          <span class="plant-status-switch"><input name="cuttings" type="checkbox" ${cuttingsAvailable ? "checked" : ""}><span aria-hidden="true"></span></span>
        </label>
      </section>
      <section class="plant-panel-section" aria-labelledby="plantHistoryTitle">
        <div class="plant-panel-section-title" id="plantHistoryTitle">Historik</div>
        <details class="plant-log-history">
          <summary class="plant-log-history-title">Tidigare milstolpar <span class="plant-log-history-count">${milestones.length}</span></summary>
          <div class="plant-log-list">${rows || '<div class="plant-log-empty">Inga milstolpar ännu.</div>'}</div>
        </details>
        <form class="plant-log-form" method="dialog">
          <div class="plant-log-form-title">Ny milstolpe</div>
          <div class="plant-log-fields">
            <input name="date" type="date" value="${htmlEscape(localDateString())}" aria-label="Datum" required>
            <select name="type" aria-label="Typ av milstolpe" required>${options}</select>
          </div>
          <textarea name="note" maxlength="160" placeholder="Kort anteckning, frivilligt"></textarea>
          <button class="plant-log-submit" type="submit">Spara milstolpe</button>
        </form>
      </section>
    </div>
  `;
  dialog.querySelector(".plant-log-close").addEventListener("click", () => dialog.close(), {once: true});
  dialog.querySelector('[name="cuttings"]').addEventListener("change", event => {
    setPlantCuttingsStatus(id, category, event.currentTarget.checked);
  });
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

function normalizedPhotoDate(value) {
  const match = String(value || "").match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function readExifCaptureDate(imageData) {
  const view = new DataView(imageData);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return "";

  const readTiffDate = tiffStart => {
    if (tiffStart + 8 > view.byteLength) return "";
    const byteOrder = view.getUint16(tiffStart);
    if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return "";
    const littleEndian = byteOrder === 0x4949;
    const uint16 = offset => offset + 2 <= view.byteLength ? view.getUint16(offset, littleEndian) : null;
    const uint32 = offset => offset + 4 <= view.byteLength ? view.getUint32(offset, littleEndian) : null;
    if (uint16(tiffStart + 2) !== 42) return "";

    const readAscii = entryOffset => {
      const type = uint16(entryOffset + 2);
      const count = uint32(entryOffset + 4);
      if (type !== 2 || !count || count > 128) return "";
      const valueOffset = count <= 4 ? entryOffset + 8 : tiffStart + uint32(entryOffset + 8);
      if (!Number.isFinite(valueOffset) || valueOffset < 0 || valueOffset + count > view.byteLength) return "";
      let value = "";
      for (let index = 0; index < count; index += 1) {
        const character = view.getUint8(valueOffset + index);
        if (!character) break;
        value += String.fromCharCode(character);
      }
      return normalizedPhotoDate(value);
    };

    const readIfd = relativeOffset => {
      const ifdStart = tiffStart + relativeOffset;
      const entryCount = uint16(ifdStart);
      if (entryCount === null || entryCount > 512 || ifdStart + 2 + entryCount * 12 > view.byteLength) return {dates: {}, exifOffset: null};
      const dates = {};
      let exifOffset = null;
      for (let index = 0; index < entryCount; index += 1) {
        const entryOffset = ifdStart + 2 + index * 12;
        const tag = uint16(entryOffset);
        if (tag === 0x0132 || tag === 0x9003 || tag === 0x9004) dates[tag] = readAscii(entryOffset);
        if (tag === 0x8769) exifOffset = uint32(entryOffset + 8);
      }
      return {dates, exifOffset};
    };

    const firstIfdOffset = uint32(tiffStart + 4);
    if (!firstIfdOffset) return "";
    const firstIfd = readIfd(firstIfdOffset);
    const exifIfd = firstIfd.exifOffset ? readIfd(firstIfd.exifOffset) : {dates: {}};
    return exifIfd.dates[0x9003] || exifIfd.dates[0x9004] || firstIfd.dates[0x0132] || "";
  };

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = view.getUint8(offset + 1);
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x00 || marker === 0xff || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const segmentLength = view.getUint16(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > view.byteLength) break;
    const segmentStart = offset + 4;
    if (marker === 0xe1 && segmentLength >= 8 &&
        view.getUint32(segmentStart) === 0x45786966 && view.getUint16(segmentStart + 4) === 0) {
      const date = readTiffDate(segmentStart + 6);
      if (date) return date;
    }
    offset += 2 + segmentLength;
  }
  return "";
}

function suggestedPhotoDate(file, imageData) {
  const metadataDate = readExifCaptureDate(imageData);
  if (metadataDate) return {date: metadataDate, source: "Datum hämtat från bildens fotograferingsinfo."};
  if (file.lastModified > 0) {
    return {date: localDateString(new Date(file.lastModified)), source: "Fotograferingsdatum saknas – filens datum används."};
  }
  return {date: localDateString(), source: "Fotograferingsdatum saknas – dagens datum används."};
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
      border: 0; border-radius: 999px; width: 52px; height: 52px; padding: 0; background: rgba(125,79,59,.86); color: white;
      display: grid; place-items: center; box-shadow: 0 12px 34px rgba(43,37,31,.20); cursor: pointer;
    }
    .import-queue-button > svg {
      width: 27px; height: 27px; display: block; fill: none; stroke: currentColor;
      stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;
    }
    .import-queue-button.has-items {
      background: rgba(125,79,59,.94);
    }
    .import-queue-button .floating-count {
      position: absolute; top: -5px; right: -5px; min-width: 20px; height: 20px; display: grid; place-items: center;
      border-radius: 999px; padding: 0 5px; background: var(--paper, #fffdf8); color: var(--accent, #7d4f3b);
      border: 1px solid rgba(125,79,59,.28); font-size: .68rem; font-weight: 950; box-shadow: 0 4px 12px rgba(43,37,31,.16);
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
      border-radius: 999px; width: 40px; min-width: 40px; height: 40px; flex: 0 0 40px; padding: 0;
      display: inline-flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 1.35rem; font-weight: 900; line-height: 1; cursor: pointer;
    }
    .import-form { display: grid; gap: 12px; }
    .import-preview { width: 100%; max-height: 320px; object-fit: contain; border-radius: 16px; background: #eadfce; }
    .import-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .import-fields label { display: grid; align-content: start; gap: 5px; color: var(--muted, #6f655b); font-size: .86rem; font-weight: 800; }
    .import-fields input, .import-fields select, .import-fields textarea {
      width: 100%; border: 1px solid var(--line, #ded2c2); border-radius: 14px; padding: 10px 11px;
      background: white; color: var(--ink, #2b251f); font: inherit;
    }
    .import-date-help { min-height: 1.15em; color: var(--muted, #6f655b); font-size: .72rem; font-weight: 650; line-height: 1.25; }
    .import-type-help { color: var(--accent, #7d4f3b); font-size: .72rem; font-weight: 750; line-height: 1.25; }
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
    .import-item-icon {
      width: 76px; height: 76px; border-radius: 12px; display: grid; place-items: center;
      background: rgba(96,119,97,.12); color: var(--accent, #7d4f3b); font-size: 2rem; font-weight: 900;
    }
    .import-item strong { display: block; }
    .import-item small { color: var(--muted, #6f655b); display: block; margin-top: 2px; }
    .import-delete { border: 0; background: transparent; color: var(--accent, #7d4f3b); font: inherit; font-weight: 850; cursor: pointer; padding: 8px; }
    .import-empty { color: var(--muted, #6f655b); border: 1px dashed var(--line, #ded2c2); border-radius: 16px; padding: 18px; text-align: center; font-weight: 700; }
    .import-sync-status { color: var(--muted, #6f655b); font-weight: 750; padding: 10px 2px; }
    @media (max-width: 680px) {
      .import-queue-button,
      .mobile-view-toggle {
        right: 12px; width: 46px; height: 46px;
        box-shadow: 0 9px 26px rgba(43,37,31,.18);
      }
      .import-queue-button { bottom: max(12px, env(safe-area-inset-bottom)); }
      .mobile-view-toggle { bottom: max(66px, calc(env(safe-area-inset-bottom) + 66px)); }
      .import-fields { grid-template-columns: 1fr; }
      .import-item { grid-template-columns: 64px 1fr; }
      .import-item img, .import-item-icon { width: 64px; height: 64px; }
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
  queueButton.innerHTML = floatingSyncIcon();
  queueButton.setAttribute("aria-label", "Synk");
  queueButton.title = "Synk";
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
  const imageData = await file.arrayBuffer();
  const suggestedDate = suggestedPhotoDate(file, imageData);
  const milestoneTypeByImageType = {omplanterad: "Omplanterad"};
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
        <label>Datum
          <input name="date" type="date" value="${suggestedDate.date}">
          <small class="import-date-help">${suggestedDate.source}</small>
        </label>
        <label>Bildtyp
          <select name="type">
            <option value="hel">hel</option>
            <option value="omplanterad">omplanterad</option>
            <option value="stam">stam</option>
            <option value="blomma">blomma</option>
            <option value="blad">blad</option>
            <option value="detalj">detalj</option>
            <option value="knopp">knopp</option>
            <option value="stickling">stickling</option>
            <option value="grodd">grodd</option>
            <option value="beskuren">beskuren</option>
            <option value="etikett">etikett</option>
          </select>
          <small class="import-type-help" hidden>Skapar samtidigt milstolpen Omplanterad.</small>
        </label>
        <textarea name="note" placeholder="Kort anteckning, frivilligt"></textarea>
      </div>
      <div class="import-buttons">
        <button class="secondary" value="cancel" type="submit">Avbryt</button>
        <button class="primary" value="save" type="submit" data-import-save>Spara i bildkö</button>
      </div>
    </form>
  `;
  dialog.showModal();
  dialog.addEventListener("close", () => URL.revokeObjectURL(previewUrl), {once: true});
  const imageTypeSelect = dialog.querySelector('[name="type"]');
  const typeHelp = dialog.querySelector(".import-type-help");
  const saveButton = dialog.querySelector("[data-import-save]");
  imageTypeSelect.addEventListener("change", () => {
    const createsMilestone = Boolean(milestoneTypeByImageType[imageTypeSelect.value]);
    typeHelp.hidden = !createsMilestone;
    saveButton.textContent = createsMilestone ? "Spara bild och milstolpe" : "Spara i bildkö";
  });
  dialog.querySelector("#plantImageImportForm").addEventListener("submit", async event => {
    if (event.submitter && event.submitter.value !== "save") return;
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const createdAt = new Date().toISOString();
    const importId = `${createdAt}-${Math.random().toString(16).slice(2)}`;
    const date = data.get("date") || suggestedDate.date;
    const note = String(data.get("note") || "").trim();
    const imageType = clean(data.get("type")) || "hel";
    await addImageImportItem({
      id: importId,
      createdAt,
      category: plantImageImportPending.category,
      plantId: plantImageImportPending.plantId,
      plantName: plantImageImportPending.plantName,
      date,
      type: imageType,
      note,
      originalFileName: file.name || "iphone-bild.jpg",
      mime: file.type || "image/jpeg",
      size: file.size || 0,
      data: imageData
    });
    const milestoneType = milestoneTypeByImageType[imageType] || "";
    if (milestoneType) {
      const milestone = addPlantMilestoneEntry({
        id: plantImageImportPending.plantId,
        date,
        type: milestoneType,
        note
      });
      if (milestone) window.dispatchEvent(new CustomEvent("plant-milestone-added", {detail: milestone}));
    }
    dialog.close();
    plantImageImportPending = null;
    updatePlantImageImportUI();
  }, {once: true});
}

let localArrivalTokenPromise = null;

function loadLocalArrivalToken() {
  if (window.MINA_VAXTER_ARCHIVE_TOKEN || window.location.protocol !== "file:") {
    return Promise.resolve(window.MINA_VAXTER_ARCHIVE_TOKEN || "");
  }
  if (localArrivalTokenPromise) return localArrivalTokenPromise;
  localArrivalTokenPromise = new Promise(resolve => {
    const existing = document.querySelector('script[data-local-arrival-token]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.MINA_VAXTER_ARCHIVE_TOKEN || ""), {once: true});
      existing.addEventListener("error", () => resolve(""), {once: true});
      return;
    }
    const script = document.createElement("script");
    script.src = "originalarkiv-local.js";
    script.dataset.localArrivalToken = "";
    script.addEventListener("load", () => resolve(window.MINA_VAXTER_ARCHIVE_TOKEN || ""), {once: true});
    script.addEventListener("error", () => resolve(""), {once: true});
    document.head.appendChild(script);
  });
  return localArrivalTokenPromise;
}

async function getPendingArrivalItems() {
  const token = await loadLocalArrivalToken();
  if (!token) return [];
  try {
    const response = await fetch("http://127.0.0.1:47831/arrivals", {
      headers: {"X-Mina-Vaxter-Token": token},
      cache: "no-store"
    });
    if (!response.ok) return [];
    const payload = await response.json();
    return Array.isArray(payload.arrivals) ? payload.arrivals : [];
  } catch (error) {
    return [];
  }
}

async function updatePlantImageImportUI() {
  let items = [];
  try { items = await getImageImportItems(); } catch (error) { items = []; }
  const arrivalItems = await getPendingArrivalItems();
  const syncCount = items.length + getPlantMilestoneAdditions().length + buildPlantCardNoteExport().items.length + buildPlantStatusExport().items.length + arrivalItems.length;
  const button = document.querySelector(".import-queue-button");
  if (button) {
    button.classList.toggle("has-items", syncCount > 0);
    button.innerHTML = `${floatingSyncIcon()}${syncCount ? `<span class="floating-count">${syncCount}</span>` : ""}`;
    button.setAttribute("aria-label", syncCount ? `Synka ${syncCount} ändringar` : "Synka");
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
  const milestoneItems = buildPlantMilestoneExport().items || [];
  const cardNoteItems = buildPlantCardNoteExport().items || [];
  const plantStatusItems = buildPlantStatusExport().items || [];
  const arrivalItems = await getPendingArrivalItems();
  const packageCount = items.length + milestoneItems.length + cardNoteItems.length + plantStatusItems.length;
  const syncCount = packageCount + arrivalItems.length;
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
  const milestoneRows = milestoneItems.map((item, index) => {
    const meta = [item.date, item.type].filter(Boolean).join(" · ");
    return `
      <article class="import-item">
        <div class="import-item-icon" aria-hidden="true">＋</div>
        <div>
          <strong>${htmlEscape(item.id)}</strong>
          <small>${htmlEscape(meta)}</small>
          ${clean(item.note) ? `<small>${htmlEscape(item.note)}</small>` : ""}
        </div>
        <button class="import-delete" type="button" data-delete-milestone="${index}">Ta bort</button>
      </article>
    `;
  }).join("");
  const cardNoteRows = cardNoteItems.map(item => `
    <article class="import-item">
      <div class="import-item-icon" aria-hidden="true">✎</div>
      <div>
        <strong>${htmlEscape(item.id)}</strong>
        <small>${htmlEscape(item.category)} · kortanteckning</small>
        <small>${htmlEscape(item.note || "Tom anteckning")}</small>
      </div>
      <button class="import-delete" type="button" data-delete-card-note="${escapeAttr(item.id)}">Ta bort</button>
    </article>
  `).join("");
  const plantStatusRows = plantStatusItems.map(item => `
    <article class="import-item">
      <div class="import-item-icon" aria-hidden="true">🌱</div>
      <div>
        <strong>${htmlEscape(item.id)}</strong>
        <small>${htmlEscape(item.category)} · Sticklingar</small>
        <small>${item.cuttingsAvailable ? "På" : "Av"}</small>
      </div>
      <button class="import-delete" type="button" data-delete-plant-status="${escapeAttr(item.id)}">Ta bort</button>
    </article>
  `).join("");
  const arrivalRows = arrivalItems.map(item => {
    const meta = [item.category, item.arrivalType, item.arrivalDate].filter(Boolean).join(" · ");
    return `
      <article class="import-item">
        <div class="import-item-icon" aria-hidden="true">🌱</div>
        <div>
          <strong>${htmlEscape(item.name || "Ny växt")}</strong>
          <small>${htmlEscape(meta)}</small>
          <small>Ankomstsamtal · sparad för Mac-synk</small>
        </div>
      </article>
    `;
  }).join("");
  dialog.innerHTML = `
    <div class="import-panel">
      <header>
        <div>
          <h2>Synka till Mac</h2>
          <p>${syncCount ? `${items.length} bilder · ${milestoneItems.length} milstolpar · ${cardNoteItems.length} anteckningar · ${plantStatusItems.length} statusar · ${arrivalItems.length} ankomstsamtal` : "Kön är tom just nu."}</p>
        </div>
        <button class="import-close" type="button" aria-label="Stäng">×</button>
      </header>
      <div class="import-list">${rows + milestoneRows + cardNoteRows + plantStatusRows + arrivalRows || '<div class="import-empty">Inga ändringar i kön.</div>'}</div>
      <div class="import-buttons">
        ${packageCount ? '<button class="primary" type="button" data-export-package>Synka</button>' : (arrivalItems.length ? '<div class="import-sync-status">Sparad – behandlas när Mac-synkningen körs.</div>' : '')}
        <button class="secondary" type="button" data-clear-import ${packageCount ? "" : "disabled"}>Rensa synkkö</button>
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
  dialog.querySelectorAll("[data-delete-milestone]").forEach(button => {
    button.addEventListener("click", () => {
      deletePlantMilestoneAddition(button.dataset.deleteMilestone);
      window.dispatchEvent(new CustomEvent("plant-milestone-added", {detail: {deleted: true}}));
      updatePlantImageImportUI();
      openImageImportQueue();
    });
  });
  dialog.querySelectorAll("[data-delete-card-note]").forEach(button => {
    button.addEventListener("click", () => {
      deletePlantCardNoteChange(button.dataset.deleteCardNote);
      updatePlantImageImportUI();
      openImageImportQueue();
    });
  });
  dialog.querySelectorAll("[data-delete-plant-status]").forEach(button => {
    button.addEventListener("click", () => {
      deletePlantStatusChange(button.dataset.deletePlantStatus);
      updatePlantImageImportUI();
      openImageImportQueue();
    });
  });
  const clearButton = dialog.querySelector("[data-clear-import]");
  clearButton.addEventListener("click", async () => {
    if (!confirm("Ta bort alla bilder, milstolpar, anteckningar och statusändringar i synkkön? Gör detta först när paketet är sparat eller importerat på Mac.")) return;
    await clearImageImportItems();
    clearPlantMilestoneAdditions();
    clearPlantCardNoteChanges();
    clearPlantStatusChanges();
    window.dispatchEvent(new CustomEvent("plant-milestone-added", {detail: {cleared: true}}));
    updatePlantImageImportUI();
    openImageImportQueue();
  });
  const packageButton = dialog.querySelector("[data-export-package]");
  if (packageButton) packageButton.addEventListener("click", async () => {
    packageButton.disabled = true;
    packageButton.textContent = "Skapar paket...";
    try {
      const zip = await createSyncPackage(items, getPlantMilestoneAdditions(), cardNoteItems, plantStatusItems);
      downloadBlob(`mina-vaxter-synkpaket-${localDateString()}.zip`, zip);
      packageButton.textContent = "Synka";
      if (confirm("Synkpaketet är skapat. Rensa synkkön i den här webbläsaren?")) {
        await clearImageImportItems();
        clearPlantMilestoneAdditions();
        clearPlantCardNoteChanges();
        clearPlantStatusChanges();
        window.dispatchEvent(new CustomEvent("plant-milestone-added", {detail: {cleared: true}}));
        updatePlantImageImportUI();
        dialog.close();
      }
    } catch (error) {
      packageButton.textContent = "Kunde inte exportera";
      alert("Kunde inte skapa synkpaketet. Prova igen.");
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

async function createSyncPackage(imageItems = [], milestoneRows = [], cardNoteRows = [], plantStatusRows = []) {
  const imageManifest = buildImageImportManifest(imageItems);
  const milestoneExport = buildPlantMilestoneExport(milestoneRows);
  const cardNoteExport = buildPlantCardNoteExport(cardNoteRows);
  const plantStatusExport = buildPlantStatusExport(plantStatusRows);
  const syncManifest = buildSyncManifest(imageManifest.items, milestoneExport.items, cardNoteExport.items, plantStatusExport.items);
  syncManifest.images = imageManifest.items;
  syncManifest.milestonesFile = "milstolpar.json";
  syncManifest.cardNotesFile = "kortanteckningar.json";
  syncManifest.plantStatusesFile = "vaxtstatusar.json";

  const entries = [
    {
      name: "manifest.json",
      blob: new Blob([JSON.stringify(syncManifest, null, 2)], {type: "application/json;charset=utf-8"})
    },
    {
      name: "milstolpar.json",
      blob: new Blob([JSON.stringify(milestoneExport, null, 2)], {type: "application/json;charset=utf-8"})
    },
    {
      name: "kortanteckningar.json",
      blob: new Blob([JSON.stringify(cardNoteExport, null, 2)], {type: "application/json;charset=utf-8"})
    },
    {
      name: "vaxtstatusar.json",
      blob: new Blob([JSON.stringify(plantStatusExport, null, 2)], {type: "application/json;charset=utf-8"})
    }
  ];
  imageManifest.items.forEach((manifestItem, index) => {
    entries.push({
      name: manifestItem.packagePath,
      blob: imageImportBlob(imageItems[index])
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
  const plantIdentity = clean(card.dataset.plantIdentity || "");
  const plantNickname = clean(card.dataset.plantNickname || card.querySelector(".plant-nickname")?.textContent || "");
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
    plantIdentity,
    plantNickname,
    latin,
    image,
    dateLabel,
    chips,
    cuttingsAvailable: getPlantCuttingsStatus(card.dataset.plantId, card.dataset.cuttingsAvailable, card.dataset.cuttingsUpdatedAt),
    cuttingsUpdatedAt: clean(card.dataset.cuttingsUpdatedAt),
    notes,
    page: card.dataset.page || location.pathname.split("/").pop() || "index.html",
    updatedAt: new Date().toISOString()
  };
}

function favoriteFocusDialog(item, existingNote = "") {
  return new Promise(resolve => {
    const dialog = document.createElement("dialog");
    dialog.className = "favorite-focus-dialog";
    dialog.innerHTML = `
      <form method="dialog" class="favorite-focus-panel">
        <header>
          <div>
            <h2>Hundöra</h2>
            <p>${htmlEscape(item.plantName)} · ${htmlEscape(item.plantId)}</p>
          </div>
          <button class="favorite-focus-close" value="cancel" type="submit" aria-label="Stäng">×</button>
        </header>
        <label>
          Kort notis
          <textarea name="focusNote" maxlength="120" rows="3" placeholder="T.ex. toppa, kolla ohyra, ta ny bild">${htmlEscape(existingNote || "")}</textarea>
        </label>
        <div class="favorite-focus-buttons">
          <button class="secondary" value="skip" type="submit">Utan notis</button>
          <button class="primary" value="save" type="submit">Spara</button>
        </div>
      </form>
    `;
    document.body.appendChild(dialog);
    const textarea = dialog.querySelector("textarea");
    dialog.addEventListener("close", () => {
      const value = dialog.returnValue;
      const note = textarea ? textarea.value.trim() : "";
      dialog.remove();
      if (value === "cancel") resolve(null);
      else resolve(value === "skip" ? "" : note);
    }, {once: true});
    dialog.showModal();
    setTimeout(() => textarea && textarea.focus(), 40);
  });
}

function confirmRemoveFavorite(item) {
  const name = item && item.plantName ? item.plantName : "växten";
  return confirm(`Ta bort hundöra?\n\n${name} tas bort från Hundöron och notisen försvinner.`);
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
        position: absolute; top: 0; right: 0; z-index: 12; width: 50px; height: 50px; border: 0; padding: 0;
        background: transparent; cursor: pointer; color: rgba(125,79,59,.34);
        pointer-events: auto; touch-action: manipulation;
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
      dialog.favorite-focus-dialog {
        width: min(92vw, 440px); border: 0; border-radius: 22px; padding: 0;
        background: var(--paper, #fffdf8); color: var(--ink, #2b251f);
        box-shadow: 0 24px 80px rgba(0,0,0,.24);
      }
      dialog.favorite-focus-dialog::backdrop { background: rgba(22,18,15,.48); }
      .favorite-focus-panel { padding: 18px; display: grid; gap: 14px; }
      .favorite-focus-panel header { padding: 0; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; text-align: left; }
      .favorite-focus-panel h2 { margin: 0; font-size: 1.55rem; line-height: 1.05; }
      .favorite-focus-panel p { margin: 4px 0 0; color: var(--muted, #6f655b); font-weight: 750; }
      .favorite-focus-close {
        border: 1px solid var(--line, #ded2c2); background: transparent; color: var(--ink, #2b251f);
        border-radius: 999px; width: 40px; min-width: 40px; height: 40px; flex: 0 0 40px; padding: 0;
        display: grid; place-items: center; font-size: 1.35rem; line-height: 1; cursor: pointer;
      }
      .favorite-focus-panel label { display: grid; gap: 7px; color: var(--accent, #7d4f3b); font-weight: 900; }
      .favorite-focus-panel textarea {
        width: 100%; border: 1px solid var(--line, #ded2c2); border-radius: 16px; padding: 12px 13px;
        background: white; color: var(--ink, #2b251f); font: inherit; resize: vertical;
      }
      .favorite-focus-panel textarea::placeholder { color: rgba(111,101,91,.68); }
      .favorite-focus-buttons { display: flex; justify-content: flex-end; gap: 9px; flex-wrap: wrap; }
      .favorite-focus-buttons button {
        border: 1px solid var(--line, #ded2c2); border-radius: 999px; padding: 10px 13px;
        font: inherit; font-weight: 900; cursor: pointer;
      }
      .favorite-focus-buttons .primary { background: var(--accent, #7d4f3b); color: white; border-color: var(--accent, #7d4f3b); }
      .favorite-focus-buttons .secondary { background: white; color: var(--accent, #7d4f3b); border-color: rgba(125,79,59,.35); }
    `;
    document.head.appendChild(style);
  }
  document.addEventListener("click", async event => {
    const button = event.target.closest(".favorite-corner");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const card = button.closest(".plant-card");
    if (!card) return;
    const favorites = getPlantFavorites();
    const item = favoriteFromCard(card);
    if (favorites[item.key]) {
      if (!confirmRemoveFavorite(favorites[item.key])) return;
      delete favorites[item.key];
    } else {
      const note = await favoriteFocusDialog(item);
      if (note === null) return;
      item.focusNote = note;
      favorites[item.key] = item;
    }
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
      button.setAttribute("aria-label", "Lägg till hundöra");
      button.title = "Hundöra";
      card.appendChild(button);
    }
    const key = favoriteKey(card.dataset.category, card.dataset.plantId);
    const button = card.querySelector(".favorite-corner");
    const active = !!favorites[key];
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.setAttribute("aria-label", active ? "Ta bort hundöra" : "Lägg till hundöra");
	    if (active) {
	      const existing = favorites[key] || {};
	      favorites[key] = {...existing, ...favoriteFromCard(card), focusNote: existing.focusNote || ""};
	    }
	  });
  savePlantFavorites(favorites);
}
