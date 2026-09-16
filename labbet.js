(() => {
  "use strict";

  const SCHEMA_VERSION = 4;
  const CACHE_KEY = "mina-vaxter-labbet-katalog-v1";
  const VALID_VIEWS = new Set(["aktivt", "korsningar", "sadder", "uppdragning"]);
  const VALID_SPECIES = new Set(["Alla", "Hibiskus", "Pelargon", "Stapelia"]);
  const ACTIVE_SEEDLING_STATUSES = new Set(["Under uppdragning", "Redo för bedömning"]);
  const CONCLUDED_STATUSES = new Set(["I samlingen", "Gallrad", "Död", "Bortskänkt"]);

  const content = document.querySelector("#labContent");
  const speciesFilters = document.querySelector("#speciesFilters");
  const viewTabs = document.querySelector("#viewTabs");
  const infoDialog = document.querySelector("#infoDialog");
  const infoDialogContent = document.querySelector("#infoDialogContent");

  let snapshot = null;
  let model = null;

  const esc = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

  const clean = value => String(value ?? "").trim();
  const number = value => Number.parseInt(String(value || "0"), 10) || 0;
  const isoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(clean(value)) ? clean(value) : "";

  function displayDate(value, withYear = false) {
    const date = isoDate(value);
    if (!date) return "—";
    const parsed = new Date(`${date}T12:00:00`);
    return parsed.toLocaleDateString("sv-SE", withYear
      ? {day: "numeric", month: "short", year: "numeric"}
      : {day: "numeric", month: "short"});
  }

  function daysSince(value) {
    const date = isoDate(value);
    if (!date) return null;
    const then = new Date(`${date}T12:00:00`).getTime();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).getTime();
    return Math.max(0, Math.floor((today - then) / 86400000));
  }

  function latest(rows) {
    return [...rows].sort((a, b) => clean(b.date).localeCompare(clean(a.date)))[0] || null;
  }

  function earliestDate(rows, type) {
    return rows
      .filter(row => clean(row.type).toLocaleLowerCase("sv") === type.toLocaleLowerCase("sv") && isoDate(row.date))
      .map(row => row.date)
      .sort()[0] || "";
  }

  function milestoneIsConcluded(row) {
    const type = clean(row?.type).toLocaleLowerCase("sv");
    return type === "död" || type === "avliden" || type.startsWith("gallrad") || type === "överlämnad som gåva" || type === "bortskänkt";
  }

  function route() {
    const params = new URLSearchParams(window.location.search);
    const view = VALID_VIEWS.has(params.get("vy")) ? params.get("vy") : "aktivt";
    const species = VALID_SPECIES.has(params.get("art")) ? params.get("art") : "Alla";
    const status = ["Alla", "Under uppdragning", "Redo för bedömning"].includes(params.get("status")) ? params.get("status") : "Alla";
    return {view, species, status, batch: params.get("batch") || "", seedling: params.get("planta") || ""};
  }

  function updateRoute(changes, push = true) {
    const url = new URL(window.location.href);
    Object.entries(changes).forEach(([key, value]) => {
      if (value === null || value === "" || value === "Alla" && key !== "art") url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    });
    (push ? history.pushState : history.replaceState).call(history, null, "", url);
    render();
  }

  function plants(category) {
    return snapshot?.categories?.[category]?.plants || [];
  }

  function photos(category) {
    return snapshot?.categories?.[category]?.photos || [];
  }

  function buildModel() {
    const milestonesByPlant = new Map();
    (snapshot.milestones || []).forEach(row => {
      const rows = milestonesByPlant.get(row.id) || [];
      rows.push(row);
      milestonesByPlant.set(row.id, rows);
    });
    milestonesByPlant.forEach(rows => rows.sort((a, b) => clean(a.date).localeCompare(clean(b.date))));

    const photosByPlant = new Map();
    ["Hibiskus", "Pelargon", "Stapeliader"].forEach(category => {
      photos(category).forEach(photo => {
        const key = `${category}:${photo.plant_id}`;
        const rows = photosByPlant.get(key) || [];
        rows.push(photo);
        photosByPlant.set(key, rows);
      });
    });
    photosByPlant.forEach(rows => rows.sort((a, b) => clean(a.date).localeCompare(clean(b.date)) || clean(a.file).localeCompare(clean(b.file))));

    const pelargonById = new Map(plants("Pelargon").map(row => [row.id, row]));
    const crossings = (snapshot.crossings?.items || []).map(crossing => {
      const parent = id => {
        const row = pelargonById.get(id);
        return row ? clean(row.nickname) || clean(row.name) || id : id || "Okänd";
      };
      return {
        ...crossing,
        species: crossing.category === "Hibiskus" ? "Hibiskus" : "Pelargon",
        name: `${parent(crossing.mother_id)} ♀ × ${parent(crossing.father_id)} ♂`,
        active: clean(crossing.status) !== "Avslutad",
        href: `korsningar.html#${encodeURIComponent(crossing.crossing_id)}`
      };
    });
    const crossingById = new Map(crossings.map(row => [row.crossing_id, row]));
    const seedLotById = new Map((snapshot.crossings?.seedLots || []).map(row => [row.seed_lot_id, row]));

    const seedlings = [];
    const hibiscusGroups = new Map();

    plants("Hibiskus").filter(row => /^PL-H\d{2}(?:-|$)/.test(clean(row.id))).forEach(row => {
      const match = clean(row.id).match(/^PL-H(\d{2})(?:-([A-Z]))?(?:-(\d{2}))?$/);
      if (!match) return;
      const groupCode = match[3] ? `H${match[1]}-${match[2]}` : `H${match[1]}`;
      const batchId = `hib:${groupCode}`;
      const rows = milestonesByPlant.get(row.id) || [];
      const rowPhotos = photosByPlant.get(`Hibiskus:${row.id}`) || [];
      const firstFlower = rows.find(item => clean(item.type).toLocaleLowerCase("sv") === "första blomning");
      const concluded = latest(rows.filter(milestoneIsConcluded));
      let status = "Under uppdragning";
      if (concluded) {
        const type = clean(concluded.type).toLocaleLowerCase("sv");
        status = type.includes("gåva") || type === "bortskänkt" ? "Bortskänkt" : type.startsWith("gallrad") ? "Gallrad" : "Död";
      } else if (clean(row.breeding_selected).toLocaleLowerCase("sv") === "ja") status = "I samlingen";
      else if (firstFlower) status = "Redo för bedömning";
      const germinatedDate = earliestDate(rows, "Grodd");
      const latestMilestone = latest(rows.filter(item => !["sådd"].includes(clean(item.type).toLocaleLowerCase("sv")))) || latest(rows);
      const shortId = clean(row.id).replace(/^PL-/, "");
      const parentage = [clean(row.mother), clean(row.father)].some(value => value && value.toLocaleLowerCase("sv") !== "okänd")
        ? `${clean(row.mother) || "okänd"} ♀ × ${clean(row.father) || "okänd"} ♂`
        : "";
      const seedling = {
        id: row.id,
        internalId: row.id,
        shortId,
        species: "Hibiskus",
        taxon: parentage ? `Hibiskus · ${parentage}` : "Hibiskus",
        status,
        germinatedDate,
        sownDate: earliestDate(rows, "Sådd"),
        latestMilestone,
        milestones: rows,
        photos: rowPhotos,
        mainPhoto: clean(row.card_image) || rowPhotos.at(-1)?.file || "",
        cropX: clean(row.card_crop_x),
        cropY: clean(row.card_crop_y),
        notes: clean(row.card_note),
        source: clean(row.source) || "Okänt ursprung",
        parentage,
        batchId,
        groupCode
      };
      seedlings.push(seedling);
      const group = hibiscusGroups.get(batchId) || [];
      group.push(seedling);
      hibiscusGroups.set(batchId, group);
    });

    const batches = [];
    const pelargonPlants = plants("Pelargon");
    (snapshot.crossings?.sowBatches || []).forEach(batch => {
      const lot = seedLotById.get(batch.seed_lot_id) || {};
      const crossing = crossingById.get(lot.crossing_id) || {};
      const children = pelargonPlants.filter(row => clean(row.sow_batch_id) === batch.sow_batch_id);
      const fullCode = [lot.seed_lot_code, batch.sow_code].filter(Boolean).join("-") || batch.sow_code || batch.sow_batch_id;
      batches.push({
        id: batch.sow_batch_id,
        species: "Pelargon",
        name: crossing.name || "Pelargonsådd",
        fullCode,
        shortCode: batch.sow_code || fullCode,
        sownDate: batch.sown_date,
        seedsSown: number(batch.seeds_sown),
        germinated: number(batch.germinated_count),
        germinatedExact: true,
        registered: children.length,
        remaining: Math.max(0, number(batch.seeds_sown) - number(batch.germinated_count)),
        remainingExact: true,
        kept: children.filter(row => clean(row.breeding_selected).toLocaleLowerCase("sv") === "ja").length,
        concluded: children.filter(row => CONCLUDED_STATUSES.has(clean(row.status))).length,
        active: clean(crossing.status) !== "Avslutad" && (number(batch.germinated_count) < number(batch.seeds_sown) || children.length > 0),
        originLabel: `Fröskörd ${lot.seed_lot_code || "—"}`,
        originDetail: crossing.name || "Egen korsning",
        originHref: crossing.href || "korsningar.html",
        actionHref: crossing.href || "korsningar.html",
        history: (snapshot.crossings?.events || []).filter(row => row.crossing_id === lot.crossing_id),
        seedLotCode: lot.seed_lot_code || "",
        crossingId: lot.crossing_id || "",
        seedlings: children
      });
    });

    hibiscusGroups.forEach((group, batchId) => {
      const first = group[0];
      const sownDate = group.map(row => row.sownDate).filter(Boolean).sort()[0] || "";
      const parentage = group.map(row => row.parentage).find(Boolean) || "";
      const source = group.map(row => row.source).find(Boolean) || "Okänt ursprung";
      const germinated = group.filter(row => row.germinatedDate || clean(row.status) !== "Död").length;
      batches.push({
        id: batchId,
        species: "Hibiskus",
        name: parentage || `Hibiskussådd ${first.groupCode}`,
        fullCode: `PL-${first.groupCode}`,
        shortCode: first.groupCode,
        sownDate,
        seedsSown: null,
        germinated,
        germinatedExact: true,
        registered: group.length,
        remaining: null,
        remainingExact: false,
        kept: group.filter(row => row.status === "I samlingen").length,
        concluded: group.filter(row => CONCLUDED_STATUSES.has(row.status)).length,
        active: group.some(row => ACTIVE_SEEDLING_STATUSES.has(row.status)),
        activeSowing: false,
        originLabel: `Fröparti ${first.groupCode}`,
        originDetail: source,
        originHref: `hibiskusar.html#${encodeURIComponent(first.internalId)}`,
        actionHref: `hibiskusar.html#${encodeURIComponent(first.internalId)}`,
        history: [...new Map(group.flatMap(row => row.milestones).map(row => [`${row.date}|${row.type}|${row.note}`, row])).values()],
        source,
        parentage,
        seedlings: group
      });
    });

    const stapeliaPlants = plants("Stapeliader");
    const stapeliaSeedLots = snapshot.categories?.Stapeliader?.seedLots || [];
    const stapeliaLotById = new Map(stapeliaSeedLots.map(row => [row["fröparti_id"], row]));
    stapeliaPlants.filter(row => clean(row.acquisition_type) === "Frö").forEach(plant => {
      const rows = milestonesByPlant.get(plant.id) || [];
      const sowings = rows.filter(row => clean(row.type).toLocaleLowerCase("sv") === "sådd");
      sowings.forEach((sowing, index) => {
        const lotId = clean(sowing.seed_lot_id) || clean(plant.seed_lot_id) || plant.id;
        const lot = stapeliaLotById.get(lotId) || {};
        const sowKey = clean(sowing.from_sowing_key) || `${plant.id}|${sowing.date}|${sowing.type}|${sowing.note}|${clean(sowing.seed_lot_id)}`;
        const germinations = rows.filter(row => {
          if (clean(row.type).toLocaleLowerCase("sv") !== "grodd") return false;
          if (clean(row.seed_lot_id)) return clean(row.seed_lot_id) === clean(sowing.seed_lot_id);
          if (clean(row.from_sowing_key)) return clean(row.from_sowing_key) === sowKey;
          return sowings.length === 1 || index === 0;
        });
        const sownCount = number(clean(sowing.note).match(/\d+/)?.[0]);
        const minimumGerminated = germinations.length ? 1 : 0;
        const codeRoot = lotId || plant.id;
        const shortCode = `B${String(index + 1).padStart(2, "0")}`;
        batches.push({
          id: `sta:${plant.id}:${codeRoot}:${sowing.date}:${index + 1}`,
          species: "Stapelia",
          name: clean(plant.full_botanical_name) || clean(plant.short_name) || plant.id,
          fullCode: `${codeRoot}-${shortCode}`,
          shortCode,
          sownDate: sowing.date,
          seedsSown: sownCount || null,
          germinated: minimumGerminated,
          germinatedExact: false,
          registered: 0,
          remaining: null,
          remainingExact: false,
          kept: 0,
          concluded: 0,
          active: !latest(rows.filter(milestoneIsConcluded)),
          activeSowing: true,
          germinatedDate: germinations.map(row => row.date).sort()[0] || "",
          originLabel: `Fröparti ${codeRoot}`,
          originDetail: clean(lot["leverantör"]) || clean(plant.supplier) || "Okänd leverantör",
          originHref: `stapeliader.html#${encodeURIComponent(plant.id)}`,
          actionHref: `stapeliader.html#${encodeURIComponent(plant.id)}`,
          history: rows.filter(row => !clean(row.seed_lot_id) || clean(row.seed_lot_id) === clean(sowing.seed_lot_id)),
          plantId: plant.id,
          seedlings: []
        });
      });
    });

    const batchById = new Map(batches.map(row => [row.id, row]));
    seedlings.forEach(seedling => { seedling.batch = batchById.get(seedling.batchId) || null; });
    const seedlingById = new Map(seedlings.map(row => [row.id, row]));
    batches.sort((a, b) => clean(b.sownDate).localeCompare(clean(a.sownDate)) || clean(a.fullCode).localeCompare(clean(b.fullCode), "sv"));
    seedlings.sort((a, b) => clean(b.germinatedDate || b.sownDate).localeCompare(clean(a.germinatedDate || a.sownDate)) || clean(a.shortId).localeCompare(clean(b.shortId), "sv", {numeric: true}));
    return {crossings, batches, seedlings, batchById, seedlingById};
  }

  function matchesSpecies(row, species) {
    return species === "Alla" || row.species === species;
  }

  function countText(value, exact = true, unknown = "Ej registrerat") {
    if (value === null || value === undefined) return unknown;
    return exact ? String(value) : (value > 0 ? `minst ${value}` : "Inte registrerat");
  }

  function batchProgress(batch) {
    const parts = [];
    if (batch.seedsSown !== null) parts.push(`${batch.seedsSown} sådda`);
    if (batch.germinatedExact) parts.push(`${batch.germinated} grodda`);
    else if (batch.germinated) parts.push(`grodd registrerad`);
    if (batch.registered) parts.push(`${batch.registered} fröplantor`);
    return parts.join(" · ") || "Sådd registrerad";
  }

  function batchNextStep(batch) {
    if (batch.germinated === 0) return "Nästa: följ groningen";
    if (batch.registered === 0) return "Nästa: individualisera fröplantor";
    return "Nästa: följ uppdragning och urval";
  }

  function batchCard(batch) {
    return `<button type="button" class="batch-card" data-open-batch="${esc(batch.id)}">
      <span class="chip-row"><span class="chip green">${esc(batch.species)}</span></span>
      <h3>${esc(batch.name)}</h3>
      <span class="batch-code">${esc(batch.fullCode)} · sådd ${esc(displayDate(batch.sownDate))}</span>
      <span class="batch-progress">${esc(batchProgress(batch))}</span>
      <span class="batch-next">${esc(batchNextStep(batch))} →</span>
    </button>`;
  }

  function emptyState(message) {
    return `<div class="empty-state">${esc(message)}</div>`;
  }

  function section(title, body, count = "") {
    return `<section class="section-block"><div class="section-heading"><h2>${esc(title)}</h2>${count ? `<span class="section-count">${esc(count)}</span>` : ""}</div>${body}</section>`;
  }

  function renderActive(species) {
    const crossings = model.crossings.filter(row => row.active && matchesSpecies(row, species));
    const batches = model.batches.filter(row => row.active && matchesSpecies(row, species));
    const seedlings = model.seedlings.filter(row => matchesSpecies(row, species));
    const activeSeedlings = seedlings.filter(row => row.status === "Under uppdragning");
    const ready = seedlings.filter(row => row.status === "Redo för bedömning");
    const stats = `<section class="stats-grid" aria-label="Sammanfattning">
      <article class="stat-card"><strong>${crossings.length}</strong><span>Aktiva korsningar</span></article>
      <article class="stat-card"><strong>${batches.length}</strong><span>Aktiva såbatcher</span></article>
      <article class="stat-card"><strong>${activeSeedlings.length}</strong><span>Under uppdragning</span></article>
      <article class="stat-card"><strong>${ready.length}</strong><span>Redo för bedömning</span></article>
    </section>`;

    const attentions = [];
    seedlings.filter(row => ACTIVE_SEEDLING_STATUSES.has(row.status)).forEach(seedling => {
      const notable = latest(seedling.milestones.filter(row => ["första knopp", "första blomning"].includes(clean(row.type).toLocaleLowerCase("sv"))));
      if (notable) attentions.push({
        date: notable.date,
        title: `${notable.type} registrerad`,
        detail: `${seedling.shortId} · ${displayDate(notable.date)}`,
        type: "seedling",
        id: seedling.id
      });
    });
    batches.filter(batch => batch.germinatedDate && daysSince(batch.germinatedDate) <= 14).forEach(batch => attentions.push({
      date: batch.germinatedDate,
      title: "Nyligen grodd såbatch",
      detail: `${batch.fullCode} · ${displayDate(batch.germinatedDate)}`,
      type: "batch",
      id: batch.id
    }));
    attentions.sort((a, b) => clean(b.date).localeCompare(clean(a.date)));
    const attentionHtml = attentions.length
      ? `<div class="attention-list">${attentions.slice(0, 6).map(item => `<button type="button" class="attention-card" data-open-${item.type}="${esc(item.id)}"><span class="attention-icon">!</span><span><strong>${esc(item.title)}</strong><span>${esc(item.detail)}</span></span></button>`).join("")}</div>`
      : emptyState("Inget behöver särskild uppmärksamhet just nu.");

    const activeSowings = batches.filter(batch => batch.activeSowing !== false && (batch.germinated === 0 || daysSince(batch.sownDate) <= 45));
    const batchHtml = activeSowings.length ? `<div class="compact-list">${activeSowings.slice(0, 6).map(batchCard).join("")}</div>` : emptyState("Inga pågående groningsbatcher i valt filter.");

    const groups = ["Hibiskus", "Pelargon", "Stapelia"].map(groupSpecies => ({
      species: groupSpecies,
      count: model.seedlings.filter(row => row.species === groupSpecies && ACTIVE_SEEDLING_STATUSES.has(row.status) && (species === "Alla" || species === groupSpecies)).length
    })).filter(row => row.count > 0);
    const groupHtml = groups.length ? `<div class="group-grid">${groups.map(group => `<button type="button" class="group-card" data-open-group="${esc(group.species)}"><strong>${esc(group.species)}</strong><span>${group.count}</span></button>`).join("")}</div>` : emptyState("Inga individuella fröplantor under uppdragning i valt filter.");

    return `${stats}${section("Behöver uppmärksamhet", attentionHtml)}${section("Aktiva sådder", batchHtml, `${activeSowings.length} batcher`)}${section("Under uppdragning", groupHtml)}`;
  }

  function renderCrossings(species) {
    const rows = model.crossings.filter(row => matchesSpecies(row, species));
    const cards = rows.length ? `<div class="crossing-grid">${rows.map(row => `<a class="crossing-card" href="${esc(row.href)}">
      <span class="chip-row"><span class="chip green">${esc(row.species)}</span><span class="chip ${row.active ? "" : "ended"}">${esc(row.status)}</span></span>
      <h3>${esc(row.name)}</h3>
      <span class="crossing-meta">${esc(row.crossing_id)}</span>
      ${row.note ? `<p>${esc(row.note)}</p>` : ""}
      <span class="batch-next">Fortsätt i korsningsflödet →</span>
    </a>`).join("")}</div>` : emptyState("Inga registrerade korsningar i valt artfilter.");
    return `<div class="view-intro"><div><h2>Korsningar</h2><p>Pågående och avslutade korsningar. Registrering fortsätter tills vidare i det befintliga, validerade korsningsflödet.</p></div><a class="text-link" href="korsningar.html">Ny korsning →</a></div>${cards}`;
  }

  function renderBatches(species) {
    const rows = model.batches.filter(row => matchesSpecies(row, species));
    const cards = rows.length ? `<div class="batch-grid">${rows.map(batchCard).join("")}</div>` : emptyState("Inga såbatcher i valt artfilter.");
    return `<div class="view-intro"><div><h2>Sådder</h2><p>Batcher samlar sådatum, groning, individualisering och härkomst utan att flytta eller skriva om befintlig data.</p></div><span class="section-count">${rows.length} batcher</span></div>${cards}`;
  }

  function seedlingAge(seedling) {
    const days = daysSince(seedling.germinatedDate);
    return days === null ? "" : `${days} dagar sedan grodd`;
  }

  function seedlingCard(seedling) {
    const image = seedling.mainPhoto
      ? `<img src="${esc(seedling.mainPhoto)}" alt="${esc(seedling.shortId)}" loading="lazy" style="object-position:${esc(seedling.cropX || "50")}% ${esc(seedling.cropY || "50")}%">`
      : '<span class="seedling-placeholder">Ingen bild ännu</span>';
    const milestone = seedling.latestMilestone
      ? `${seedling.latestMilestone.type}${isoDate(seedling.latestMilestone.date) ? ` ${displayDate(seedling.latestMilestone.date)}` : ""}`
      : "Nästa: dokumentera utvecklingen";
    return `<button type="button" class="seedling-card" data-open-seedling="${esc(seedling.id)}">
      <div class="seedling-image">${image}${seedlingAge(seedling) ? `<span class="seedling-age">${esc(seedlingAge(seedling))}</span>` : ""}</div>
      <div class="seedling-body"><strong class="seedling-id">${esc(seedling.shortId)}</strong><span class="seedling-taxon">${esc(seedling.taxon)}</span><span class="chip ${seedling.status === "Redo för bedömning" ? "gold" : "green"}">${esc(seedling.status)}</span><span class="seedling-milestone">${esc(milestone)}</span></div>
    </button>`;
  }

  function renderSeedlings(species, status) {
    const rows = model.seedlings.filter(row => matchesSpecies(row, species) && ACTIVE_SEEDLING_STATUSES.has(row.status) && (status === "Alla" || row.status === status));
    const filters = `<div class="status-filter-wrap"><div><h2>Uppdragning</h2><p>Individuella fröplantor visas visuellt; avslutade plantor är dolda från den aktiva arbetsvyn.</p></div><div class="status-filters" id="statusFilters" role="group" aria-label="Statusfilter">${["Alla", "Under uppdragning", "Redo för bedömning"].map(value => `<button type="button" data-status="${esc(value)}" class="${status === value ? "active" : ""}" aria-pressed="${status === value}">${esc(value)}</button>`).join("")}</div></div>`;
    return `${filters}${rows.length ? `<div class="seedling-grid">${rows.map(seedlingCard).join("")}</div>` : emptyState("Inga aktiva fröplantor matchar filtren.")}`;
  }

  function historyHtml(rows) {
    const sorted = [...rows].sort((a, b) => clean(b.date).localeCompare(clean(a.date)));
    return sorted.length ? `<div class="history-list">${sorted.map(row => `<div class="history-item"><span>${esc(displayDate(row.date, true))}</span><span><strong>${esc(row.type)}</strong>${row.note ? `<br>${esc(row.note)}` : ""}</span></div>`).join("")}</div>` : '<p>Ingen historik registrerad.</p>';
  }

  function renderBatchDetail(batch) {
    const shouldRegisterGermination = batch.germinated === 0;
    const action = shouldRegisterGermination
      ? `<a class="primary-action" href="${esc(batch.actionHref)}">Registrera grodd</a>`
      : `<button type="button" class="primary-action" data-future-action="seedling">Registrera fröplanta</button>`;
    return `<section class="detail-shell">
      <button type="button" class="back-button" data-close-detail>← Till sådder</button>
      <article class="detail-card">
        <div class="detail-hero"><div><div class="detail-kicker">Såbatch · ${esc(batch.species)}</div><h2>${esc(batch.name)}</h2><div class="detail-code">${esc(batch.fullCode)}</div></div><div class="detail-actions">${action}<p class="action-note">${shouldRegisterGermination ? "Öppnar nuvarande validerade registrering." : "Själva fröplantslagringen kopplas in i nästa steg."}</p></div></div>
        <div class="detail-body">
          <dl class="fact-grid">
            <div class="fact"><dt>Sådatum</dt><dd>${esc(displayDate(batch.sownDate, true))}</dd></div>
            <div class="fact"><dt>Antal sådda</dt><dd>${esc(countText(batch.seedsSown))}</dd></div>
            <div class="fact"><dt>Antal grodda</dt><dd>${esc(countText(batch.germinated, batch.germinatedExact))}</dd></div>
            <div class="fact"><dt>Individuellt registrerade</dt><dd>${batch.registered}</dd></div>
            <div class="fact"><dt>Kvar / ej grodda</dt><dd>${esc(countText(batch.remaining, batch.remainingExact, "Ej räknat"))}</dd></div>
            <div class="fact"><dt>Behållna i samlingen</dt><dd>${batch.kept}</dd></div>
            <div class="fact"><dt>Avslutade</dt><dd>${batch.concluded}</dd></div>
          </dl>
          <section class="detail-section"><h3>Ursprung</h3><a class="origin-link" href="${esc(batch.originHref)}"><span>Härkomst<strong>${esc(batch.originLabel)} → ${esc(batch.originDetail)}</strong></span><b>→</b></a></section>
          ${batch.seedlings?.length ? `<section class="detail-section"><h3>Fröplantor</h3><div class="seedling-grid">${batch.seedlings.filter(row => row.id && model.seedlingById.has(row.id)).map(row => seedlingCard(model.seedlingById.get(row.id))).join("")}</div></section>` : ""}
          <details><summary>Historik och övriga detaljer</summary>${historyHtml(batch.history)}</details>
        </div>
      </article>
    </section>`;
  }

  function galleryHtml(seedling) {
    const rows = seedling.photos;
    if (!rows.length && !seedling.mainPhoto) return '<div class="detail-gallery-main"><div class="detail-gallery-copy">Ingen bild registrerad ännu</div></div>';
    const main = seedling.mainPhoto || rows.at(-1)?.file;
    const galleryRows = rows.length ? rows : [{file: main, label: seedling.shortId}];
    return `<div class="detail-gallery-main"><img id="seedlingMainPhoto" src="${esc(main)}" alt="${esc(seedling.shortId)}"></div><div class="detail-gallery-thumbs">${galleryRows.map((photo, index) => `<button type="button" class="${photo.file === main || (!index && !main) ? "active" : ""}" data-gallery-photo="${esc(photo.file)}" data-gallery-alt="${esc(`${seedling.shortId} · ${photo.label || photo.type || "bild"}`)}"><img src="${esc(photo.file)}" alt="" loading="lazy"></button>`).join("")}</div>`;
  }

  function renderSeedlingDetail(seedling) {
    const batch = seedling.batch;
    const latestMilestone = seedling.latestMilestone ? `${seedling.latestMilestone.type} · ${displayDate(seedling.latestMilestone.date, true)}` : "—";
    const lineage = [
      {title: seedling.shortId, sub: `Provisoriskt fröplants-ID · internt ${seedling.internalId}`},
      {title: `Såbatch ${batch?.shortCode || seedling.groupCode}`, sub: batch?.sownDate ? `Sådd ${displayDate(batch.sownDate, true)}` : ""},
      {title: batch?.originLabel || `Fröparti ${seedling.groupCode}`, sub: batch?.originDetail || seedling.source}
    ];
    if (seedling.parentage) lineage.push({title: seedling.parentage, sub: "Registrerad härkomst"});
    else lineage.push({title: seedling.source, sub: "Källa"});
    return `<section class="detail-shell">
      <button type="button" class="back-button" data-close-detail>← Till uppdragning</button>
      <article class="detail-card">
        <div class="seedling-detail-hero">
          <div class="detail-gallery">${galleryHtml(seedling)}</div>
          <div class="seedling-detail-copy">
            <div><div class="detail-kicker">Fröplanta · ${esc(seedling.species)}</div><h2>${esc(seedling.shortId)}</h2><div class="detail-code">${esc(seedling.taxon)}</div></div>
            <span class="chip ${seedling.status === "Redo för bedömning" ? "gold" : "green"}">${esc(seedling.status)}</span>
            <dl class="fact-grid">
              <div class="fact"><dt>Grodddatum</dt><dd>${esc(seedling.germinatedDate ? displayDate(seedling.germinatedDate, true) : "Ej registrerat")}</dd></div>
              <div class="fact"><dt>Ålder</dt><dd>${esc(seedlingAge(seedling) || "—")}</dd></div>
              <div class="fact"><dt>Senaste milstolpe</dt><dd>${esc(latestMilestone)}</dd></div>
            </dl>
            <div class="detail-actions"><button type="button" class="future-action" disabled title="Slutlig ID- och migreringslogik byggs inte i denna version">Behåll i samlingen</button><p class="action-note">Förberedd för en senare, säker överföring till den permanenta samlingen.</p></div>
          </div>
        </div>
        <div class="detail-body">
          <section class="detail-section"><h3>Härkomst</h3><ol class="lineage-chain">${lineage.map(item => `<li>${esc(item.title)}${item.sub ? `<small>${esc(item.sub)}</small>` : ""}</li>`).join("")}</ol></section>
          ${seedling.notes ? `<section class="detail-section"><h3>Anteckningar</h3><p>${esc(seedling.notes)}</p></section>` : ""}
          <details open><summary>Milstolpar och historik</summary>${historyHtml(seedling.milestones)}</details>
        </div>
      </article>
    </section>`;
  }

  function syncControls(current) {
    speciesFilters.querySelectorAll("[data-species]").forEach(button => {
      const active = button.dataset.species === current.species;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    viewTabs.querySelectorAll("[data-view]").forEach(button => {
      const active = button.dataset.view === current.view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
  }

  function render() {
    if (!model) return;
    const current = route();
    syncControls(current);
    if (current.batch) {
      const batch = model.batchById.get(current.batch);
      content.innerHTML = batch ? renderBatchDetail(batch) : emptyState("Såbatchen kunde inte hittas.");
      return;
    }
    if (current.seedling) {
      const seedling = model.seedlingById.get(current.seedling);
      content.innerHTML = seedling ? renderSeedlingDetail(seedling) : emptyState("Fröplantan kunde inte hittas.");
      return;
    }
    if (current.view === "korsningar") content.innerHTML = renderCrossings(current.species);
    else if (current.view === "sadder") content.innerHTML = renderBatches(current.species);
    else if (current.view === "uppdragning") content.innerHTML = renderSeedlings(current.species, current.status);
    else content.innerHTML = renderActive(current.species);
  }

  function showFutureAction(kind) {
    const seedling = kind === "seedling";
    infoDialogContent.innerHTML = `<h2>${seedling ? "Registrera fröplanta" : "Funktionen är förberedd"}</h2><p>${seedling
      ? "Knappen och arbetsflödet finns på plats, men den skapar ännu ingen permanent HIB-, PEL- eller STA-individ. Nästa steg är att koppla en separat fröplantsmodell till den validerade synkningen."
      : "Den slutliga lagringen byggs i ett senare steg."}</p>`;
    if (typeof infoDialog.showModal === "function") infoDialog.showModal();
  }

  speciesFilters.addEventListener("click", event => {
    const button = event.target.closest("[data-species]");
    if (!button) return;
    updateRoute({art: button.dataset.species, batch: null, planta: null});
  });

  viewTabs.addEventListener("click", event => {
    const button = event.target.closest("[data-view]");
    if (!button) return;
    updateRoute({vy: button.dataset.view, batch: null, planta: null});
  });

  content.addEventListener("click", event => {
    const batch = event.target.closest("[data-open-batch]");
    const seedling = event.target.closest("[data-open-seedling]");
    const group = event.target.closest("[data-open-group]");
    const status = event.target.closest("[data-status]");
    const back = event.target.closest("[data-close-detail]");
    const future = event.target.closest("[data-future-action]");
    const galleryPhoto = event.target.closest("[data-gallery-photo]");
    if (batch) updateRoute({batch: batch.dataset.openBatch, planta: null});
    else if (seedling) updateRoute({planta: seedling.dataset.openSeedling, batch: null});
    else if (group) updateRoute({vy: "uppdragning", art: group.dataset.openGroup, status: "Alla", batch: null, planta: null});
    else if (status) updateRoute({status: status.dataset.status});
    else if (back) updateRoute({batch: null, planta: null});
    else if (future) showFutureAction(future.dataset.futureAction);
    else if (galleryPhoto) {
      const image = document.querySelector("#seedlingMainPhoto");
      if (!image) return;
      image.src = galleryPhoto.dataset.galleryPhoto;
      image.alt = galleryPhoto.dataset.galleryAlt || "Fröplanta";
      content.querySelectorAll("[data-gallery-photo]").forEach(button => button.classList.toggle("active", button === galleryPhoto));
    }
  });

  window.addEventListener("popstate", render);

  function validateSnapshot(value, version) {
    if (!value || value.schemaVersion !== SCHEMA_VERSION || clean(value.catalogVersion) !== version || !value.categories || !value.crossings || !Array.isArray(value.milestones)) {
      throw new Error("Katalogens format stöds inte av Labbet.");
    }
    return value;
  }

  function cachedSnapshot() {
    try {
      const value = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (!value || value.schemaVersion !== SCHEMA_VERSION) return null;
      return value;
    } catch (error) {
      return null;
    }
  }

  async function loadSnapshot() {
    try {
      const versionResponse = await fetch("version.json", {cache: "no-store"});
      if (!versionResponse.ok) throw new Error("Katalogversionen kunde inte läsas.");
      const version = clean((await versionResponse.json()).version);
      if (!version) throw new Error("Katalogversion saknas.");
      const response = await fetch(`public-data/catalog.json?v=${encodeURIComponent(version)}`);
      if (!response.ok) throw new Error("Katalogdatan kunde inte läsas.");
      const value = validateSnapshot(await response.json(), version);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(value)); } catch (error) {}
      return value;
    } catch (error) {
      const cached = cachedSnapshot();
      if (cached) return cached;
      throw error;
    }
  }

  (async function initialise() {
    try {
      snapshot = await loadSnapshot();
      model = buildModel();
      render();
      if ("serviceWorker" in navigator && window.isSecureContext) {
        navigator.serviceWorker.register("service-worker.js?v=16").catch(() => {});
      }
    } catch (error) {
      console.error("Labbet kunde inte starta.", error);
      content.innerHTML = '<div class="error-state"><strong>Labbet kunde inte laddas.</strong>Uppdatera sidan och kontrollera anslutningen.</div>';
    }
  })();
})();
