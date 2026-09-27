const albumSlug = document.body.dataset.album;
const albumLabel = document.body.dataset.label;
const archiveToken = window.MINA_VAXTER_ARCHIVE_TOKEN || "";
const monthNames = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
const album = document.querySelector("#album");
const photoCount = document.querySelector("#photoCount");
const yearSpan = document.querySelector("#yearSpan");
const lightbox = document.querySelector("#lightbox");
const lightboxImage = document.querySelector("#lightboxImage");
const lightboxCaption = document.querySelector("#lightboxCaption");
let photos = [];
let lightboxIndex = 0;

function friendlyDate(value) {
  const parts = value.split("-").map(Number);
  if (parts.length !== 3) return value;
  return `${parts[2]} ${monthNames[parts[1] - 1]} ${parts[0]}`;
}

function parseCsv(text) {
  const source = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [], cell = "", inQuotes = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index], next = source[index + 1];
    if (inQuotes) {
      if (character === '"' && next === '"') { cell += '"'; index++; }
      else if (character === '"') inQuotes = false;
      else cell += character;
    } else if (character === '"') inQuotes = true;
    else if (character === ",") { row.push(cell); cell = ""; }
    else if (character === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (character !== "\r") cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = (rows.shift() || []).map(value => value.trim());
  return rows.filter(values => values.some(value => value.trim())).map(values =>
    Object.fromEntries(headers.map((header, index) => [header, (values[index] || "").trim()]))
  );
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, character => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;",
  })[character]);
}

async function loadPhotos() {
  if (window.location.protocol !== "file:" || !archiveToken) return [];
  try {
    const response = await fetch(`https://127.0.0.1:47831/gallery?album=${encodeURIComponent(albumSlug)}`, {
      cache: "no-store", headers: {"X-Mina-Vaxter-Token": archiveToken}
    });
    const payload = await response.json();
    return response.ok && payload.ok && Array.isArray(payload.photos) ? payload.photos : [];
  } catch (error) {
    return [];
  }
}

function publishedPhotos() {
  const source = document.querySelector("#defaultPhotosCSV");
  if (!source) return [];
  return parseCsv(source.textContent).map(row => ({
    date: row.date, url: row.file, name: row.file.split("/").pop(), cultivar: row.cultivar || "", published: true,
  })).filter(row => row.date && row.url);
}

function render() {
  photos.sort((a, b) => b.date.localeCompare(a.date) || String(a.name).localeCompare(String(b.name), "sv"));
  const years = [...new Set(photos.map(photo => photo.date.slice(0, 4)))];
  photoCount.textContent = photos.length === 1 ? "1 bild" : photos.length ? `${photos.length} bilder` : "Inga bilder ännu";
  yearSpan.textContent = years.length > 1 ? `${years.at(-1)}–${years[0]}` : years[0] || "Det första året väntar";
  if (!photos.length) {
    album.innerHTML = `<div class="empty-state"><span class="empty-flower">✢</span><h2>Här börjar albumet ${albumLabel}</h2><p>När bilder läggs till från Galleri får varje år sin egen plats och rytm här.</p></div>`;
    return;
  }
  album.innerHTML = years.map(year => {
    const yearPhotos = photos.filter(photo => photo.date.startsWith(year));
    const figures = yearPhotos.map(photo => {
      const index = photos.indexOf(photo);
      const cultivar = String(photo.cultivar || "").trim();
      return `<figure tabindex="0" data-index="${index}"><img src="${escapeHtml(photo.url)}" alt="${escapeHtml([albumLabel, cultivar, friendlyDate(photo.date)].filter(Boolean).join(", "))}" loading="lazy"><figcaption><span class="caption-date">${escapeHtml(friendlyDate(photo.date))}</span>${cultivar ? `<span class="caption-cultivar">${escapeHtml(cultivar)}</span>` : ""}</figcaption></figure>`;
    }).join("");
    return `<section class="year-section"><div class="year-heading"><h2>${year}</h2><span>${yearPhotos.length === 1 ? "1 ögonblick" : `${yearPhotos.length} ögonblick`}</span></div><div class="gallery">${figures}</div></section>`;
  }).join("");
}

function showLightbox(index) {
  lightboxIndex = (index + photos.length) % photos.length;
  const photo = photos[lightboxIndex];
  lightboxImage.src = photo.url;
  const cultivar = String(photo.cultivar || "").trim();
  lightboxImage.alt = [albumLabel, cultivar, friendlyDate(photo.date)].filter(Boolean).join(", ");
  lightboxCaption.textContent = [friendlyDate(photo.date), cultivar].filter(Boolean).join(" · ");
  if (!lightbox.open) lightbox.showModal();
}

album.addEventListener("click", event => {
  const figure = event.target.closest("figure[data-index]");
  if (figure) showLightbox(Number(figure.dataset.index));
});
album.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    const figure = event.target.closest("figure[data-index]");
    if (figure) showLightbox(Number(figure.dataset.index));
  }
});
lightbox.querySelector(".close-lightbox").addEventListener("click", () => lightbox.close());
lightbox.querySelector(".prev").addEventListener("click", () => showLightbox(lightboxIndex - 1));
lightbox.querySelector(".next").addEventListener("click", () => showLightbox(lightboxIndex + 1));
lightbox.addEventListener("click", event => { if (event.target === lightbox || event.target.classList.contains("lightbox")) lightbox.close(); });
document.addEventListener("keydown", event => {
  if (!lightbox.open) return;
  if (event.key === "ArrowLeft") showLightbox(lightboxIndex - 1);
  if (event.key === "ArrowRight") showLightbox(lightboxIndex + 1);
});

(async () => {
  const localPhotos = await loadPhotos();
  photos = localPhotos.length ? localPhotos : publishedPhotos();
  render();
})();
