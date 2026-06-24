
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
