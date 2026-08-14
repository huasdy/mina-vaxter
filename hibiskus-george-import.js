(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.HibiscusGeorgeImport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STANDARD_VERSION = "HIB-FLOWER-V1";
  const SLOT_ORDER = [
    "FORM", "PRIMARY_COLOR", "SECONDARY_COLOR", "COLOR_TEMPERATURE",
    "COLOR_CLARITY", "COLOR_PATTERN", "EYE_SIZE", "EYE_COLOR",
    "COLOR_TRANSITION", "PETAL_EDGE"
  ];
  const SLOT_RULES = {
    FORM: {domain: "FORM", multiple: false},
    PRIMARY_COLOR: {domain: "COLOR", multiple: false},
    SECONDARY_COLOR: {domain: "COLOR", multiple: true, none: true},
    COLOR_TEMPERATURE: {domain: "TEMPERATURE", multiple: false},
    COLOR_CLARITY: {domain: "CLARITY", multiple: false},
    COLOR_PATTERN: {domain: "PATTERN", multiple: true},
    EYE_SIZE: {domain: "EYE_SIZE", multiple: false},
    EYE_COLOR: {domain: "COLOR", multiple: false},
    COLOR_TRANSITION: {domain: "TRANSITION", multiple: false},
    PETAL_EDGE: {domain: "PETAL_EDGE", multiple: false}
  };
  const LAYERS = new Set(["OBSERVED", "CAN_CONTRIBUTE", "WATCH"]);
  const VALUE_STATUSES = new Set(["RECORDED", "NONE", "UNASSESSABLE", "NOT_APPLICABLE"]);

  class GeorgeImportError extends Error {
    constructor(messages) {
      const list = Array.isArray(messages) ? messages : [messages];
      super(list.join("\n"));
      this.name = "GeorgeImportError";
      this.messages = list;
    }
  }

  function parseCandidate(value) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function isPayloadLike(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value) && (
      Array.isArray(value.items) ||
      (value.item && typeof value.item === "object") ||
      (value.assessment && Array.isArray(value.assignments))
    ));
  }

  function balancedObjects(text) {
    const results = [];
    for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let index = start; index < text.length; index += 1) {
        const character = text[index];
        if (inString) {
          if (escaped) escaped = false;
          else if (character === "\\") escaped = true;
          else if (character === '"') inString = false;
          continue;
        }
        if (character === '"') inString = true;
        else if (character === "{") depth += 1;
        else if (character === "}") {
          depth -= 1;
          if (depth === 0) {
            results.push(text.slice(start, index + 1));
            break;
          }
        }
      }
    }
    return results;
  }

  function extractJson(text) {
    const source = String(text || "").trim();
    if (!source) throw new GeorgeImportError("Klistra in hela svaret från George först.");
    const direct = parseCandidate(source);
    if (isPayloadLike(direct)) return direct;

    const fenced = [];
    const fencePattern = /```(?:json)?\s*([\s\S]*?)```/gi;
    for (const match of source.matchAll(fencePattern)) fenced.push(match[1].trim());
    for (const candidate of [...fenced, ...balancedObjects(source)]) {
      const parsed = parseCandidate(candidate);
      if (isPayloadLike(parsed)) return parsed;
    }
    throw new GeorgeImportError(
      "Georges JSON är ofullständig eller ogiltig. Be George skicka om hela JSON-delen innan du försöker igen."
    );
  }

  function validIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function normalizedItem(payload) {
    if (Array.isArray(payload.items)) {
      if (payload.items.length !== 1) throw new GeorgeImportError("Svaret måste innehålla exakt en blombedömning.");
      return payload.items[0];
    }
    if (payload.item && typeof payload.item === "object") return payload.item;
    if (payload.assessment && Array.isArray(payload.assignments)) return payload;
    throw new GeorgeImportError("JSON-svaret saknar items med en blombedömning.");
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function validateAndNormalize(payload, options = {}) {
    const errors = [];
    const warnings = [];
    const item = normalizedItem(payload);
    const assessment = item.assessment && typeof item.assessment === "object" ? item.assessment : {};
    const assignments = asArray(item.assignments);
    const review = payload.review && typeof payload.review === "object" ? payload.review : {};
    const candidateProposals = asArray(review.candidate_proposals);
    const unresolvedSlots = new Set(asArray(review.unresolved_slots).map(value => String(value || "")));
    const traits = new Map(asArray(options.traits).map(row => [row.trait_id, row]));
    const photoIds = new Set(asArray(options.photoIds));
    const topVersion = String(payload.standardVersion || payload.standard_version || "");
    const assessmentVersion = String(assessment.standard_version || "");

    if (topVersion && topVersion !== STANDARD_VERSION) errors.push(`Fel standardVersion: ${topVersion}.`);
    if (assessmentVersion !== STANDARD_VERSION) errors.push(`Bedömningen måste använda ${STANDARD_VERSION}.`);
    if (asArray(payload.traits).length || asArray(item.candidates).length) errors.push("George får inte skapa kandidategenskaper med egna ID:n.");
    if (asArray(item.markers).length) errors.push("George får inte skapa förädlingsmarkörer.");

    const incomingPlant = String(assessment.plant_id || "");
    if (incomingPlant && options.plantId && incomingPlant !== options.plantId) {
      errors.push(`Svaret gäller ${incomingPlant}, men formuläret gäller ${options.plantId}.`);
    }
    const incomingDate = String(assessment.observed_date || "");
    if (incomingDate && !validIsoDate(incomingDate)) errors.push(`Ogiltigt datum: ${incomingDate}.`);

    const incomingAssessmentId = String(assessment.assessment_id || "");
    const observedBySlot = new Map(SLOT_ORDER.map(slot => [slot, []]));
    const observedKeys = new Set();
    const canKeys = new Set();
    const watchKeys = new Set();
    const duplicateRows = new Set();

    assignments.forEach((raw, index) => {
      const layer = String(raw?.layer || "");
      const slot = String(raw?.slot || "");
      const traitId = String(raw?.trait_id || "");
      const valueStatus = String(raw?.value_status || "");
      const assignmentId = String(raw?.assessment_id || "");
      const rule = SLOT_RULES[slot];
      const prefix = `Rad ${index + 1}`;
      if (!LAYERS.has(layer)) errors.push(`${prefix}: okänt lager ${layer || "(tomt)"}.`);
      if (!rule) errors.push(`${prefix}: okänd slot ${slot || "(tomt)"}.`);
      if (!VALUE_STATUSES.has(valueStatus)) errors.push(`${prefix}: okänd värdestatus ${valueStatus || "(tomt)"}.`);
      if (incomingAssessmentId && assignmentId && assignmentId !== incomingAssessmentId) {
        errors.push(`${prefix}: assessment_id stämmer inte med bedömningen.`);
      }
      if (!rule || !LAYERS.has(layer) || !VALUE_STATUSES.has(valueStatus)) return;

      const signature = `${layer}|${slot}|${traitId}|${valueStatus}`;
      if (duplicateRows.has(signature)) errors.push(`${prefix}: duplicerad egenskapsrad.`);
      duplicateRows.add(signature);

      if (valueStatus === "RECORDED") {
        const trait = traits.get(traitId);
        if (!traitId || !trait || trait.status !== "ACTIVE") {
          errors.push(`${prefix}: ${traitId || "tomt trait-ID"} finns inte som aktiv egenskap.`);
          return;
        }
        if (trait.domain !== rule.domain) {
          errors.push(`${prefix}: ${traitId} hör inte hemma i ${slot}.`);
          return;
        }
      } else if (traitId) {
        errors.push(`${prefix}: ${valueStatus} ska ha tomt trait_id.`);
      }

      if (layer !== "OBSERVED" && valueStatus !== "RECORDED") {
        errors.push(`${prefix}: ${layer} får endast innehålla RECORDED.`);
      }
      if (layer === "OBSERVED") {
        observedBySlot.get(slot).push({slot, trait_id: traitId, value_status: valueStatus});
        if (valueStatus === "RECORDED") observedKeys.add(`${slot}|${traitId}`);
      } else if (valueStatus === "RECORDED") {
        const key = `${slot}|${traitId}`;
        if (layer === "CAN_CONTRIBUTE") canKeys.add(key);
        else watchKeys.add(key);
      }
    });

    candidateProposals.forEach((proposal, index) => {
      const slot = String(proposal?.slot || "");
      const domain = String(proposal?.domain || "");
      const label = String(proposal?.proposed_label || "").trim();
      if (!SLOT_RULES[slot]) errors.push(`Kandidat ${index + 1}: okänd slot ${slot || "(tomt)"}.`);
      else if (SLOT_RULES[slot].domain !== domain) errors.push(`Kandidat ${index + 1}: domänen passar inte sloten.`);
      if (!label) errors.push(`Kandidat ${index + 1}: föreslagen etikett saknas.`);
      unresolvedSlots.add(slot);
    });

    for (const slot of unresolvedSlots) {
      if (!SLOT_RULES[slot]) errors.push(`review.unresolved_slots innehåller okänd slot ${slot || "(tomt)"}.`);
    }

    SLOT_ORDER.forEach(slot => {
      const rows = observedBySlot.get(slot);
      const rule = SLOT_RULES[slot];
      if (!rows.length) {
        if (!unresolvedSlots.has(slot)) errors.push(`OBSERVED saknar ${slot}.`);
        return;
      }
      const recorded = rows.filter(row => row.value_status === "RECORDED");
      const statuses = rows.filter(row => row.value_status !== "RECORDED");
      if (!rule.multiple && rows.length !== 1) errors.push(`${slot} måste ha exakt en observerad rad.`);
      if (rule.multiple && statuses.length && (statuses.length !== 1 || recorded.length)) {
        errors.push(`${slot} får inte blanda registrerade traits med en värdestatus.`);
      }
      statuses.forEach(row => {
        if (row.value_status === "NONE" && slot !== "SECONDARY_COLOR") errors.push(`NONE får endast användas för SECONDARY_COLOR.`);
        if (row.value_status === "NOT_APPLICABLE" && slot !== "EYE_COLOR") errors.push(`NOT_APPLICABLE får endast användas för EYE_COLOR.`);
      });
      if (slot === "COLOR_PATTERN" && statuses.some(row => row.value_status === "NONE")) {
        errors.push("COLOR_PATTERN använder pattern.even, inte NONE.");
      }
    });

    const patterns = observedBySlot.get("COLOR_PATTERN").filter(row => row.value_status === "RECORDED").map(row => row.trait_id);
    if (patterns.includes("pattern.even") && patterns.length > 1) errors.push("pattern.even får inte kombineras med andra färgmönster.");
    const primary = observedBySlot.get("PRIMARY_COLOR").find(row => row.value_status === "RECORDED")?.trait_id;
    const secondary = observedBySlot.get("SECONDARY_COLOR").filter(row => row.value_status === "RECORDED").map(row => row.trait_id);
    if (primary && secondary.includes(primary)) errors.push("Huvudfärgen får inte upprepas som sekundär färg.");

    const eyeSize = observedBySlot.get("EYE_SIZE")[0];
    const eyeColor = observedBySlot.get("EYE_COLOR")[0];
    if (eyeSize?.value_status === "RECORDED" && eyeSize.trait_id === "eye.none") {
      if (!eyeColor || eyeColor.value_status !== "NOT_APPLICABLE") errors.push("När eye saknas måste EYE_COLOR vara NOT_APPLICABLE.");
    } else if (eyeColor?.value_status === "NOT_APPLICABLE") {
      errors.push("EYE_COLOR kan bara vara NOT_APPLICABLE när EYE_SIZE är eye.none.");
    }

    for (const key of [...canKeys, ...watchKeys]) {
      if (!observedKeys.has(key)) errors.push(`${key} är tolkat men inte observerat.`);
    }
    for (const key of canKeys) {
      if (watchKeys.has(key)) errors.push(`${key} ligger i både CAN_CONTRIBUTE och WATCH.`);
    }

    const incomingPhoto = String(assessment.photo_id || "");
    if (!incomingPhoto) warnings.push("George saknade photo_id. Kontrollera att rätt blomfoto är valt i appen.");
    else if (!photoIds.has(incomingPhoto)) warnings.push(`George angav ett photo_id som inte finns för plantan: ${incomingPhoto}.`);
    if (!incomingAssessmentId) warnings.push("George saknade assessment_id. Appens eget ID används.");
    if (!incomingPlant) warnings.push("George saknade plant_id. Formulärets växt-ID används.");
    if (!incomingDate) warnings.push("George saknade datum. Kontrollera formulärets datum.");
    if (candidateProposals.length) warnings.push(`${candidateProposals.length} kandidatförslag väntar på ditt beslut.`);
    asArray(review.metadata_issues).forEach(value => warnings.push(String(value || "").trim()));

    if (errors.length) throw new GeorgeImportError(errors);
    return {
      assessment: {
        observed_date: incomingDate,
        photo_id: incomingPhoto && photoIds.has(incomingPhoto) ? incomingPhoto : ""
      },
      observed: SLOT_ORDER.flatMap(slot => observedBySlot.get(slot)),
      canKeys,
      watchKeys,
      candidateProposals,
      unresolvedSlots: [...unresolvedSlots],
      warnings: warnings.filter(Boolean),
      slotCount: SLOT_ORDER.filter(slot => observedBySlot.get(slot).length).length
    };
  }

  function parseAndValidate(text, options = {}) {
    return validateAndNormalize(extractJson(text), options);
  }

  return {STANDARD_VERSION, SLOT_ORDER, SLOT_RULES, GeorgeImportError, extractJson, validateAndNormalize, parseAndValidate};
});
