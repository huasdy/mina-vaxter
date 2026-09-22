(() => {
  "use strict";

  const SCHEMA_VERSION = 4;
  const CACHE_KEY = "mina-vaxter-labbet-katalog-v1";
  const VALID_VIEWS = new Set(["froer", "korsningar", "sadder", "uppdragning"]);
  const VALID_SPECIES = new Set(["Alla", "Hibiskus", "Pelargon", "Stapelia"]);
  const ACTIVE_SEEDLING_STATUSES = new Set(["Under uppdragning", "Redo för bedömning"]);
  const CONCLUDED_STATUSES = new Set(["I samlingen", "Gallrad", "Död", "Bortskänkt"]);
  const ACTIVE_CROSSING_STATUSES = new Set(["Pollinerad", "Frö utvecklas", "Frö skördat"]);

  const content = document.querySelector("#labContent");
  const labPortal = document.querySelector("#labPortal");
  const speciesFilters = document.querySelector("#speciesFilters");
  const infoDialog = document.querySelector("#infoDialog");
  const infoDialogContent = document.querySelector("#infoDialogContent");
  const newLabItem = document.querySelector("#newLabItem");

  let snapshot = null;
  let model = null;
  let pendingLabImages = [];
  let pendingLabMaterialImages = [];
  let pendingImageUrls = [];
  let seedBoxExpanded = false;

  const esc = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

  const clean = value => String(value ?? "").trim();
  const normalizeTaxon = value => clean(value)
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("sv-SE");
  const number = value => Number.parseInt(String(value || "0"), 10) || 0;
  const isoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(clean(value)) ? clean(value) : "";
  const crossingName = (mother, father) => `${clean(mother) || "Okänd"} × ${clean(father) || "Okänd"}`;

  function plantPageHref(plantId, species) {
    const page = species === "Hibiskus"
      ? "hibiskusar.html"
      : species === "Stapelia" ? "stapeliader.html" : "pelargoner.html";
    return `${page}#${encodeURIComponent(clean(plantId))}`;
  }

  function parentRoleHtml(role, label, name, plantId, species, image, linkParents) {
    const id = clean(plantId);
    const imageHtml = image
      ? `<img class="parent-role-image" src="${esc(image)}" alt="${esc(label)}: ${esc(name)}" loading="lazy" onerror="this.remove()">`
      : "";
    const nameHtml = linkParents && id
      ? `<a class="parent-role-link" href="${esc(plantPageHref(id, species))}">${esc(name)}</a>`
      : `<strong>${esc(name)}</strong>`;
    return `<div class="parent-role${image ? " has-parent-image" : ""}">${imageHtml}<span class="parent-role-label">${role} ${esc(label)}</span>${nameHtml}</div>`;
  }

  function parentPairHtml(crossing, className = "", options = {}) {
    const mother = clean(crossing?.motherName) || clean(crossing?.mother_name) || "Okänd";
    const father = clean(crossing?.fatherName) || clean(crossing?.father_name) || "Okänd";
    const species = clean(crossing?.species) || clean(crossing?.species_group);
    const motherId = clean(crossing?.motherId) || clean(crossing?.mother_id);
    const fatherId = clean(crossing?.fatherId) || clean(crossing?.father_id);
    const linkParents = options.links === true;
    const showImages = options.images === true;
    return `<div class="parent-pair${className ? ` ${className}` : ""}" aria-label="Föräldrar">
      ${parentRoleHtml("♀", "Moder", mother, motherId, species, showImages ? clean(crossing?.motherImage) : "", linkParents)}
      <span class="parent-cross" aria-hidden="true">×</span>
      ${parentRoleHtml("♂", "Pollen", father, fatherId, species, showImages ? clean(crossing?.fatherImage) : "", linkParents)}
    </div>`;
  }

  function originContent(batch) {
    const material = model.materialById.get(clean(batch.materialId));
    if (material?.type === "seed_harvest" && material.crossing) {
      return `<span class="origin-copy"><span class="origin-label">FRÖSKÖRD ${esc(material.code)}</span>${parentPairHtml(material.crossing, "origin-parent-pair")}</span>`;
    }
    return `<span class="origin-copy"><span class="origin-label">HÄRKOMST</span><strong>${esc(batch.originDetail || batch.originLabel || "—")}</strong></span>`;
  }

  function today() {
    const date = new Date();
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }

  function uniqueId(prefix) {
    const value = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replaceAll("-", "")
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
    return `${prefix}-${value}`;
  }

  function combinedLabData() {
    const data = {
      crossings: (snapshot.lab?.crossings || []).map(row => ({...row})),
      seedHarvests: (snapshot.lab?.seedHarvests || []).map(row => ({...row})),
      seedLots: (snapshot.lab?.seedLots || []).map(row => ({...row})),
      sowBatches: (snapshot.lab?.sowBatches || []).map(row => ({...row})),
      seedlings: (snapshot.lab?.seedlings || []).map(row => ({...row})),
      photos: (snapshot.lab?.photos || []).map(row => ({...row})),
      milestones: (snapshot.lab?.milestones || []).map(row => ({...row}))
    };
    const crossingsById = new Map(data.crossings.map(row => [clean(row.crossing_id), row]));
    const harvestsById = new Map(data.seedHarvests.map(row => [clean(row.seed_harvest_id), row]));
    const lotsById = new Map(data.seedLots.map(row => [clean(row.seed_lot_id), row]));
    const batchesById = new Map(data.sowBatches.map(row => [clean(row.sow_batch_id), row]));
    const seedlingsById = new Map(data.seedlings.map(row => [clean(row.seedling_id), row]));
    const milestoneIds = new Set(data.milestones.map(row => clean(row.milestone_id)));
    const operations = typeof getPendingLabItems === "function" ? getPendingLabItems() : [];
    operations.forEach(operation => {
      if (operation.kind === "crossing") {
        const row = {...(operation.crossing || {})};
        if (clean(row.crossing_id) && !crossingsById.has(clean(row.crossing_id))) {
          data.crossings.push(row);
          crossingsById.set(clean(row.crossing_id), row);
        }
      } else if (operation.kind === "seed_harvest") {
        const row = {...(operation.seed_harvest || {})};
        if (clean(row.seed_harvest_id) && !harvestsById.has(clean(row.seed_harvest_id))) {
          data.seedHarvests.push(row);
          harvestsById.set(clean(row.seed_harvest_id), row);
          const crossing = crossingsById.get(clean(row.crossing_id));
          if (crossing && !["Avslutad", "Misslyckad"].includes(clean(crossing.status))) crossing.status = "Frö skördat";
        }
      } else if (operation.kind === "seed_lot") {
        const row = {...(operation.seed_lot || {})};
        if (clean(row.seed_lot_id) && !lotsById.has(clean(row.seed_lot_id))) {
          data.seedLots.push(row);
          lotsById.set(clean(row.seed_lot_id), row);
        }
      } else if (operation.kind === "sow_batch") {
        const row = {...(operation.sow_batch || {})};
        if (clean(row.sow_batch_id) && !batchesById.has(clean(row.sow_batch_id))) {
          data.sowBatches.push(row);
          batchesById.set(clean(row.sow_batch_id), row);
          const material = clean(row.source_type) === "seed_harvest" ? harvestsById.get(clean(row.source_id)) : lotsById.get(clean(row.source_id));
          if (material && clean(material.seeds_remaining) !== "") material.seeds_remaining = String(Math.max(0, number(material.seeds_remaining) - number(row.seeds_sown)));
        }
      } else if (operation.kind === "batch_update") {
        const update = operation.batch_update || {};
        const batch = batchesById.get(clean(update.sow_batch_id));
        if (batch) {
          if (clean(update.germinated_count) !== "") batch.germinated_count = clean(update.germinated_count);
          if (Object.hasOwn(update, "germinated_date")) batch.germinated_date = clean(update.germinated_date);
          if (Object.hasOwn(update, "notes")) batch.notes = clean(update.notes);
        }
      } else if (operation.kind === "material_update") {
        const update = operation.material_update || {};
        const material = clean(update.source_type) === "seed_harvest" ? harvestsById.get(clean(update.source_id)) : lotsById.get(clean(update.source_id));
        if (material) {
          if (Object.hasOwn(update, "seeds_remaining") && clean(update.seeds_remaining) !== "") material.seeds_remaining = clean(update.seeds_remaining);
          if (Object.hasOwn(update, "notes")) material.notes = clean(update.notes);
          if (Object.hasOwn(update, "taxon")) material.taxon = clean(update.taxon);
          if (Object.hasOwn(update, "reference_image")) {
            material.reference_image = clean(update.reference_image);
            material._reference_image_override = true;
          }
        }
      } else if (operation.kind === "seedling") {
        const row = {...(operation.seedling || {})};
        if (clean(row.seedling_id) && !seedlingsById.has(clean(row.seedling_id))) {
          data.seedlings.push(row);
          seedlingsById.set(clean(row.seedling_id), row);
        }
      } else if (operation.kind === "milestone") {
        const row = {...(operation.milestone || {})};
        if (clean(row.milestone_id) && !milestoneIds.has(clean(row.milestone_id))) {
          data.milestones.push(row);
          milestoneIds.add(clean(row.milestone_id));
          const seedling = seedlingsById.get(clean(row.seedling_id));
          if (seedling && clean(row.type) === "Första blomning" && clean(seedling.status) === "Under uppdragning") seedling.status = "Redo för bedömning";
          if (seedling && ["Gallrad", "Död", "Bortskänkt"].includes(clean(row.type))) seedling.status = clean(row.type);
          if (seedling && clean(row.type) === "Grodd" && !clean(seedling.germinated_date)) seedling.germinated_date = clean(row.date);
        }
      } else if (operation.kind === "update") {
        const update = operation.update || {};
        const seedling = seedlingsById.get(clean(update.seedling_id));
        if (!seedling) return;
        if (clean(update.status)) seedling.status = clean(update.status);
        if (Object.hasOwn(update, "notes")) seedling.notes = clean(update.notes);
        if (isoDate(update.germinated_date)) seedling.germinated_date = clean(update.germinated_date);
      }
    });
    data.photos.push(...pendingLabImages);
    return data;
  }

  function displayDate(value, withYear = false) {
    const date = isoDate(value);
    if (!date) return "—";
    const parsed = new Date(`${date}T12:00:00`);
    return parsed.toLocaleDateString("sv-SE", withYear
      ? {day: "numeric", month: "short", year: "numeric"}
      : {day: "numeric", month: "short"});
  }

  function calendarDateTimestamp(value) {
    const date = isoDate(value);
    if (!date) return null;
    const [year, month, day] = date.split("-").map(Number);
    const timestamp = Date.UTC(year, month - 1, day);
    const parsed = new Date(timestamp);
    return parsed.getUTCFullYear() === year
      && parsed.getUTCMonth() === month - 1
      && parsed.getUTCDate() === day
      ? timestamp
      : null;
  }

  function calendarDaysBetween(start, end) {
    const startTimestamp = calendarDateTimestamp(start);
    const endTimestamp = calendarDateTimestamp(end);
    if (startTimestamp === null || endTimestamp === null) return null;
    return Math.round((endTimestamp - startTimestamp) / 86400000);
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
    return rows.reduce((selected, row) => {
      if (!selected) return row;
      const selectedKey = `${clean(selected.date)}|${clean(selected.created_at || selected.createdAt)}`;
      const rowKey = `${clean(row.date)}|${clean(row.created_at || row.createdAt)}`;
      return rowKey >= selectedKey ? row : selected;
    }, null);
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
    const requestedView = params.get("vy");
    const view = requestedView === "aktivt"
      ? "froer"
      : VALID_VIEWS.has(requestedView) ? requestedView : "froer";
    const species = VALID_SPECIES.has(params.get("art")) ? params.get("art") : "Alla";
    const status = ["Alla", "Under uppdragning", "Redo för bedömning"].includes(params.get("status"))
      ? params.get("status")
      : view === "uppdragning" ? "Under uppdragning" : "Alla";
    const sowSection = params.get("del") === "material" ? "material" : "batcher";
    return {
      view, species, status, sowSection,
      batch: params.get("batch") || "",
      seedling: params.get("planta") || "",
      crossing: params.get("korsning") || "",
      material: params.get("material") || ""
    };
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

  function photoCategoryForSpecies(species) {
    return species === "Stapelia" ? "Stapeliader" : species;
  }

  function resolvePlantReferenceImage(plantId, species) {
    const category = photoCategoryForSpecies(species);
    const plant = plants(category).find(row => clean(row.id) === clean(plantId));
    if (clean(plant?.card_image)) return clean(plant.card_image);
    const rows = photos(category)
      .filter(row => clean(row.plant_id) === clean(plantId) && clean(row.file))
      .sort((first, second) => clean(second.date).localeCompare(clean(first.date)) || clean(second.file).localeCompare(clean(first.file)));
    return rows.find(row => clean(row.type) === "hel")?.file || rows[0]?.file || "";
  }

  function resolveTaxonReferenceImage(taxon, seedLots, excludedLotId = "") {
    const taxonKey = normalizeTaxon(taxon);
    if (!taxonKey) return null;
    return (seedLots || [])
      .filter(row => row.type === "seed_lot"
        && clean(row.id) !== clean(excludedLotId)
        && normalizeTaxon(row.taxon) === taxonKey
        && clean(row.ownReferenceImage))
      .sort((first, second) => clean(first.code).localeCompare(clean(second.code), "sv")
        || clean(first.id).localeCompare(clean(second.id), "sv"))
      .map(row => ({file: clean(row.ownReferenceImage), material: row}))[0] || null;
  }

  function resolveMaterialOriginImages(material) {
    if (material?.type === "seed_harvest" && material.crossing) {
      return [material.crossing.motherImage, material.crossing.fatherImage].filter(Boolean);
    }
    if (material?.type === "seed_lot" && material.referenceImage) return [material.referenceImage];
    return [];
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
      const motherName = parent(crossing.mother_id);
      const fatherName = parent(crossing.father_id);
      return {
        ...crossing,
        species: crossing.category === "Hibiskus" ? "Hibiskus" : "Pelargon",
        motherName,
        fatherName,
        motherImage: resolvePlantReferenceImage(crossing.mother_id, crossing.category === "Hibiskus" ? "Hibiskus" : "Pelargon"),
        fatherImage: resolvePlantReferenceImage(crossing.father_id, crossing.category === "Hibiskus" ? "Hibiskus" : "Pelargon"),
        name: crossingName(motherName, fatherName),
        active: clean(crossing.status) !== "Avslutad",
        href: `korsningar.html#${encodeURIComponent(crossing.crossing_id)}`,
        adapter: true
      };
    });
    const legacyCrossingById = new Map(crossings.map(row => [row.crossing_id, row]));
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
        ? crossingName(clean(row.mother) || "okänd", clean(row.father) || "okänd")
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
      const crossing = legacyCrossingById.get(lot.crossing_id) || {};
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
        legacyRegistered: children.length,
        raising: 0,
        ready: 0,
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
        adapter: true,
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
        legacyKept: group.filter(row => row.status === "I samlingen").length,
        concluded: group.filter(row => CONCLUDED_STATUSES.has(row.status)).length,
        legacyConcluded: group.filter(row => CONCLUDED_STATUSES.has(row.status)).length,
        legacyRegistered: group.length,
        raising: group.filter(row => row.status === "Under uppdragning").length,
        ready: group.filter(row => row.status === "Redo för bedömning").length,
        active: group.some(row => ACTIVE_SEEDLING_STATUSES.has(row.status)),
        activeSowing: false,
        originLabel: `Fröparti ${first.groupCode}`,
        originDetail: source,
        originHref: `hibiskusar.html#${encodeURIComponent(first.internalId)}`,
        actionHref: `hibiskusar.html#${encodeURIComponent(first.internalId)}`,
        history: [...new Map(group.flatMap(row => row.milestones).map(row => [`${row.date}|${row.type}|${row.note}`, row])).values()],
        source,
        parentage,
        adapter: true,
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
          legacyRegistered: 0,
          raising: 0,
          ready: 0,
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
          adapter: true,
          seedlings: []
        });
      });
    });

    const lab = combinedLabData();
    const labCrossingById = new Map();
    lab.crossings.forEach(row => {
      const crossing = {
        crossing_id: clean(row.crossing_id),
        species: clean(row.species_group),
        motherId: clean(row.mother_id),
        motherName: clean(row.mother_name),
        fatherId: clean(row.father_id),
        fatherName: clean(row.father_name),
        motherImage: resolvePlantReferenceImage(row.mother_id, clean(row.species_group)),
        fatherImage: resolvePlantReferenceImage(row.father_id, clean(row.species_group)),
        name: crossingName(row.mother_name, row.father_name),
        pollinatedDate: clean(row.pollinated_date),
        status: clean(row.status) || "Pollinerad",
        note: clean(row.notes),
        createdAt: clean(row.created_at),
        active: ACTIVE_CROSSING_STATUSES.has(clean(row.status)),
        adapter: false,
        harvests: []
      };
      crossings.push(crossing);
      labCrossingById.set(crossing.crossing_id, crossing);
    });

    const materials = [];
    const materialById = new Map();
    lab.seedHarvests.forEach(row => {
      const crossing = labCrossingById.get(clean(row.crossing_id));
      if (!crossing) return;
      const material = {
        id: clean(row.seed_harvest_id),
        type: "seed_harvest",
        label: "Fröskörd",
        code: clean(row.code),
        species: crossing.species,
        taxon: crossing.name,
        sourceName: crossing.name,
        date: clean(row.harvested_date),
        pollinatedDate: clean(row.pollinated_date),
        developmentDate: clean(row.seed_development_date),
        original: clean(row.seeds_harvested) === "" ? null : number(row.seeds_harvested),
        remaining: clean(row.seeds_remaining) === "" ? null : number(row.seeds_remaining),
        notes: clean(row.notes),
        crossing,
        raw: row,
        batches: []
      };
      materials.push(material);
      materialById.set(material.id, material);
      crossing.harvests.push(material);
    });
    lab.seedLots.forEach(row => {
      const material = {
        id: clean(row.seed_lot_id),
        type: "seed_lot",
        label: "Fröpåse",
        code: clean(row.code),
        species: clean(row.species_group),
        taxon: clean(row.taxon),
        purchaseName: clean(row.purchase_name),
        sourceName: clean(row.supplier) || "Okänd källa",
        seller: clean(row.seller),
        date: clean(row.acquired_date),
        original: clean(row.seeds_original) === "" ? null : number(row.seeds_original),
        remaining: clean(row.seeds_remaining) === "" ? null : number(row.seeds_remaining),
        price: clean(row.price),
        currency: clean(row.currency),
        sourceCross: clean(row.source_cross),
        ownReferenceImage: row._reference_image_override
          ? clean(row.reference_image)
          : pendingLabMaterialImages.find(photo => clean(photo.materialId) === clean(row.seed_lot_id))?.file || clean(row.reference_image),
        notes: clean(row.notes),
        raw: row,
        batches: []
      };
      materials.push(material);
      materialById.set(material.id, material);
    });
    const seedLotMaterials = materials.filter(material => material.type === "seed_lot");
    seedLotMaterials.forEach(material => {
      const ownReferenceImage = clean(material.ownReferenceImage);
      if (ownReferenceImage) {
        material.referenceImage = ownReferenceImage;
        material.referenceImageInherited = false;
        material.referenceImageSource = null;
        return;
      }
      const sharedReference = resolveTaxonReferenceImage(material.taxon, seedLotMaterials, material.id);
      material.referenceImage = sharedReference?.file || "";
      material.referenceImageInherited = Boolean(sharedReference);
      material.referenceImageSource = sharedReference?.material || null;
    });
    const referenceUsage = new Map();
    seedLotMaterials.forEach(material => {
      const key = `${normalizeTaxon(material.taxon)}|${clean(material.referenceImage)}`;
      if (clean(material.referenceImage)) referenceUsage.set(key, (referenceUsage.get(key) || 0) + 1);
    });
    seedLotMaterials.forEach(material => {
      const key = `${normalizeTaxon(material.taxon)}|${clean(material.referenceImage)}`;
      material.referenceImageUsageCount = referenceUsage.get(key) || 0;
    });
    lab.sowBatches.forEach(row => {
      const material = materialById.get(clean(row.source_id)) || null;
      const seedsSown = number(row.seeds_sown);
      const germinated = number(row.germinated_count);
      const batch = {
        id: clean(row.sow_batch_id),
        species: clean(row.species_group),
        name: clean(row.taxon) || material?.taxon || clean(row.source_label) || "Sådd",
        fullCode: clean(row.full_code),
        shortCode: clean(row.batch_code),
        sownDate: clean(row.sown_date),
        seedsSown,
        germinated,
        germinatedExact: true,
        germinatedDate: clean(row.germinated_date),
        registered: 0,
        legacyRegistered: 0,
        raising: 0,
        ready: 0,
        remaining: Math.max(0, seedsSown - germinated),
        remainingExact: true,
        kept: 0,
        concluded: 0,
        active: true,
        activeSowing: true,
        originLabel: material ? `${material.label} ${material.code}` : clean(row.source_label) || "Äldre/okänt ursprung",
        originDetail: material ? material.sourceName : clean(row.source_label),
        originHref: "",
        actionHref: "",
        history: [],
        materialId: material?.id || "",
        sourceType: clean(row.source_type),
        sourceLabel: clean(row.source_label),
        containerCount: clean(row.container_count) === "" ? null : number(row.container_count),
        notes: clean(row.notes),
        adapter: false,
        seedlings: []
      };
      batches.push(batch);
      if (material) material.batches.push(batch);
    });
    const labPhotosBySeedling = new Map();
    lab.photos.forEach(photo => {
      const rows = labPhotosBySeedling.get(clean(photo.seedling_id)) || [];
      rows.push(photo);
      labPhotosBySeedling.set(clean(photo.seedling_id), rows);
    });
    const labMilestonesBySeedling = new Map();
    lab.milestones.forEach(milestone => {
      const rows = labMilestonesBySeedling.get(clean(milestone.seedling_id)) || [];
      rows.push(milestone);
      labMilestonesBySeedling.set(clean(milestone.seedling_id), rows);
    });
    lab.seedlings.forEach(row => {
      const rowMilestones = (labMilestonesBySeedling.get(clean(row.seedling_id)) || [])
        .sort((a, b) => clean(a.date).localeCompare(clean(b.date)) || clean(a.created_at).localeCompare(clean(b.created_at)));
      const rowPhotos = (labPhotosBySeedling.get(clean(row.seedling_id)) || [])
        .sort((a, b) => clean(a.date).localeCompare(clean(b.date)) || clean(a.created_at).localeCompare(clean(b.created_at)));
      const latestMilestone = latest(rowMilestones);
      seedlings.push({
        id: clean(row.seedling_id),
        internalId: clean(row.seedling_id),
        shortId: clean(row.provisional_id),
        individualNumber: number(row.individual_number),
        species: clean(row.species_group),
        taxon: clean(row.taxon) || clean(row.species_group),
        status: clean(row.status) || "Under uppdragning",
        germinatedDate: clean(row.germinated_date),
        sownDate: "",
        latestMilestone,
        milestones: rowMilestones,
        photos: rowPhotos,
        mainPhoto: rowPhotos.at(-1)?.file || "",
        cropX: "",
        cropY: "",
        notes: clean(row.notes),
        source: "",
        parentage: "",
        batchId: clean(row.sow_batch_id),
        groupCode: clean(row.batch_code),
        originCode: clean(row.origin_code),
        createdAt: clean(row.created_at),
        individualizedDate: isoDate(clean(row.created_at).slice(0, 10)),
        adapter: false
      });
    });

    const batchById = new Map(batches.map(row => [row.id, row]));
    seedlings.forEach(seedling => {
      seedling.batch = batchById.get(seedling.batchId) || null;
      if (seedling.batch && seedling.adapter === false) {
        seedling.batch.seedlings.push(seedling);
        seedling.sownDate = seedling.batch.sownDate;
        seedling.source = seedling.batch.originDetail;
        seedling.parentage = seedling.batch.species !== "Stapelia" ? seedling.batch.name : "";
      }
    });
    batches.forEach(batch => {
      const realSeedlings = batch.seedlings.filter(row => row?.adapter === false);
      batch.registered = number(batch.legacyRegistered) + realSeedlings.length;
      batch.raising = number(batch.raising) + realSeedlings.filter(row => row.status === "Under uppdragning").length;
      batch.ready = number(batch.ready) + realSeedlings.filter(row => row.status === "Redo för bedömning").length;
      batch.kept = number(batch.legacyKept ?? batch.kept) + realSeedlings.filter(row => row.status === "I samlingen").length;
      batch.concluded = number(batch.legacyConcluded ?? batch.concluded) + realSeedlings.filter(row => ["Gallrad", "Död", "Bortskänkt"].includes(row.status)).length;
      if (realSeedlings.some(row => ACTIVE_SEEDLING_STATUSES.has(row.status))) batch.active = true;
    });
    const crossingById = new Map(crossings.map(row => [row.crossing_id, row]));
    const seedlingById = new Map(seedlings.map(row => [row.id, row]));
    batches.sort((a, b) => clean(b.sownDate).localeCompare(clean(a.sownDate)) || clean(a.fullCode).localeCompare(clean(b.fullCode), "sv"));
    seedlings.sort((a, b) => clean(b.germinatedDate || b.sownDate).localeCompare(clean(a.germinatedDate || a.sownDate)) || clean(a.shortId).localeCompare(clean(b.shortId), "sv", {numeric: true}));
    materials.sort((a, b) => clean(b.date).localeCompare(clean(a.date)) || clean(a.code).localeCompare(clean(b.code), "sv", {numeric: true}));
    crossings.sort((a, b) => clean(b.pollinatedDate || b.created_at).localeCompare(clean(a.pollinatedDate || a.created_at)) || clean(a.name).localeCompare(clean(b.name), "sv"));
    return {crossings, crossingById, materials, materialById, batches, seedlings, batchById, seedlingById};
  }

  function matchesSpecies(row, species) {
    return species === "Alla" || row.species === species;
  }

  function crossingIsExhausted(crossing) {
    return crossing.adapter === false
      && crossing.harvests.length > 0
      && crossing.harvests.every(material => material.remaining !== null && material.remaining === 0);
  }

  function countText(value, exact = true, unknown = "Ej registrerat") {
    if (value === null || value === undefined) return unknown;
    return exact ? String(value) : (value > 0 ? `minst ${value}` : "Inte registrerat");
  }

  function batchProgress(batch) {
    const parts = [];
    if (batch.seedsSown !== null) parts.push(`${batch.seedsSown} sådda`);
    if (batch.germinatedExact) parts.push(`${batch.germinated} ${batch.germinated === 1 ? "grodd" : "grodda"}`);
    else if (batch.germinated) parts.push(`grodd registrerad`);
    if (batch.registered) parts.push(`${batch.registered} individualiserad${batch.registered === 1 ? "" : "e"}`);
    return parts.join(" · ") || "Sådd registrerad";
  }

  function batchCard(batch) {
    const legacyChip = batch.adapter !== false ? '<span class="chip">Legacy</span>' : '';
    return `<button type="button" class="batch-card" data-open-batch="${esc(batch.id)}">
      <span class="chip-row"><span class="chip green">${esc(batch.species)}</span>${legacyChip}</span>
      <h3>${esc(batch.name)}</h3>
      <span class="batch-code">${esc(batch.fullCode)} · sådd ${esc(displayDate(batch.sownDate))}</span>
      <span class="batch-progress">${esc(batchProgress(batch))}</span>
    </button>`;
  }

  function emptyState(message) {
    return `<div class="empty-state">${esc(message)}</div>`;
  }

  function detailNavigation(label) {
    return `<div class="detail-navigation"><button type="button" class="back-button" data-close-detail>← ${esc(label)}</button></div>`;
  }

  function section(title, body, count = "") {
    return `<section class="section-block"><div class="section-heading"><h2>${esc(title)}</h2>${count ? `<span class="section-count">${esc(count)}</span>` : ""}</div>${body}</section>`;
  }

  function viewIntro(title, description, action = "", meta = "", titleId = "") {
    return `<div class="view-intro"><div class="view-intro-copy"><h2${titleId ? ` id="${esc(titleId)}"` : ""}>${esc(title)}</h2><p>${esc(description)}</p></div>${meta ? `<span class="view-intro-meta">${esc(meta)}</span>` : ""}${action}</div>`;
  }

  function materialReferenceImagesHtml(material) {
    const images = resolveMaterialOriginImages(material);
    if (!images.length) return "";
    const label = material.type === "seed_harvest" ? "Föräldrabild" : "Referensbild";
    return `<span class="seed-box-images${images.length > 1 ? " seed-box-images-cross" : ""}" aria-label="${esc(label)}">${images.map((file, index) => `<img src="${esc(file)}" alt="${esc(material.type === "seed_harvest" ? (index === 0 ? "Moder" : "Pollen") : "Referensbild")}" loading="lazy" onerror="this.remove()">`).join("")}</span>`;
  }

  function seedBoxCard(material) {
    const name = material.type === "seed_harvest" ? material.sourceName : material.taxon;
    const source = material.type === "seed_harvest" ? "Egen korsning" : material.sourceName;
    const detail = `${material.code}${source ? ` · ${source}` : ""}`;
    const remaining = material.remaining === null ? "Antal kvar ej registrerat" : `${material.remaining} frön kvar`;
    return `<button type="button" class="seed-box-card" data-open-material="${esc(material.id)}" aria-label="${esc(`${name}: ${detail}. ${remaining}. Öppna frömaterial.`)}">
      <span class="seed-box-card-inner"><span class="seed-box-copy"><strong>${esc(name)}</strong><span>${esc(detail)}</span><b>${esc(remaining)}</b></span>${materialReferenceImagesHtml(material)}</span>
    </button>`;
  }

  function renderSeedBox(species) {
    const rows = model.materials
      .filter(row => matchesSpecies(row, species) && row.remaining !== null && row.remaining > 0)
      .sort((first, second) => second.remaining - first.remaining || clean(first.taxon).localeCompare(clean(second.taxon), "sv"));
    const total = rows.reduce((sum, row) => sum + row.remaining, 0);
    const limit = 5;
    const visibleRows = seedBoxExpanded ? rows : rows.slice(0, limit);
    const summary = `${rows.length} ${rows.length === 1 ? "fröpåse" : "fröpåsar"} · ${total} frön kvar`;
    const toggle = rows.length > limit
      ? `<button type="button" class="text-link seed-box-toggle" data-seed-box-toggle>${seedBoxExpanded ? "Visa färre" : `Visa alla (${rows.length})`}</button>`
      : "";
    return `<section class="lab-view" aria-labelledby="seedBoxTitle">
      ${viewIntro("Fröer", "Fröpåsar med frön kvar och redo att så.", "", summary, "seedBoxTitle")}
      ${visibleRows.length ? `<div class="seed-box-grid">${visibleRows.map(seedBoxCard).join("")}</div>` : emptyState("Inga fröpartier med saldo kvar i valt artfilter.")}
      ${toggle}
    </section>`;
  }

  function portalStats(species) {
    const activeCrossings = model.crossings.filter(row => row.adapter === false && row.active && !crossingIsExhausted(row) && matchesSpecies(row, species));
    const activeBatches = model.batches.filter(row => row.adapter === false && row.active && matchesSpecies(row, species));
    const labSeedlings = model.seedlings.filter(row => row.adapter === false && matchesSpecies(row, species));
    const activeSeedlings = labSeedlings.filter(row => row.status === "Under uppdragning");
    const ready = labSeedlings.filter(row => row.status === "Redo för bedömning");
    const seedRows = model.materials.filter(row => matchesSpecies(row, species) && row.remaining !== null && row.remaining > 0);
    return {
      froer: {count: seedRows.length, secondary: `${seedRows.reduce((sum, row) => sum + row.remaining, 0)} frön kvar`},
      korsningar: {count: activeCrossings.length, secondary: "aktiva"},
      sadder: {count: activeBatches.length, secondary: "aktiva"},
      uppdragning: {count: activeSeedlings.length, secondary: "aktiva"},
      redo: {count: ready.length, secondary: "urval"}
    };
  }

  function syncPortal(current) {
    const stats = portalStats(current.species);
    labPortal.querySelectorAll("[data-lab-view]").forEach(button => {
      const key = button.dataset.portalStatus === "Redo för bedömning" ? "redo" : button.dataset.labView;
      const statusMatches = !button.dataset.portalStatus
        || button.dataset.portalStatus === current.status
        || current.status === "Alla" && button.dataset.portalStatus === "Under uppdragning";
      const active = button.dataset.labView === current.view && statusMatches;
      const stat = stats[key];
      const label = button.querySelector("span")?.textContent || "Labbetvy";
      const secondary = button.querySelector(`[data-portal-secondary="${key}"]`);
      button.classList.toggle("is-active", active);
      button.classList.toggle("is-empty", stat.count === 0);
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute("aria-label", `${label}: ${stat.count}. Öppna.`);
      const count = button.querySelector(`[data-portal-count="${key}"]`);
      if (count) count.textContent = String(stat.count);
      if (secondary) secondary.textContent = stat.secondary;
    });
  }

  function renderCrossings(species) {
    const rows = model.crossings.filter(row => matchesSpecies(row, species));
    const crossingCards = rowsToRender => rowsToRender.length ? `<div class="crossing-grid">${rowsToRender.map(row => row.adapter === false ? `<button type="button" class="crossing-card" data-open-crossing="${esc(row.crossing_id)}">
      <span class="chip-row"><span class="chip green">${esc(row.species)}</span><span class="chip ${crossingIsExhausted(row) || !row.active ? "ended" : ""}">${esc(crossingIsExhausted(row) ? "Avslutad" : row.status)}</span></span>
      <h3>${esc(row.name)}</h3>
      <span class="crossing-meta">Pollinerad ${esc(displayDate(row.pollinatedDate))}</span>
      ${row.note ? `<p>${esc(row.note)}</p>` : ""}
      <span class="batch-next">${row.harvests.length} fröskördar · öppna →</span>
    </button>` : `<a class="crossing-card" href="${esc(row.href)}">
      <span class="chip-row"><span class="chip green">${esc(row.species)}</span><span class="chip">Legacy</span><span class="chip ${row.active ? "" : "ended"}">${esc(row.status)}</span></span>
      <h3>${esc(row.name)}</h3><span class="crossing-meta">${esc(row.crossing_id)}</span>
      ${row.note ? `<p>${esc(row.note)}</p>` : ""}<span class="batch-next">Öppna äldre korsningsflöde →</span>
    </a>`).join("")}</div>` : emptyState("Inga korsningar i denna sektion i valt artfilter.");
    const activeRows = rows.filter(row => row.active && !crossingIsExhausted(row));
    const endedRows = rows.filter(row => !row.active || crossingIsExhausted(row));
    const endedSection = endedRows.length
      ? `<details class="archive-section"><summary>Avslutade korsningar <span>${endedRows.length}</span></summary>${crossingCards(endedRows)}</details>`
      : "";
    return `<section class="lab-view">${viewIntro("Korsningar", "Aktiva korsningar och deras fröskördar.", '<button type="button" class="primary-action" data-new-crossing>Ny korsning</button>')}${activeRows.length ? crossingCards(activeRows) : emptyState("Inga aktiva korsningar i valt artfilter.")}${endedSection}</section>`;
  }

  function materialCard(material) {
    const remaining = material.remaining === null ? "Antal kvar ej registrerat" : `${material.remaining} frön kvar`;
    const showSeller = material.seller && !(material.type === "seed_lot" && clean(material.sourceName).toLowerCase() === "ebay");
    return `<button type="button" class="material-card" data-open-material="${esc(material.id)}">
      <span class="chip-row"><span class="chip green">${esc(material.species)}</span><span class="chip">${esc(material.label)}</span></span>
      <h3>${esc(material.type === "seed_harvest" ? material.sourceName : material.taxon)}</h3>
      <p><strong>${esc(material.code)}</strong> · ${esc(material.type === "seed_harvest" ? displayDate(material.date) : material.sourceName)}${showSeller ? ` · Säljare: ${esc(material.seller)}` : ""}</p>
      <span class="batch-progress">${esc(remaining)}</span>
      <span class="batch-next">${material.batches.length} såbatcher · öppna →</span>
    </button>`;
  }

  function renderBatches(species, sowSection) {
    if (sowSection === "material") {
      const rows = model.materials.filter(row => matchesSpecies(row, species));
      const materialCards = rowsToRender => rowsToRender.length ? `<div class="material-grid">${rowsToRender.map(materialCard).join("")}</div>` : emptyState("Inga fröskördar eller fröpåsar i denna sektion i valt artfilter.");
      const activeRows = rows.filter(row => row.remaining !== 0);
      const consumedRows = rows.filter(row => row.remaining === 0);
      const consumedSection = consumedRows.length
        ? `<details class="archive-section"><summary>Förbrukade <span>${consumedRows.length}</span></summary>${materialCards(consumedRows)}</details>`
        : "";
      return `<section class="lab-view">${viewIntro("Frömaterial", "Fröskördar och externa fröpåsar hålls åtskilda och kan ge flera såbatcher.")}${activeRows.length ? materialCards(activeRows) : emptyState("Inget aktivt frömaterial i valt artfilter.")}${consumedSection}</section>`;
    }
    const rows = model.batches.filter(row => matchesSpecies(row, species));
    const cards = rows.length ? `<div class="batch-grid">${rows.map(batchCard).join("")}</div>` : emptyState("Inga såbatcher i valt artfilter.");
    return `<section class="lab-view">${viewIntro("Sådder", "Såbatcher och deras groddresultat.")}${cards}</section>`;
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
    const readyView = status === "Redo för bedömning";
    const title = readyView ? "Redo för bedömning" : "Under uppdragning";
    const description = readyView
      ? "Plantor som nått urvalsstadiet."
      : "Grodda plantor som ännu inte är redo för urval.";
    return `<section class="lab-view">${viewIntro(title, description)}${rows.length ? `<div class="seedling-grid">${rows.map(seedlingCard).join("")}</div>` : emptyState("Inga aktiva fröplantor matchar filtren.")}</section>`;
  }

  function historyHtml(rows) {
    const sorted = [...rows].sort((a, b) => clean(b.date).localeCompare(clean(a.date)));
    return sorted.length ? `<div class="history-list">${sorted.map(row => `<div class="history-item"><span>${esc(displayDate(row.date, true))}</span><span><strong>${esc(row.type)}</strong>${row.note ? `<br>${esc(row.note)}` : ""}</span></div>`).join("")}</div>` : '<p>Ingen historik registrerad.</p>';
  }

  function renderCrossingDetail(crossing) {
    return `<section class="detail-shell">
      ${detailNavigation("Till korsningar")}
      <article class="detail-card">
        <div class="detail-hero"><div><div class="detail-kicker">Egen korsning · ${esc(crossing.species)}</div><h2>${esc(crossing.name)}</h2><div class="detail-code">Pollinerad ${esc(displayDate(crossing.pollinatedDate, true))}</div></div><div class="detail-actions"><button type="button" class="primary-action" data-register-harvest="${esc(crossing.crossing_id)}">Registrera fröskörd</button><p class="action-note">En korsning kan ge flera separata fröskördar.</p></div></div>
        <div class="detail-body">
          <dl class="fact-grid"><div class="fact"><dt>Status</dt><dd>${esc(crossing.status)}</dd></div><div class="fact"><dt>Pollineringsdatum</dt><dd>${esc(displayDate(crossing.pollinatedDate, true))}</dd></div><div class="fact"><dt>Fröskördar</dt><dd>${crossing.harvests.length}</dd></div><div class="fact"><dt>Såbatcher</dt><dd>${crossing.harvests.reduce((sum, row) => sum + row.batches.length, 0)}</dd></div></dl>
          <section class="detail-section"><h3>Föräldrar</h3>${parentPairHtml(crossing, "detail-parent-pair", {links: true, images: true})}</section>
          <section class="detail-section"><h3>Anteckningar</h3><p>${esc(crossing.note || "Ingen anteckning ännu.")}</p></section>
          <section class="detail-section"><h3>Fröskördar</h3>${crossing.harvests.length ? `<div class="material-grid">${crossing.harvests.map(materialCard).join("")}</div>` : emptyState("Ingen fröskörd registrerad ännu.")}</section>
        </div>
      </article>
    </section>`;
  }

  function materialDetailRows(rows) {
    const visible = rows.filter(([, value]) => clean(value));
    return visible.length
      ? `<dl class="material-detail-list">${visible.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>`
      : "";
  }

  function materialRawValue(material, ...keys) {
    const raw = material.raw || {};
    return keys.map(key => clean(raw[key])).find(value => value) || "";
  }

  function seedHarvestPollinatedDate(material) {
    return material?.crossing?.pollinatedDate || material?.pollinatedDate || "";
  }

  function materialSecondaryDetails(material) {
    if (material.type === "seed_harvest") {
      const rows = materialDetailRows([
        ["Pollinerad", seedHarvestPollinatedDate(material) ? displayDate(seedHarvestPollinatedDate(material), true) : ""],
        ["Frö började utvecklas", material.developmentDate ? displayDate(material.developmentDate, true) : ""],
        ["Skördedatum", material.date ? displayDate(material.date, true) : ""],
        ["Anteckningar", material.notes]
      ]);
      return rows ? `<details class="material-secondary-details"><summary>Fröskördsdetaljer</summary>${rows}</details>` : "";
    }
    const rawPrice = materialRawValue(material, "price");
    const price = rawPrice ? `${rawPrice}${material.currency ? ` ${material.currency}` : ""}` : "";
    const rows = materialDetailRows([
      ["Mottaget/inköpt", material.date ? displayDate(material.date, true) : ""],
      ["Pris", price],
      ["Butik/källa", materialRawValue(material, "supplier")],
      ["Säljare", materialRawValue(material, "seller")],
      ["Inköpsnamn", materialRawValue(material, "purchase_name")],
      ["Ordernummer", materialRawValue(material, "order_number")],
      ["Leverantörens artikelnummer", materialRawValue(material, "supplier_article_number", "article_number", "supplier_article")],
      ["Antal paket", materialRawValue(material, "package_count", "packages", "purchase_quantity")],
      ["Frön per paket", materialRawValue(material, "seeds_per_package", "seed_count_per_package")],
      ["Historisk referens", materialRawValue(material, "historical_reference", "historic_reference")],
      ["Inköps-/spårbarhetsanteckning", material.notes]
    ]);
    return rows ? `<details class="material-secondary-details"><summary>Inköpsdetaljer</summary>${rows}</details>` : "";
  }

  function materialReferenceDetailHtml(material) {
    if (material.type === "seed_harvest") {
      const images = resolveMaterialOriginImages(material);
      return images.length
        ? `<section class="detail-section"><h3>Föräldrabilder</h3><div class="material-origin-images">${images.map((file, index) => `<img src="${esc(file)}" alt="${index === 0 ? "Moder" : "Pollen"}" loading="lazy" onerror="this.remove()">`).join("")}</div></section>`
        : "";
    }
    if (!material.referenceImage) {
      return `<section class="detail-section"><h3>Referensbild</h3><button type="button" class="material-reference-empty" data-material-image-action="add" data-material-id="${esc(material.id)}"><span class="material-reference-icon">${typeof cameraLineIcon === "function" ? cameraLineIcon() : "＋"}</span><span>Lägg till referensbild</span></button></section>`;
    }
    const source = material.referenceImageSource;
    const sourceLabel = source ? [clean(source.code), clean(source.sourceName)].filter(Boolean).join(" · ") : "";
    const sharingNote = material.referenceImageUsageCount > 1
      ? `Bilden visas för ${material.referenceImageUsageCount} fröpartier med samma taxon.`
      : "";
    const inheritedNote = material.referenceImageInherited
      ? `Taxonbild från ${sourceLabel || "ett annat fröparti"}. ${sharingNote || "Bilden delas av fröpartier med samma taxon."}`
      : sharingNote;
    const removeAction = material.referenceImageInherited
      ? ""
      : `<button type="button" class="secondary-action danger-action" data-material-image-action="remove" data-material-id="${esc(material.id)}">Ta bort bild</button>`;
    return `<section class="detail-section"><h3>Referensbild</h3><div class="material-reference-shell" data-material-reference-shell><button type="button" class="material-reference-image" data-material-image-action="menu" data-material-id="${esc(material.id)}" aria-label="Öppna åtgärder för referensbild"><img src="${esc(material.referenceImage)}" alt="Referensbild för ${esc(material.taxon)}" onerror="this.remove()"></button><div class="material-reference-menu" data-material-image-menu hidden><button type="button" class="secondary-action" data-material-image-action="replace" data-material-id="${esc(material.id)}">Byt bild</button>${removeAction}</div>${inheritedNote ? `<p class="material-reference-note">${esc(inheritedNote)}</p>` : ""}</div></section>`;
  }

  function renderMaterialDetail(material) {
    const stock = material.remaining === null
      ? "Frön kvar ej registrerat"
      : material.original === null
        ? `${material.remaining} frön kvar`
        : `${material.remaining} frön kvar av ${material.original}`;
    const pollinatedDate = seedHarvestPollinatedDate(material);
    const developmentDays = material.type === "seed_harvest"
      ? calendarDaysBetween(pollinatedDate, material.date)
      : null;
    const seedHarvestFacts = material.type === "seed_harvest"
      ? `<dl class="fact-grid">
            <div class="fact"><dt>Pollineringsdatum</dt><dd>${esc(pollinatedDate ? displayDate(pollinatedDate, true) : "–")}</dd></div>
            <div class="fact"><dt>Skördedatum</dt><dd>${esc(material.date ? displayDate(material.date, true) : "–")}</dd></div>
            <div class="fact"><dt>Utvecklingstid</dt><dd>${esc(developmentDays === null ? "–" : `${developmentDays} dagar`)}</dd></div>
            <div class="fact"><dt>Skördade frön</dt><dd>${esc(material.original === null ? "–" : material.original)}</dd></div>
          </dl>`
      : "";
    const originSection = material.type === "seed_harvest"
      ? `<section class="detail-section"><h3>Härkomst</h3><button type="button" class="origin-link" data-open-crossing="${esc(material.crossing.crossing_id)}">${originContent({materialId: material.id})}<b>→</b></button></section>`
      : `<section class="detail-section"><h3>Härkomst</h3><p>${esc(material.sourceCross ? `${material.sourceName} · uppgiven korsning: ${material.sourceCross}` : material.sourceName)}</p></section>`;
    return `<section class="detail-shell">
      ${detailNavigation("Till frömaterial")}
      <article class="detail-card">
        <div class="detail-hero"><div><div class="detail-kicker">${esc(material.label)} · ${esc(material.species)}</div><h2>${esc(material.type === "seed_harvest" ? material.sourceName : material.taxon)}</h2><div class="detail-code">${esc(material.code)}</div></div><div class="detail-actions"><button type="button" class="primary-action" data-sow-material="${esc(material.id)}">Så frön</button>${material.type === "seed_lot" ? `<button type="button" class="secondary-action" data-edit-material-taxon="${esc(material.id)}">Redigera taxon</button>` : ""}<button type="button" class="secondary-action" data-adjust-material="${esc(material.id)}">Justera frölager</button><p class="action-note">Varje ny sådd får nästa lediga B-kod inom detta frömaterial.</p></div></div>
        <div class="detail-body">
          <div class="material-stock" aria-label="Frölager">${esc(stock)}</div>
          ${seedHarvestFacts}
          ${materialReferenceDetailHtml(material)}
          ${originSection}
          ${materialSecondaryDetails(material)}
          <section class="detail-section"><h3>Såbatcher</h3>${material.batches.length ? `<div class="batch-grid">${material.batches.map(batchCard).join("")}</div>` : emptyState("Inga såbatcher ännu.")}</section>
        </div>
      </article>
    </section>`;
  }

  function renderBatchDetail(batch) {
    const isLegacy = batch.adapter !== false;
    const shouldRegisterGermination = batch.germinated === 0;
    const action = isLegacy
      ? `<a class="primary-action" href="${esc(batch.actionHref || "korsningar.html")}">Öppna äldre korsningsflöde →</a>`
      : (() => {
          const germinationAction = `<button type="button" class="primary-action" data-edit-batch="${esc(batch.id)}">Registrera grodd</button>`;
          return shouldRegisterGermination
            ? `${germinationAction}<button type="button" class="secondary-action" data-register-seedling="${esc(batch.id)}">Individualisera känd planta</button>`
            : `<button type="button" class="primary-action" data-register-seedling="${esc(batch.id)}">Individualisera planta</button><button type="button" class="secondary-action" data-edit-batch="${esc(batch.id)}">Uppdatera groning</button>`;
        })();
    const actionNote = isLegacy
      ? "Äldre såbatch. Registrering och uppdatering görs i det äldre korsningsflödet."
      : (batch.registered > 0
        ? "Individualisera bara fler plantor som behöver egen identitet. Övriga kan fortsätta som grupp."
        : (["Stapelia", "Pelargon"].includes(batch.species)
          ? "Groddantal och första grodddatum sparas på batchen. Fortsatt gemensam uppdragning är normalt; individualisera vid behov."
          : "Groddantal och första grodddatum sparas på batchen. Individualisera först när en planta behöver egen identitet."));
    return `<section class="detail-shell">
      ${detailNavigation("Till sådder")}
      <article class="detail-card">
        <div class="detail-hero"><div><div class="detail-kicker">${isLegacy ? "Legacy-såbatch" : "Såbatch"} · ${esc(batch.species)}</div><h2>${esc(batch.name)}</h2><div class="detail-code">${esc(batch.fullCode)}</div></div><div class="detail-actions">${action}<p class="action-note">${actionNote}</p></div></div>
        <div class="detail-body">
          <dl class="fact-grid">
            <div class="fact"><dt>Sådatum</dt><dd>${esc(displayDate(batch.sownDate, true))}</dd></div>
            <div class="fact"><dt>Antal sådda</dt><dd>${esc(countText(batch.seedsSown))}</dd></div>
            <div class="fact"><dt>Antal grodda</dt><dd>${esc(countText(batch.germinated, batch.germinatedExact))}</dd></div>
            ${batch.registered > 0 ? `<div class="fact"><dt>Individualiserade LAB-plantor</dt><dd>${batch.registered}</dd></div>` : ""}
            <div class="fact"><dt>Under uppdragning</dt><dd>${batch.raising}</dd></div>
            <div class="fact"><dt>Redo för bedömning</dt><dd>${batch.ready}</dd></div>
            <div class="fact"><dt>Kvar / ej grodda</dt><dd>${esc(countText(batch.remaining, batch.remainingExact, "Ej räknat"))}</dd></div>
            <div class="fact"><dt>Behållna i samlingen</dt><dd>${batch.kept}</dd></div>
            <div class="fact"><dt>Avslutade</dt><dd>${batch.concluded}</dd></div>
          </dl>
          <section class="detail-section"><h3>Ursprung</h3>${batch.materialId ? `<button type="button" class="origin-link" data-open-material="${esc(batch.materialId)}">${originContent(batch)}<b>→</b></button>` : `<a class="origin-link" href="${esc(batch.originHref || "#")}">${originContent(batch)}<b>→</b></a>`}</section>
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
      {title: `Såbatch ${batch?.fullCode || batch?.shortCode || seedling.groupCode}`, sub: batch?.sownDate ? `Sådd ${displayDate(batch.sownDate, true)}` : ""}
    ];
    if (seedling.adapter === false && batch) {
      const material = model.materialById.get(batch.materialId);
      lineage.push({title: batch.originLabel, sub: ""});
      if (material?.type === "seed_harvest") lineage.push({title: material.sourceName, sub: "Egen korsning"});
      else if (material?.type === "seed_lot") {
        if (material.sourceName) lineage.push({title: material.sourceName, sub: "Leverantör/källa"});
        if (material.taxon) lineage.push({title: material.taxon, sub: "Taxon"});
      } else if (batch.originDetail) lineage.push({title: batch.originDetail, sub: "Äldre/okänt ursprung"});
    } else {
      lineage.push({title: batch?.originLabel || `Fröparti ${seedling.groupCode}`, sub: batch?.originDetail || seedling.source});
      if (seedling.parentage) lineage.push({title: seedling.parentage, sub: "Registrerad härkomst"});
      else lineage.push({title: seedling.source, sub: "Källa"});
    }
    const labActions = seedling.adapter === false ? `
      <button type="button" class="secondary-action add-photo-btn" data-lab-photo>Lägg till bild</button>
      <button type="button" class="secondary-action" data-add-seedling-milestone="${esc(seedling.id)}">Registrera milstolpe</button>
      <button type="button" class="secondary-action" data-edit-seedling="${esc(seedling.id)}">Redigera</button>
    ` : "";
    return `<section class="detail-shell">
      ${detailNavigation("Till uppdragning")}
      <article class="detail-card ${seedling.adapter === false ? "plant-card" : ""}" data-category="Labbet" data-plant-id="${esc(seedling.internalId)}" data-plant-name="${esc(seedling.shortId)}">
        <div class="seedling-detail-hero">
          <div class="detail-gallery">${galleryHtml(seedling)}</div>
          <div class="seedling-detail-copy">
            <div><div class="detail-kicker">Fröplanta · ${esc(seedling.species)}</div><h2>${esc(seedling.shortId)}</h2><div class="detail-code">${esc(seedling.taxon)}</div></div>
            <span class="chip ${seedling.status === "Redo för bedömning" ? "gold" : "green"}">${esc(seedling.status)}</span>
            <dl class="fact-grid">
              ${seedling.adapter === false ? `<div class="fact"><dt>Individualiserad</dt><dd>${esc(seedling.individualizedDate ? displayDate(seedling.individualizedDate, true) : "—")}</dd></div>` : ""}
              <div class="fact"><dt>Grodddatum</dt><dd>${esc(seedling.germinatedDate ? displayDate(seedling.germinatedDate, true) : "Ej registrerat")}</dd></div>
              <div class="fact"><dt>Ålder</dt><dd>${esc(seedlingAge(seedling) || "—")}</dd></div>
              <div class="fact"><dt>Senaste milstolpe</dt><dd>${esc(latestMilestone)}</dd></div>
            </dl>
            <div class="detail-actions">${labActions}<button type="button" class="future-action" disabled title="Slutlig ID- och migreringslogik byggs inte i denna version">Behåll i samlingen</button><p class="action-note">Förberedd för en senare, säker överföring till den permanenta samlingen.</p></div>
          </div>
        </div>
        <div class="detail-body">
          <section class="detail-section"><h3>Härkomst</h3><ol class="lineage-chain">${lineage.map(item => `<li>${esc(item.title)}${item.sub ? `<small>${esc(item.sub)}</small>` : ""}</li>`).join("")}</ol></section>
          <section class="detail-section"><h3>Anteckningar</h3><p>${esc(seedling.notes || "Ingen anteckning ännu.")}</p></section>
          <section class="detail-section"><h3>Bildhistorik</h3><p>${seedling.photos.length ? `${seedling.photos.length} registrerade bilder. Välj en miniatyr ovan för att visa den.` : "Ingen bild registrerad ännu."}</p></section>
          <details open><summary>Milstolpar och historik</summary>${historyHtml(seedling.milestones)}</details>
        </div>
      </article>
    </section>`;
  }

  function syncControls(current) {
    let activeButton = null;
    speciesFilters.querySelectorAll("[data-species]").forEach(button => {
      const active = button.dataset.species === current.species;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      if (active) activeButton = button;
    });
    if (activeButton) requestAnimationFrame(() => revealSpeciesFilter(activeButton));
  }

  function revealSpeciesFilter(button) {
    const scroller = button?.parentElement;
    if (!scroller) return;
    const leftGap = button.offsetLeft - scroller.scrollLeft;
    const rightGap = leftGap + button.offsetWidth - scroller.clientWidth;
    if (leftGap < 0) scroller.scrollLeft += leftGap - 8;
    else if (rightGap > 0) scroller.scrollLeft += rightGap + 8;
  }

  function render() {
    if (!model) return;
    const current = route();
    syncControls(current);
    syncPortal(current);
    if (current.crossing) {
      const crossing = model.crossingById.get(current.crossing);
      content.innerHTML = crossing?.adapter === false ? renderCrossingDetail(crossing) : emptyState("Korsningen kunde inte hittas.");
      return;
    }
    if (current.material) {
      const material = model.materialById.get(current.material);
      content.innerHTML = material ? renderMaterialDetail(material) : emptyState("Frömaterialet kunde inte hittas.");
      return;
    }
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
    else if (current.view === "sadder") content.innerHTML = renderBatches(current.species, current.sowSection);
    else if (current.view === "uppdragning") content.innerHTML = renderSeedlings(current.species, current.status);
    else content.innerHTML = renderSeedBox(current.species);
  }

  function closeInfoDialog() {
    if (infoDialog.open) infoDialog.close();
  }

  function showFormDialog(html, submit) {
    infoDialogContent.innerHTML = html;
    const form = infoDialogContent.querySelector("form");
    if (form) form.addEventListener("submit", async event => {
      event.preventDefault();
      const button = form.querySelector('[type="submit"]');
      if (button) button.disabled = true;
      try {
        await submit(new FormData(form));
        closeInfoDialog();
      } catch (error) {
        alert(error?.message || "Kunde inte spara ändringen.");
      } finally {
        if (button) button.disabled = false;
      }
    });
    if (typeof infoDialog.showModal === "function" && !infoDialog.open) infoDialog.showModal();
  }

  function closeDialogButton() {
    return '<button type="button" class="secondary-action" data-dialog-close>Avbryt</button>';
  }

  function collectionParents(species) {
    const category = species === "Stapelia" ? "Stapeliader" : species;
    return plants(category)
      .filter(row => species !== "Hibiskus" || !/^PL-H/.test(clean(row.id)))
      .map(row => ({
        id: clean(row.id),
        name: clean(row.nickname) || clean(row.full_botanical_name) || clean(row.name) || clean(row.short_name) || clean(row.id)
      }))
      .filter(row => row.id && row.name)
      .sort((a, b) => a.name.localeCompare(b.name, "sv"));
  }

  function openNewMenu() {
    infoDialogContent.innerHTML = `<h2>+ Nytt i Labbet</h2><p>Välj var arbetsflödet ska börja.</p><div class="choice-grid">
      <button type="button" data-choice="crossing"><strong>Ny korsning</strong><small>Moder ♀ × pollen ♂ med pollineringsdatum</small></button>
      <button type="button" data-choice="seed-lot"><strong>Registrera fröpåse</strong><small>Köpta, bytta eller mottagna frön med taxon, antal och källa</small></button>
      <button type="button" data-choice="sowing"><strong>Ny sådd</strong><small>Utgå från en fröskörd eller fröpåse</small></button>
    </div>`;
    infoDialogContent.querySelectorAll("[data-choice]").forEach(button => button.addEventListener("click", () => {
      if (button.dataset.choice === "crossing") openCrossingRegistration();
      else if (button.dataset.choice === "seed-lot") openSeedLotRegistration();
      else openSowBatchRegistration();
    }));
    if (typeof infoDialog.showModal === "function" && !infoDialog.open) infoDialog.showModal();
  }

  function openCrossingRegistration() {
    showFormDialog(`<h2>Ny korsning</h2><p>Föräldranamnen sparas tillsammans med ID:n så historiken består även om en planta senare lämnar samlingen.</p>
      <form class="lab-form">
        <label>Artgrupp<select name="species_group"><option>Pelargon</option><option>Hibiskus</option><option>Stapelia</option></select></label>
        <label>Pollineringsdatum<input name="pollinated_date" type="date" value="${today()}" max="${today()}" required></label>
        <label>Moderplanta ♀<select name="mother_id"></select></label>
        <label>Annat namn för moder<input name="mother_manual" placeholder="Används vid Annan/okänd"></label>
        <label>Pollenplanta ♂<select name="father_id"></select></label>
        <label>Annat namn för pollen<input name="father_manual" placeholder="Används vid Annan/okänd"></label>
        <label>Status<select name="status"><option>Pollinerad</option><option>Frö utvecklas</option><option>Frö skördat</option><option>Avslutad</option><option>Misslyckad</option></select></label>
        <label class="wide">Anteckning<textarea name="notes" rows="3"></textarea></label>
        <div class="dialog-actions">${closeDialogButton()}<button type="submit" class="primary-action">Skapa korsning</button></div>
      </form>`, async data => {
      const species = clean(data.get("species_group"));
      const parentRows = collectionParents(species);
      const parent = (role) => {
        const id = clean(data.get(`${role}_id`));
        const manual = clean(data.get(`${role}_manual`));
        const row = parentRows.find(item => item.id === id);
        return {id: id === "__manual" ? "" : id, name: id === "__manual" ? manual : row?.name || manual};
      };
      const mother = parent("mother");
      const father = parent("father");
      if (!mother.name || !father.name) throw new Error("Både moder- och pollenplanta måste anges.");
      const crossingId = uniqueId("LABC");
      queueLabChange("crossing", {
        crossing_id: crossingId, species_group: species,
        mother_id: mother.id, mother_name: mother.name, father_id: father.id, father_name: father.name,
        pollinated_date: isoDate(data.get("pollinated_date")), status: clean(data.get("status")),
        notes: clean(data.get("notes")), created_at: new Date().toISOString()
      });
      await refreshModel();
      updateRoute({vy: "korsningar", korsning: crossingId, material: null, batch: null, planta: null});
    });
    const form = infoDialogContent.querySelector("form");
    const refreshParents = () => {
      const species = form.elements.species_group.value;
      const options = collectionParents(species).map(row => `<option value="${esc(row.id)}">${esc(row.name)} · ${esc(row.id)}</option>`).join("");
      [form.elements.mother_id, form.elements.father_id].forEach(select => {
        select.innerHTML = `${options}<option value="__manual">Annan/okänd…</option>`;
      });
    };
    form.elements.species_group.addEventListener("change", refreshParents);
    refreshParents();
  }

  function openSeedHarvestRegistration(crossing) {
    const sequence = crossing.harvests.length;
    const code = `${String(new Date().getFullYear()).slice(-2)}${String.fromCharCode(65 + Math.min(sequence, 25))}`;
    showFormDialog(`<h2>Registrera fröskörd</h2><p>${esc(crossing.name)}</p><form class="lab-form">
      <label>Kod<input name="code" value="${esc(code)}" maxlength="24" required></label>
      <label>Pollineringsdatum<input name="pollinated_date" type="date" value="${esc(crossing.pollinatedDate)}" max="${today()}"></label>
      <label>Frö började utvecklas<input name="seed_development_date" type="date" max="${today()}"></label>
      <label>Skördedatum<input name="harvested_date" type="date" value="${today()}" max="${today()}" required></label>
      <label>Antal skördade<input name="seeds_harvested" type="number" min="0" inputmode="numeric"></label>
      <label>Antal kvar<input name="seeds_remaining" type="number" min="0" inputmode="numeric" placeholder="Samma som skördade"></label>
      <label class="wide">Anteckning<textarea name="notes" rows="3"></textarea></label>
      <div class="dialog-actions">${closeDialogButton()}<button type="submit" class="primary-action">Spara fröskörd</button></div>
    </form>`, async data => {
      const harvested = clean(data.get("seeds_harvested"));
      const harvestId = uniqueId("LABH");
      queueLabChange("seed_harvest", {
        seed_harvest_id: harvestId, crossing_id: crossing.crossing_id, code: clean(data.get("code")),
        pollinated_date: isoDate(data.get("pollinated_date")), seed_development_date: isoDate(data.get("seed_development_date")),
        harvested_date: isoDate(data.get("harvested_date")), seeds_harvested: harvested,
        seeds_remaining: clean(data.get("seeds_remaining")) || harvested, notes: clean(data.get("notes")),
        created_at: new Date().toISOString()
      });
      await refreshModel();
      updateRoute({vy: "sadder", del: "material", material: harvestId, korsning: null});
    });
  }

  function nextSeedLotCode() {
    const numbers = model.materials.filter(row => row.type === "seed_lot").map(row => clean(row.code).match(/^F(\d+)$/i)).filter(Boolean).map(match => number(match[1]));
    return `F${String(Math.max(0, ...numbers) + 1).padStart(2, "0")}`;
  }

  function openSeedLotRegistration() {
    showFormDialog(`<h2>Registrera fröpåse</h2><p>Köpta, bytta eller mottagna frön med taxon, antal och källa.</p><form class="lab-form">
      <label>Artgrupp<select name="species_group"><option>Stapelia</option><option>Hibiskus</option><option>Pelargon</option></select></label>
      <label>Fröpåsekod<input name="code" value="${esc(nextSeedLotCode())}" maxlength="24" required></label>
      <label class="wide">Art/taxon<input name="taxon" required></label>
      <label class="wide">Inköpsnamn från säljaren<input name="purchase_name"></label>
      <label>Leverantör/källa<input name="supplier"></label>
      <label>Säljare<input name="seller" placeholder="T.ex. marknadsplatssäljare"></label>
      <label>Mottaget eller inköpt<input name="acquired_date" type="date" max="${today()}"></label>
      <label>Ursprungligt antal<input name="seeds_original" type="number" min="0" inputmode="numeric"></label>
      <label>Antal kvar<input name="seeds_remaining" type="number" min="0" inputmode="numeric" placeholder="Samma som ursprungligt"></label>
      <label>Inköpspris<input name="price" type="number" min="0" step="0.01" inputmode="decimal"></label>
      <label>Valuta<input name="currency" maxlength="3" placeholder="SEK"></label>
      <label class="wide">Korsningsinformation från säljaren<input name="source_cross" placeholder="Uppgift från källan – skapar ingen egen korsning"></label>
      <label class="wide">Anteckning<textarea name="notes" rows="3"></textarea></label>
      <div class="dialog-actions">${closeDialogButton()}<button type="submit" class="primary-action">Spara fröpåse</button></div>
    </form>`, async data => {
      const original = clean(data.get("seeds_original"));
      const lotId = uniqueId("LABL");
      queueLabChange("seed_lot", {
        seed_lot_id: lotId, species_group: clean(data.get("species_group")), taxon: clean(data.get("taxon")),
        purchase_name: clean(data.get("purchase_name")), code: clean(data.get("code")), supplier: clean(data.get("supplier")), seller: clean(data.get("seller")), acquired_date: isoDate(data.get("acquired_date")),
        seeds_original: original, seeds_remaining: clean(data.get("seeds_remaining")) || original,
        price: clean(data.get("price")), currency: clean(data.get("currency")).toUpperCase(),
        source_cross: clean(data.get("source_cross")), notes: clean(data.get("notes")), created_at: new Date().toISOString(), reference_image: ""
      });
      await refreshModel();
      updateRoute({vy: "sadder", del: "material", material: lotId, korsning: null});
    });
  }

  function nextBatchNumber(materialId) {
    return Math.max(0, ...model.batches.filter(row => row.adapter === false && row.materialId === materialId).map(row => number(clean(row.shortCode).replace(/^B/, "")))) + 1;
  }

  function openSowBatchRegistration(selectedMaterial = null) {
    const materialOptions = model.materials.map(row => `<option value="${esc(row.id)}"${selectedMaterial?.id === row.id ? " selected" : ""}>${esc(row.label)} ${esc(row.code)} · ${esc(row.taxon)} · ${row.remaining === null ? "antal okänt" : `${row.remaining} kvar`}</option>`).join("");
    showFormDialog(`<h2>Ny sådd</h2><p>En såbatch måste ha en fröskörd, en fröpåse eller ett uttryckligt äldre/okänt ursprung.</p><form class="lab-form">
      <label class="wide">Ursprung<select name="source_id">${materialOptions}<option value="__legacy">Äldre/okänt ursprung…</option></select></label>
      <label data-legacy-field>Artgrupp vid äldre ursprung<select name="legacy_species"><option>Hibiskus</option><option>Pelargon</option><option>Stapelia</option></select></label>
      <label data-legacy-field>Taxon/arbetsnamn<input name="legacy_taxon"></label>
      <label class="wide" data-legacy-field>Beskriv ursprunget<input name="source_label" placeholder="T.ex. äldre fröpåse utan känt parti"></label>
      <label>Sådatum<input name="sown_date" type="date" value="${today()}" max="${today()}" required></label>
      <label>Antal sådda<input name="seeds_sown" type="number" min="1" inputmode="numeric" required></label>
      <label>Antal krukor/behållare<input name="container_count" type="number" min="1" inputmode="numeric"></label>
      <label>Batchkod<input name="batch_preview" disabled></label>
      <label class="wide">Anteckning<textarea name="notes" rows="3"></textarea></label>
      <div class="dialog-actions">${closeDialogButton()}<button type="submit" class="primary-action">Skapa såbatch</button></div>
    </form>`, async data => {
      const sourceIdValue = clean(data.get("source_id"));
      const material = model.materialById.get(sourceIdValue) || null;
      const legacy = sourceIdValue === "__legacy";
      const sourceLabel = clean(data.get("source_label"));
      if (legacy && !sourceLabel) throw new Error("Beskriv det äldre eller okända ursprunget.");
      const seedsSown = number(data.get("seeds_sown"));
      if (material?.remaining !== null && seedsSown > material.remaining) throw new Error(`Det finns bara ${material.remaining} frön kvar.`);
      const batchNumber = material ? nextBatchNumber(material.id) : 1;
      const batchCode = `B${String(batchNumber).padStart(2, "0")}`;
      const batchId = uniqueId("LABB");
      const sourceRoot = material?.code || "ÄLDRE";
      queueLabChange("sow_batch", {
        sow_batch_id: batchId, source_type: material?.type || "legacy", source_id: material?.id || uniqueId("LABO"),
        source_label: legacy ? sourceLabel : "", batch_number: String(batchNumber), batch_code: batchCode,
        full_code: `${sourceRoot}-${batchCode}`, species_group: material?.species || clean(data.get("legacy_species")),
        taxon: material?.taxon || clean(data.get("legacy_taxon")) || sourceLabel, sown_date: isoDate(data.get("sown_date")),
        seeds_sown: String(seedsSown), container_count: clean(data.get("container_count")), germinated_count: "0",
        germinated_date: "", notes: clean(data.get("notes")), created_at: new Date().toISOString()
      });
      await refreshModel();
      updateRoute({vy: "sadder", del: "batcher", batch: batchId, material: null, korsning: null});
    });
    const form = infoDialogContent.querySelector("form");
    const refreshSource = () => {
      const material = model.materialById.get(form.elements.source_id.value);
      const legacy = form.elements.source_id.value === "__legacy";
      form.querySelectorAll("[data-legacy-field]").forEach(label => { label.hidden = !legacy; });
      const next = material ? nextBatchNumber(material.id) : 1;
      form.elements.batch_preview.value = `B${String(next).padStart(2, "0")}`;
    };
    form.elements.source_id.addEventListener("change", refreshSource);
    refreshSource();
  }

  function openMaterialAdjustment(material) {
    showFormDialog(`<h2>Justera frölager</h2><p>${esc(material.label)} ${esc(material.code)} · justeringen sparar ett nytt faktiskt saldo.</p><form class="lab-form">
      <label>Antal frön kvar<input name="seeds_remaining" type="number" min="0" value="${esc(material.remaining ?? "")}" inputmode="numeric" required></label>
      <label class="wide">Anteckning<textarea name="notes" rows="3">${esc(material.notes)}</textarea></label>
      <div class="dialog-actions">${closeDialogButton()}<button type="submit" class="primary-action">Spara saldo</button></div>
    </form>`, async data => {
      queueLabChange("material_update", {source_type: material.type, source_id: material.id, seeds_remaining: clean(data.get("seeds_remaining")), notes: clean(data.get("notes")), updated_at: new Date().toISOString()});
      await refreshModel();
      updateRoute({material: material.id});
    });
  }

  function openMaterialTaxonEdit(material) {
    showFormDialog(`<h2>Redigera taxon</h2><p>${esc(material.label)} ${esc(material.code)} · endast taxonnamnet ändras.</p><form class="lab-form">
      <label class="wide">Taxon<input name="taxon" value="${esc(material.taxon)}" maxlength="200" required></label>
      <div class="dialog-actions">${closeDialogButton()}<button type="submit" class="primary-action">Spara taxon</button></div>
    </form>`, async data => {
      const taxon = clean(data.get("taxon"));
      if (!taxon) throw new Error("Taxon måste anges.");
      queueLabChange("material_update", {
        source_type: material.type,
        source_id: material.id,
        taxon,
        updated_at: new Date().toISOString()
      });
      await refreshModel();
      updateRoute({material: material.id});
    });
  }

  function openBatchUpdate(batch) {
    showFormDialog(`<h2>Registrera grodd</h2><p>${esc(batch.fullCode)} · groddantal och individuella fröplantor hålls separata.</p><form class="lab-form">
      <label>Antal grodda<input name="germinated_count" type="number" min="0" max="${batch.seedsSown}" value="${batch.germinated}" inputmode="numeric" required></label>
      <label>Första grodddatum<input name="germinated_date" type="date" value="${esc(batch.germinatedDate || today())}" max="${today()}"></label>
      <label class="wide">Anteckning<textarea name="notes" rows="3">${esc(batch.notes || "")}</textarea></label>
      <div class="dialog-actions">${closeDialogButton()}<button type="submit" class="primary-action">Spara groning</button></div>
    </form>`, async data => {
      const count = number(data.get("germinated_count"));
      queueLabChange("batch_update", {sow_batch_id: batch.id, germinated_count: String(count), germinated_date: count ? isoDate(data.get("germinated_date")) : "", notes: clean(data.get("notes")), updated_at: new Date().toISOString()});
      await refreshModel();
      updateRoute({batch: batch.id});
    });
  }

  function openSeedlingRegistration(batch) {
    const used = model.seedlings
      .filter(row => row.adapter === false && row.batchId === batch.id)
      .map(row => number(row.individualNumber));
    const nextNumber = Math.max(0, ...used) + 1;
    const provisionalId = `${batch.shortCode}-${String(nextNumber).padStart(2, "0")}`;
    showFormDialog(`<h2>Individualisera planta</h2>
      <p>${esc(batch.fullCode)} · nästa ID <strong>${esc(provisionalId)}</strong></p>
      <form class="lab-form">
        <label>Provisoriskt ID<input value="${esc(provisionalId)}" disabled></label>
        <label>Grodddatum (om känt)<input name="germinated_date" type="date" max="${today()}"></label>
        <label class="wide">Anteckning<textarea name="notes" rows="3" placeholder="Frivilligt"></textarea></label>
        <div class="dialog-actions"><button type="button" class="secondary-action" data-dialog-close>Avbryt</button><button type="submit" class="primary-action">Individualisera planta</button></div>
      </form>`, async data => {
      const germinatedDate = isoDate(data.get("germinated_date"));
      const createdAt = new Date().toISOString();
      const seedlingId = uniqueId("LAB");
      const row = {
        seedling_id: seedlingId,
        sow_batch_id: batch.id,
        batch_code: batch.shortCode,
        individual_number: String(nextNumber),
        provisional_id: provisionalId,
        origin_code: `${batch.fullCode}-${String(nextNumber).padStart(2, "0")}`,
        species_group: batch.species,
        taxon: batch.name,
        status: "Under uppdragning",
        germinated_date: germinatedDate,
        notes: clean(data.get("notes")),
        created_at: createdAt,
        collection_category: "",
        collection_id: ""
      };
      queueLabChange("seedling", row);
      if (germinatedDate) queueLabChange("milestone", {
          milestone_id: uniqueId("LABM"),
          seedling_id: seedlingId,
          date: germinatedDate,
          type: "Grodd",
          note: "Individuellt grodddatum registrerat.",
          created_at: createdAt
        });
      await refreshModel();
      updateRoute({planta: seedlingId, batch: null, vy: "uppdragning"});
    });
  }

  function openMilestoneRegistration(seedling) {
    const types = ["Grodd", "Planterad", "Omplanterad", "Beskuren", "Första knopp", "Första blomning", "Gallrad", "Död", "Bortskänkt"];
    showFormDialog(`<h2>Registrera milstolpe</h2>
      <p>${esc(seedling.shortId)} · milstolpen sparas på fröplantan i Labbet.</p>
      <form class="lab-form">
        <label>Typ<select name="type">${types.map(type => `<option>${esc(type)}</option>`).join("")}</select></label>
        <label>Datum<input name="date" type="date" value="${today()}" max="${today()}" required></label>
        <label class="wide">Anteckning<textarea name="note" rows="3" placeholder="Frivilligt"></textarea></label>
        <div class="dialog-actions"><button type="button" class="secondary-action" data-dialog-close>Avbryt</button><button type="submit" class="primary-action">Spara milstolpe</button></div>
      </form>`, async data => {
      const type = clean(data.get("type"));
      const date = isoDate(data.get("date"));
      queueLabChange("milestone", {
        milestone_id: uniqueId("LABM"),
        seedling_id: seedling.id,
        date,
        type,
        note: clean(data.get("note")),
        created_at: new Date().toISOString()
      });
      await refreshModel();
      updateRoute({planta: seedling.id, batch: null});
    });
  }

  function openSeedlingEdit(seedling) {
    const statuses = ["Under uppdragning", "Redo för bedömning", "Gallrad", "Död", "Bortskänkt"];
    showFormDialog(`<h2>Redigera fröplanta</h2>
      <p>${esc(seedling.shortId)} · ändringen påverkar inte den permanenta samlingen.</p>
      <form class="lab-form">
        <label>Status<select name="status">${statuses.map(status => `<option${status === seedling.status ? " selected" : ""}>${esc(status)}</option>`).join("")}</select></label>
        <label>Grodddatum<input name="germinated_date" type="date" value="${esc(seedling.germinatedDate)}" max="${today()}"></label>
        <label class="wide">Anteckningar<textarea name="notes" rows="5">${esc(seedling.notes)}</textarea></label>
        <div class="dialog-actions"><button type="button" class="secondary-action" data-dialog-close>Avbryt</button><button type="submit" class="primary-action">Spara</button></div>
      </form>`, async data => {
      queueLabChange("update", {
        seedling_id: seedling.id,
        status: clean(data.get("status")),
        germinated_date: isoDate(data.get("germinated_date")),
        notes: clean(data.get("notes")),
        updated_at: new Date().toISOString()
      });
      await refreshModel();
      updateRoute({planta: seedling.id, batch: null});
    });
  }

  speciesFilters.addEventListener("click", event => {
    const button = event.target.closest("[data-species]");
    if (!button) return;
    seedBoxExpanded = false;
    updateRoute({art: button.dataset.species, batch: null, planta: null, korsning: null, material: null});
  });

  labPortal.addEventListener("click", event => {
    const button = event.target.closest("[data-lab-view]");
    if (!button) return;
    seedBoxExpanded = false;
    const view = button.dataset.labView;
    updateRoute({
      vy: view,
      del: view === "sadder" ? "batcher" : null,
      status: view === "uppdragning" ? (button.dataset.portalStatus || "Alla") : null,
      batch: null,
      planta: null,
      korsning: null,
      material: null
    });
  });

  newLabItem.addEventListener("click", openNewMenu);

  content.addEventListener("click", event => {
    const batch = event.target.closest("[data-open-batch]");
    const seedling = event.target.closest("[data-open-seedling]");
    const crossing = event.target.closest("[data-open-crossing]");
    const material = event.target.closest("[data-open-material]");
    const group = event.target.closest("[data-open-group]");
    const seedBoxToggle = event.target.closest("[data-seed-box-toggle]");
    const back = event.target.closest("[data-close-detail]");
    const newCrossing = event.target.closest("[data-new-crossing]");
    const registerHarvest = event.target.closest("[data-register-harvest]");
    const sowMaterial = event.target.closest("[data-sow-material]");
    const editMaterialTaxon = event.target.closest("[data-edit-material-taxon]");
    const adjustMaterial = event.target.closest("[data-adjust-material]");
    const editBatch = event.target.closest("[data-edit-batch]");
    const registerSeedling = event.target.closest("[data-register-seedling]");
    const addMilestone = event.target.closest("[data-add-seedling-milestone]");
    const editSeedling = event.target.closest("[data-edit-seedling]");
    const galleryPhoto = event.target.closest("[data-gallery-photo]");
    const materialImageAction = event.target.closest("[data-material-image-action]");
    if (batch) updateRoute({vy: "sadder", del: "batcher", batch: batch.dataset.openBatch, planta: null, korsning: null, material: null});
    else if (seedling) updateRoute({vy: "uppdragning", planta: seedling.dataset.openSeedling, batch: null, korsning: null, material: null});
    else if (crossing) updateRoute({vy: "korsningar", korsning: crossing.dataset.openCrossing, batch: null, planta: null, material: null});
    else if (material) updateRoute({vy: material.classList.contains("seed-box-card") ? "froer" : "sadder", del: "material", material: material.dataset.openMaterial, batch: null, planta: null, korsning: null});
    else if (group) updateRoute({vy: "uppdragning", art: group.dataset.openGroup, status: "Alla", batch: null, planta: null});
    else if (seedBoxToggle) {
      seedBoxExpanded = !seedBoxExpanded;
      render();
    }
    else if (back) updateRoute({batch: null, planta: null, korsning: null, material: null});
    else if (newCrossing) openCrossingRegistration();
    else if (registerHarvest) {
      const selectedCrossing = model.crossingById.get(registerHarvest.dataset.registerHarvest);
      if (selectedCrossing?.adapter === false) openSeedHarvestRegistration(selectedCrossing);
    }
    else if (sowMaterial) {
      const selectedMaterial = model.materialById.get(sowMaterial.dataset.sowMaterial);
      if (selectedMaterial) openSowBatchRegistration(selectedMaterial);
    }
    else if (editMaterialTaxon) {
      const selectedMaterial = model.materialById.get(editMaterialTaxon.dataset.editMaterialTaxon);
      if (selectedMaterial?.type === "seed_lot") openMaterialTaxonEdit(selectedMaterial);
    }
    else if (adjustMaterial) {
      const selectedMaterial = model.materialById.get(adjustMaterial.dataset.adjustMaterial);
      if (selectedMaterial) openMaterialAdjustment(selectedMaterial);
    }
    else if (editBatch) {
      const selectedBatch = model.batchById.get(editBatch.dataset.editBatch);
      if (selectedBatch?.adapter === false) openBatchUpdate(selectedBatch);
    }
    else if (registerSeedling) {
      const selectedBatch = model.batchById.get(registerSeedling.dataset.registerSeedling);
      if (selectedBatch?.adapter === false) openSeedlingRegistration(selectedBatch);
    }
    else if (addMilestone) {
      const selectedSeedling = model.seedlingById.get(addMilestone.dataset.addSeedlingMilestone);
      if (selectedSeedling?.adapter === false) openMilestoneRegistration(selectedSeedling);
    }
    else if (editSeedling) {
      const selectedSeedling = model.seedlingById.get(editSeedling.dataset.editSeedling);
      if (selectedSeedling?.adapter === false) openSeedlingEdit(selectedSeedling);
    }
    else if (materialImageAction) {
      const selectedMaterial = model.materialById.get(materialImageAction.dataset.materialId);
      if (!selectedMaterial || selectedMaterial.type !== "seed_lot") return;
      const action = materialImageAction.dataset.materialImageAction;
      if (action === "menu") {
        const menu = materialImageAction.closest("[data-material-reference-shell]")?.querySelector("[data-material-image-menu]");
        if (menu) menu.hidden = !menu.hidden;
      } else if (action === "add" || action === "replace") {
        if (typeof window.openLabMaterialReferenceImport === "function") {
          window.openLabMaterialReferenceImport({id: selectedMaterial.id, name: selectedMaterial.taxon});
        }
      } else if (action === "remove") {
        if (selectedMaterial.referenceImageInherited) return;
        if (selectedMaterial.referenceImageUsageCount > 1
          && !window.confirm(`Referensbilden visas för ${selectedMaterial.referenceImageUsageCount} fröpartier med samma taxon. Ta bort taxonbilden från ${selectedMaterial.code || selectedMaterial.taxon}?`)) return;
        const clearPending = typeof getImageImportItems === "function" && typeof deleteImageImportItem === "function"
          ? getImageImportItems().then(items => Promise.all(items
            .filter(item => clean(item.category) === "Labbet" && clean(item.type) === "referens" && clean(item.plantId) === selectedMaterial.id)
            .map(item => deleteImageImportItem(item.id))))
          : Promise.resolve();
        clearPending.then(() => {
          queueLabChange("material_update", {
            source_type: selectedMaterial.type,
            source_id: selectedMaterial.id,
            reference_image: "",
            updated_at: new Date().toISOString()
          });
          return refreshModel();
        }).then(() => updateRoute({material: selectedMaterial.id}));
      }
    }
    else if (galleryPhoto) {
      const image = document.querySelector("#seedlingMainPhoto");
      if (!image) return;
      image.src = galleryPhoto.dataset.galleryPhoto;
      image.alt = galleryPhoto.dataset.galleryAlt || "Fröplanta";
      content.querySelectorAll("[data-gallery-photo]").forEach(button => button.classList.toggle("active", button === galleryPhoto));
    }
  });

  infoDialog.addEventListener("click", event => {
    if (event.target.closest("[data-dialog-close]") || event.target === infoDialog) closeInfoDialog();
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

  async function refreshModel() {
    pendingImageUrls.forEach(url => URL.revokeObjectURL(url));
    pendingImageUrls = [];
    pendingLabImages = [];
    pendingLabMaterialImages = [];
    if (typeof getImageImportItems === "function" && typeof imageImportBlob === "function") {
      const queued = await getImageImportItems().catch(() => []);
      const localImage = item => {
        const file = URL.createObjectURL(imageImportBlob(item));
        pendingImageUrls.push(file);
        return {
          photo_id: clean(item.id),
          seedling_id: clean(item.plantId),
          materialId: clean(item.plantId),
          date: clean(item.date),
          type: clean(item.type),
          file,
          label: clean(item.note) || `${clean(item.date)} · ${clean(item.type)}`,
          created_at: clean(item.createdAt),
          local: true
        };
      };
      pendingLabImages = queued.filter(item => clean(item.category) === "Labbet" && clean(item.type) !== "referens").map(localImage);
      pendingLabMaterialImages = queued.filter(item => clean(item.category) === "Labbet" && clean(item.type) === "referens").map(localImage);
    }
    model = buildModel();
    render();
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
      if (typeof ensurePlantImageImport === "function") ensurePlantImageImport();
      await refreshModel();
      if ("serviceWorker" in navigator && window.isSecureContext) {
        navigator.serviceWorker.register("service-worker.js?v=20").catch(() => {});
      }
    } catch (error) {
      console.error("Labbet kunde inte starta.", error);
      content.innerHTML = '<div class="error-state"><strong>Labbet kunde inte laddas.</strong>Uppdatera sidan och kontrollera anslutningen.</div>';
    }
  })();

  let refreshTimer = 0;
  const scheduleRefresh = () => {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => { refreshModel().catch(console.error); }, 20);
  };
  window.addEventListener("lab-data-changed", scheduleRefresh);
  window.addEventListener("image-import-added", scheduleRefresh);
  window.addEventListener("plant-milestone-added", scheduleRefresh);
  window.addEventListener("beforeunload", () => pendingImageUrls.forEach(url => URL.revokeObjectURL(url)));
})();
