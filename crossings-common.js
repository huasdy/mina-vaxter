(function (root) {
  "use strict";

  function text(value) {
    return typeof root.clean === "function" ? root.clean(value) : String(value || "").trim();
  }

  function naturalCompare(first, second) {
    return typeof root.sortNatural === "function"
      ? root.sortNatural(first, second)
      : String(first || "").localeCompare(String(second || ""), "sv", {numeric:true, sensitivity:"base"});
  }

  function count(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function validIsoDate(value) {
    const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return parsed.getUTCFullYear() === Number(match[1])
      && parsed.getUTCMonth() === Number(match[2]) - 1
      && parsed.getUTCDate() === Number(match[3]);
  }

  function createModel(snapshot) {
    const source = snapshot?.crossings || {};
    const crossings = Array.isArray(source.items) ? source.items : [];
    const events = Array.isArray(source.events) ? source.events : [];
    const seedLots = Array.isArray(source.seedLots) ? source.seedLots : [];
    const sowBatches = Array.isArray(source.sowBatches) ? source.sowBatches : [];
    const categories = snapshot?.categories || {};
    const plantsByCategory = new Map(Object.entries(categories).map(([category, section]) => [
      category,
      new Map((Array.isArray(section?.plants) ? section.plants : []).map(plant => [plant.id, plant]))
    ]));
    const crossingsById = new Map(crossings.map(crossing => [crossing.crossing_id, crossing]));
    const seedLotsById = new Map(seedLots.map(seedLot => [seedLot.seed_lot_id, seedLot]));
    const sowBatchesById = new Map(sowBatches.map(batch => [batch.sow_batch_id, batch]));

    function plant(category, id) {
      return plantsByCategory.get(category)?.get(id) || null;
    }

    function visiblePlantId(category, row, fallbackId = "") {
      if (category === "Pelargon") return text(row?.label_number) || text(row?.id) || text(fallbackId) || "—";
      return text(row?.id) || text(fallbackId) || "—";
    }

    function parentDisplay(category, id) {
      const row = plant(category, id);
      if (!row) return {id:text(id), plant:null, primary:text(id) || "Okänd", secondary:"", visibleId:text(id) || "—"};
      const nickname = text(row.nickname);
      const individual = category === "Pelargon" && text(row.record_kind).toUpperCase() === "INDIVIDUAL";
      if (individual && nickname) {
        const collection = plant(category, row.collection_id);
        return {
          id:text(row.id), plant:row, primary:nickname,
          secondary:text(collection?.name) || text(row.name).replace(/\s+\d+$/, ""),
          visibleId:visiblePlantId(category, row, id)
        };
      }
      const primary = category === "Hibiskus"
        ? (nickname ? `${text(row.id) || text(id)} · ${nickname}` : text(row.id) || text(id))
        : text(row.name) || text(row.id) || text(id);
      return {id:text(row.id) || text(id), plant:row, primary:primary || "Okänd", secondary:"", visibleId:visiblePlantId(category, row, id)};
    }

    function seedLotsForCrossing(crossingId) {
      return seedLots.filter(seedLot => seedLot.crossing_id === crossingId)
        .sort((first, second) => naturalCompare(first.seed_lot_code, second.seed_lot_code));
    }

    function batchesForSeedLot(seedLotId) {
      return sowBatches.filter(batch => batch.seed_lot_id === seedLotId)
        .sort((first, second) => naturalCompare(first.sow_code, second.sow_code));
    }

    function sowBatchCode(batchOrId) {
      const batch = typeof batchOrId === "string" ? sowBatchesById.get(batchOrId) : batchOrId;
      const seedLot = batch ? seedLotsById.get(batch.seed_lot_id) : null;
      return [text(seedLot?.seed_lot_code), text(batch?.sow_code)].filter(Boolean).join("-");
    }

    function batchesForCrossing(crossingId) {
      const lotIds = new Set(seedLotsForCrossing(crossingId).map(seedLot => seedLot.seed_lot_id));
      return sowBatches.filter(batch => lotIds.has(batch.seed_lot_id))
        .sort((first, second) => naturalCompare(sowBatchCode(first), sowBatchCode(second)));
    }

    function eventsForCrossing(crossingId) {
      return events.filter(event => event.crossing_id === crossingId)
        .sort((first, second) => String(second.date || "").localeCompare(String(first.date || ""))
          || String(second.created_at || "").localeCompare(String(first.created_at || ""))
          || String(second.event_id || "").localeCompare(String(first.event_id || "")));
    }

    function firstSownDate(crossingOrId) {
      const crossing = typeof crossingOrId === "string" ? crossingsById.get(crossingOrId) : crossingOrId;
      if (!crossing) return "";
      return eventsForCrossing(crossing.crossing_id)
        .filter(event => event.type === "Sådd" && validIsoDate(event.date))
        .map(event => text(event.date))
        .sort()[0] || "";
    }

    function hibiscusOffspringDraft(crossingOrId, germinatedDate, note = "") {
      const crossing = typeof crossingOrId === "string" ? crossingsById.get(crossingOrId) : crossingOrId;
      const sownDate = crossing?.category === "Hibiskus" ? firstSownDate(crossing) : "";
      const date = text(germinatedDate);
      if (!crossing || crossing.category !== "Hibiskus") {
        return {ok:false, firstSownDate:sownDate, error:"Hibiskuskorsningen kunde inte hittas."};
      }
      if (!sownDate) {
        return {ok:false, firstSownDate:"", error:"Registrera en Sådd-händelse innan du registrerar en grodd planta."};
      }
      if (!validIsoDate(date)) {
        return {ok:false, firstSownDate:sownDate, error:"Ange ett giltigt datum för grodd."};
      }
      if (date < sownDate) {
        return {ok:false, firstSownDate:sownDate, error:`Groddatum får inte vara före den första sådden ${sownDate}.`};
      }
      return {
        ok:true,
        firstSownDate:sownDate,
        error:"",
        payload:{crossing_id:crossing.crossing_id, date, note:text(note)}
      };
    }

    function eventsForSeedLot(seedLotOrId) {
      const seedLot = typeof seedLotOrId === "string" ? seedLotsById.get(seedLotOrId) : seedLotOrId;
      if (!seedLot) return [];
      const lots = seedLotsForCrossing(seedLot.crossing_id);
      const index = lots.findIndex(item => item.seed_lot_id === seedLot.seed_lot_id);
      const nextLot = index >= 0 ? lots[index + 1] : null;
      return eventsForCrossing(seedLot.crossing_id).filter(event => {
        if (seedLot.pollinated_date && String(event.date || "") < String(seedLot.pollinated_date)) return false;
        if (nextLot?.pollinated_date && String(event.date || "") >= String(nextLot.pollinated_date)) return false;
        return true;
      }).sort((first, second) => String(first.date || "").localeCompare(String(second.date || ""))
        || String(first.created_at || "").localeCompare(String(second.created_at || ""))
        || String(first.event_id || "").localeCompare(String(second.event_id || "")));
    }

    function offspringForBatch(batchId) {
      return [...(plantsByCategory.get("Pelargon")?.values() || [])].filter(row => row.sow_batch_id === batchId);
    }

    function offspringForCrossing(crossingOrId) {
      const crossing = typeof crossingOrId === "string" ? crossingsById.get(crossingOrId) : crossingOrId;
      if (!crossing) return [];
      const batchIds = new Set(batchesForCrossing(crossing.crossing_id).map(batch => batch.sow_batch_id));
      return [...(plantsByCategory.get(crossing.category)?.values() || [])]
        .filter(row => row.crossing_id === crossing.crossing_id || batchIds.has(row.sow_batch_id));
    }

    function lineageCode(row) {
      const batch = sowBatchesById.get(row?.sow_batch_id);
      const individualNumber = count(row?.batch_individual_number);
      return batch && individualNumber
        ? `${sowBatchCode(batch)}-${String(individualNumber).padStart(2, "0")}`
        : text(row?.seedling_label);
    }

    function offspringDisplay(row, category = "Pelargon") {
      const visibleId = visiblePlantId(category, row, row?.id);
      const lineage = category === "Pelargon" ? lineageCode(row) : "";
      if (category !== "Pelargon") {
        const title = text(row?.id) || text(row?.name) || "Okänd";
        return {plant:row, title, speciesName:text(row?.name), visibleId, lineageCode:lineage, subline:""};
      }
      const genericSeedling = text(row?.name) === "Pelargonfröplanta";
      const chosenName = text(row?.nickname) || (genericSeedling ? "" : text(row?.name));
      const catalogIdentity = genericSeedling ? visibleId : text(row?.name) || text(row?.id);
      const catalogTitle = catalogIdentity || text(row?.nickname);
      const catalogLabel = text(row?.nickname) && catalogIdentity ? `${catalogIdentity} · ${text(row.nickname)}` : catalogIdentity || text(row?.nickname);
      const title = chosenName || visibleId || text(row?.id);
      const subline = [visibleId !== title ? visibleId : "", lineage].filter(Boolean).join(" · ");
      const collection = plant("Pelargon", row?.collection_id);
      const speciesName = text(collection?.name) || (genericSeedling ? "" : text(row?.name));
      return {plant:row, title, speciesName, visibleId, lineageCode:lineage, subline, catalogIdentity, catalogTitle, catalogLabel};
    }

    function displayStatus(crossingOrId) {
      const crossing = typeof crossingOrId === "string" ? crossingsById.get(crossingOrId) : crossingOrId;
      return crossing && batchesForCrossing(crossing.crossing_id).length ? "Sådd" : text(crossing?.status);
    }

    function batchView(batchOrId) {
      const batch = typeof batchOrId === "string" ? sowBatchesById.get(batchOrId) : batchOrId;
      if (!batch) return null;
      const seedLot = seedLotsById.get(batch.seed_lot_id) || null;
      const offspring = offspringForBatch(batch.sow_batch_id);
      return {
        batch, seedLot, code:sowBatchCode(batch), offspring,
        counts:{seedsSown:count(batch.seeds_sown), potCount:count(batch.pot_count), germinated:count(batch.germinated_count), offspring:offspring.length}
      };
    }

    function seedLotView(seedLotOrId) {
      const seedLot = typeof seedLotOrId === "string" ? seedLotsById.get(seedLotOrId) : seedLotOrId;
      if (!seedLot) return null;
      const seedLotEvents = eventsForSeedLot(seedLot);
      const batches = batchesForSeedLot(seedLot.seed_lot_id).map(batchView);
      const harvested = seedLotEvents.find(event => event.type === "Frö skördat");
      const harvestedCount = count(text(harvested?.note).match(/\d+/)?.[0]);
      const seedsSown = batches.reduce((sum, item) => sum + item.counts.seedsSown, 0);
      return {
        seedLot, events:seedLotEvents, batches, harvestedCount,
        counts:{
          seedsSown,
          remaining:Math.max(0, harvestedCount - seedsSown),
          germinated:batches.reduce((sum, item) => sum + item.counts.germinated, 0),
          offspring:batches.reduce((sum, item) => sum + item.counts.offspring, 0)
        }
      };
    }

    function canCreateSowBatch(seedLotOrId) {
      return (seedLotView(seedLotOrId)?.counts.remaining || 0) > 0;
    }

    function crossingView(crossingOrId) {
      const crossing = typeof crossingOrId === "string" ? crossingsById.get(crossingOrId) : crossingOrId;
      if (!crossing) return null;
      const crossingEvents = eventsForCrossing(crossing.crossing_id);
      const lots = seedLotsForCrossing(crossing.crossing_id).map(seedLotView);
      const batches = batchesForCrossing(crossing.crossing_id).map(batchView);
      const offspring = offspringForCrossing(crossing);
      const mother = parentDisplay(crossing.category, crossing.mother_id);
      const father = parentDisplay(crossing.category, crossing.father_id);
      return {
        crossing, events:crossingEvents, seedLots:lots, batches, offspring, mother, father,
        parentName:`${mother.primary} × ${father.primary}`,
        firstSownDate:firstSownDate(crossing),
        displayStatus:displayStatus(crossing),
        sortKey:{status:displayStatus(crossing), latestDate:crossingEvents[0]?.date || "", createdAt:text(crossing.created_at), crossingId:text(crossing.crossing_id)},
        counts:{
          seedsSown:batches.reduce((sum, item) => sum + item.counts.seedsSown, 0),
          germinated:batches.reduce((sum, item) => sum + item.counts.germinated, 0),
          offspring:offspring.length
        }
      };
    }

    function overviewRows() {
      const rows = crossings.map(crossingView);
      if (typeof root.sortCrossingOverviewRows !== "function") throw new Error("sortCrossingOverviewRows saknas i common.js");
      return root.sortCrossingOverviewRows(rows.map(view => ({
        ...view,
        crossing_id:view.crossing.crossing_id,
        created_at:view.crossing.created_at,
        latestDate:view.sortKey.latestDate
      })));
    }

    function plantCrossingView(row) {
      const batch = sowBatchesById.get(row?.sow_batch_id) || null;
      const seedLot = batch ? seedLotsById.get(batch.seed_lot_id) || null : null;
      const crossing = seedLot
        ? crossingsById.get(seedLot.crossing_id) || null
        : crossingsById.get(row?.crossing_id) || null;
      if (!crossing) return null;
      const batchData = batchView(batch);
      const lotData = seedLotView(seedLot);
      const mother = parentDisplay(crossing.category, crossing.mother_id);
      const father = parentDisplay(crossing.category, crossing.father_id);
      return {
        plant:row, crossing, seedLot, seedLotView:lotData, batch, batchView:batchData,
        mother, father, parentName:`${mother.primary} × ${father.primary}`,
        events:lotData?.events || eventsForCrossing(crossing.crossing_id),
        displayStatus:displayStatus(crossing),
        batchCode:batchData?.code || "",
        offspringCode:lineageCode(row),
        offspringDisplay:offspringDisplay(row, crossing.category),
        counts:batchData?.counts || {seedsSown:0, potCount:0, germinated:0, offspring:offspringForCrossing(crossing).length}
      };
    }

    function nextSeedLotCode(crossingId, date = new Date()) {
      const year = String(date.getFullYear()).slice(-2);
      const letters = seedLotsForCrossing(crossingId)
        .map(seedLot => text(seedLot.seed_lot_code).match(new RegExp(`^${year}([A-Z])$`)))
        .filter(Boolean)
        .map(match => match[1].charCodeAt(0));
      return `${year}${String.fromCharCode(Math.max(64, ...letters) + 1)}`;
    }

    function nextSowCode(seedLotId) {
      const numbers = batchesForSeedLot(seedLotId)
        .map(batch => Number((text(batch.sow_code).match(/^B(\d{2})$/) || [])[1] || 0));
      return `B${String(Math.max(0, ...numbers) + 1).padStart(2, "0")}`;
    }

    return Object.freeze({
      crossings, events, seedLots, sowBatches,
      crossingById:id => crossingsById.get(id) || null,
      seedLotById:id => seedLotsById.get(id) || null,
      sowBatchById:id => sowBatchesById.get(id) || null,
      parentDisplay, seedLotsForCrossing, batchesForSeedLot, batchesForCrossing,
      eventsForCrossing, eventsForSeedLot, firstSownDate, hibiscusOffspringDraft,
      offspringForBatch, offspringForCrossing,
      sowBatchCode, lineageCode, offspringDisplay, displayStatus,
      batchView, seedLotView, canCreateSowBatch, crossingView, overviewRows, plantCrossingView,
      nextSeedLotCode, nextSowCode
    });
  }

  const api = Object.freeze({createModel});
  root.CrossingsCommon = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window === "object" ? window : globalThis);
