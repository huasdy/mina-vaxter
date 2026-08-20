(function () {
  "use strict";

  const STANDARD_VERSION = "HIB-FLOWER-V1";
  const STORAGE_KEY = "mina-vaxter-hibiskus-blombedomningar-v1";
  const ACTIVE = "ACTIVE";
  const RECORDED = "RECORDED";
  const slots = [
    {slot: "FORM", domain: "FORM", label: "Blomform", multiple: false},
    {slot: "PRIMARY_COLOR", domain: "COLOR", label: "Huvudfärg", multiple: false},
    {slot: "SECONDARY_COLOR", domain: "COLOR", label: "Sekundära färger", multiple: true, none: true},
    {slot: "COLOR_TEMPERATURE", domain: "TEMPERATURE", label: "Färgtemperatur", multiple: false},
    {slot: "COLOR_CLARITY", domain: "CLARITY", label: "Färgklarhet", multiple: false},
    {slot: "COLOR_PATTERN", domain: "PATTERN", label: "Färgmönster / färgspridning", multiple: true},
    {slot: "EYE_SIZE", domain: "EYE_SIZE", label: "Eye – storlek", multiple: false},
    {slot: "EYE_COLOR", domain: "COLOR", label: "Eye – färg", multiple: false},
    {slot: "COLOR_TRANSITION", domain: "TRANSITION", label: "Övergång centrum–kronblad", multiple: false},
    {slot: "PETAL_EDGE", domain: "PETAL_EDGE", label: "Kronbladskant", multiple: false}
  ];
  const slotMap = new Map(slots.map(item => [item.slot, item]));
  const embedded = id => document.querySelector(`#${id}`)?.textContent || "";
  const publicSnapshot = window.publicCatalogSnapshot || {};
  const publicFlowerData = publicSnapshot.flowerAssessments || {};
  const publicHibiscusPhotos = publicSnapshot.categories?.Hibiskus?.photos;
  const baseAssessments = Array.isArray(publicFlowerData.assessments)
    ? publicFlowerData.assessments : parseCSV(embedded("defaultFlowerAssessmentsCSV"));
  const baseTraits = Array.isArray(publicFlowerData.traits)
    ? publicFlowerData.traits : parseCSV(embedded("defaultFlowerTraitsCSV"));
  const baseAssignments = Array.isArray(publicFlowerData.assignments)
    ? publicFlowerData.assignments : parseCSV(embedded("defaultFlowerAssignmentsCSV"));
  const baseMarkers = Array.isArray(publicFlowerData.breedingMarkers)
    ? publicFlowerData.breedingMarkers : parseCSV(embedded("defaultBreedingMarkersCSV"));
  const basePhotos = Array.isArray(publicHibiscusPhotos)
    ? publicHibiscusPhotos : parseCSV(embedded("defaultPhotosCSV"));

  function readQueue() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function writeQueue(items) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items || [])); } catch (error) {}
    if (typeof updatePlantImageImportUI === "function") updatePlantImageImportUI();
  }

  function randomId(prefix) {
    const value = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().replaceAll("-", "").slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    return `${prefix}-${value}`;
  }

  function combinedData() {
    const queue = readQueue();
    const assessmentMap = new Map(baseAssessments.map(row => [row.assessment_id, {...row}]));
    const traitMap = new Map(baseTraits.map(row => [row.trait_id, {...row}]));
    const queuedIds = new Set();
    queue.forEach(item => {
      const assessment = item.assessment || {};
      if (assessment.assessment_id) {
        queuedIds.add(assessment.assessment_id);
        assessmentMap.set(assessment.assessment_id, {...assessment});
      }
      (item.candidates || []).forEach(trait => {
        if (trait.trait_id) traitMap.set(trait.trait_id, {...trait});
      });
    });
    const assignments = [
      ...baseAssignments.filter(row => !queuedIds.has(row.assessment_id)),
      ...queue.flatMap(item => item.assignments || [])
    ];
    const markers = [
      ...baseMarkers.filter(row => !queuedIds.has(row.assessment_id)),
      ...queue.flatMap(item => item.markers || [])
    ];
    return {assessments: [...assessmentMap.values()], traits: [...traitMap.values()], assignments, markers};
  }

  function traitMapFor(data = combinedData()) {
    return new Map(data.traits.map(row => [row.trait_id, row]));
  }

  function traitsForDomain(domain, data = combinedData()) {
    return data.traits
      .filter(row => row.domain === domain && [ACTIVE, "CANDIDATE"].includes(row.status))
      .sort((a, b) => sortNatural(a.label, b.label));
  }

  function assignmentsFor(data, assessmentId, layer = "") {
    return data.assignments.filter(row => row.assessment_id === assessmentId && (!layer || row.layer === layer));
  }

  function groupedMarkers(data, assessmentId) {
    const groups = new Map();
    data.markers.filter(row => row.assessment_id === assessmentId).forEach(row => {
      if (!groups.has(row.marker_id)) groups.set(row.marker_id, []);
      groups.get(row.marker_id).push(row);
    });
    return [...groups.values()];
  }

  function markerSignature(rows) {
    return rows.map(row => `${row.slot}:${row.trait_id}`).sort().join("|");
  }

  function validMarkerGroups(data, assessment) {
    if (!assessment || assessment.status !== "COMPLETE") return [];
    const traits = traitMapFor(data);
    const observed = new Set(assignmentsFor(data, assessment.assessment_id, "OBSERVED")
      .filter(row => row.value_status === RECORDED).map(row => `${row.slot}|${row.trait_id}`));
    const can = new Set(assignmentsFor(data, assessment.assessment_id, "CAN_CONTRIBUTE")
      .filter(row => row.value_status === RECORDED).map(row => `${row.slot}|${row.trait_id}`));
    const watch = new Set(assignmentsFor(data, assessment.assessment_id, "WATCH")
      .filter(row => row.value_status === RECORDED).map(row => `${row.slot}|${row.trait_id}`));
    return groupedMarkers(data, assessment.assessment_id).filter(group => group.length && group.every(row => {
      const key = `${row.slot}|${row.trait_id}`;
      const trait = traits.get(row.trait_id);
      return observed.has(key) && can.has(key) && !watch.has(key) && trait && trait.status === ACTIVE;
    }));
  }

  function markerLabel(group, traits) {
    const stored = clean(group[0]?.label);
    if (stored) return stored;
    if (group.length === 1) return positiveLabel(group[0].slot, traits.get(group[0].trait_id));
    return group.map(row => traits.get(row.trait_id)?.label || row.trait_id).join(" + ");
  }

  function positiveLabel(slot, trait) {
    if (!trait) return "Förädlingsmarkör";
    const preferred = {
      "PRIMARY_COLOR|color.yellow": "Gul grundfärg",
      "PRIMARY_COLOR|color.golden": "Gyllene grundfärg",
      "COLOR_PATTERN|pattern.sooty": "Sotighet",
      "COLOR_TRANSITION|transition.soft": "Mjuka övergångar",
      "EYE_SIZE|eye.small": "Litet eye"
    };
    return preferred[`${slot}|${trait.trait_id}`] || trait.label;
  }

  function plantMarkerGroups(plantId) {
    const data = combinedData();
    const traits = traitMapFor(data);
    const seen = new Set();
    const groups = data.assessments
      .filter(row => row.plant_id === plantId && row.status === "COMPLETE")
      .sort((a, b) => sortNatural(b.observed_date + b.updated_at, a.observed_date + a.updated_at))
      .flatMap(assessment => validMarkerGroups(data, assessment))
      .filter(group => {
        const signature = markerSignature(group);
        if (seen.has(signature)) return false;
        seen.add(signature);
        return true;
      })
      .slice(0, 3);
    return groups.map(group => ({group, label: markerLabel(group, traits), signature: markerSignature(group)}));
  }

  window.hibiscusFlowerMarkerHtml = function (plantId, escape = htmlEscape) {
    return plantMarkerGroups(plantId).map(item =>
      `<span class="chip breeding-marker" title="Manuellt vald positiv förädlingsmarkör">${escape(item.label)}</span>`
    ).join("");
  };

  window.hibiscusFlowerMarkerSignatures = function (plantId) {
    return plantMarkerGroups(plantId).map(item => item.signature);
  };

  function observationSummary(data, assessment) {
    const traits = traitMapFor(data);
    return assignmentsFor(data, assessment.assessment_id, "OBSERVED")
      .filter(row => row.value_status === RECORDED)
      .map(row => traits.get(row.trait_id)?.label || row.trait_id)
      .slice(0, 6)
      .join(" · ");
  }

  window.hibiscusFlowerPanelHtml = function (plantId) {
    const data = combinedData();
    const assessments = data.assessments
      .filter(row => row.plant_id === plantId)
      .sort((a, b) => sortNatural(b.observed_date + b.updated_at, a.observed_date + a.updated_at));
    const rows = assessments.map(row => {
      const summary = observationSummary(data, row) || (row.status === "DRAFT" ? "Påbörjad men inte färdig" : "Inga registrerade egenskaper");
      const markers = validMarkerGroups(data, row).length;
      return `
        <article class="flower-history-item">
          <div><strong>${htmlEscape(row.observed_date)}</strong><small>${row.status === "COMPLETE" ? "Komplett" : "Utkast"}${markers ? ` · ${markers} markörer` : ""}</small></div>
          <p>${htmlEscape(summary)}</p>
          <button type="button" data-edit-flower-assessment="${htmlEscape(row.assessment_id)}">Öppna</button>
        </article>`;
    }).join("");
    return `
      <section class="plant-panel-section flower-panel-section" aria-labelledby="flowerAssessmentTitle">
        <div class="plant-panel-section-title" id="flowerAssessmentTitle">Blombedömning</div>
        <p class="flower-panel-intro">Daterade observationer från ett bestämt blomfoto. Ingen poäng och ingen automatisk bedömning mot målbilden.</p>
        <button class="flower-primary-button" type="button" data-new-flower-assessment>Ny blombedömning</button>
        <details class="plant-log-history" ${assessments.length ? "" : "hidden"}>
          <summary class="plant-log-history-title">Tidigare blombedömningar <span class="plant-log-history-count">${assessments.length}</span></summary>
          <div class="flower-history-list">${rows}</div>
        </details>
      </section>`;
  };

  window.bindHibiscusFlowerPanel = function (dialog, plantId) {
    dialog.querySelector("[data-new-flower-assessment]")?.addEventListener("click", () => {
      dialog.close();
      openAssessmentDialog(plantId, "");
    });
    dialog.querySelectorAll("[data-edit-flower-assessment]").forEach(button => {
      button.addEventListener("click", () => {
        dialog.close();
        openAssessmentDialog(plantId, button.dataset.editFlowerAssessment);
      });
    });
  };

  function selectField(config, observed, data) {
    const existing = observed.filter(row => row.slot === config.slot);
    const selected = existing.find(row => row.value_status === RECORDED)?.trait_id ||
      (existing.find(row => row.value_status === "UNASSESSABLE") ? "__UNASSESSABLE__" : "");
    const options = traitsForDomain(config.domain, data).map(trait =>
      `<option value="${htmlEscape(trait.trait_id)}" ${selected === trait.trait_id ? "selected" : ""}>${htmlEscape(trait.label)}${trait.status === "CANDIDATE" ? " · kandidat" : ""}</option>`
    ).join("");
    return `
      <label class="flower-field">${htmlEscape(config.label)}
        <select name="obs-${config.slot}" data-observed-slot="${config.slot}">
          <option value="">Inte bedömt</option>
          ${options}
          <option value="__UNASSESSABLE__" ${selected === "__UNASSESSABLE__" ? "selected" : ""}>Ej bedömbart från fotot</option>
        </select>
      </label>`;
  }

  function multiField(config, observed, data) {
    const existing = observed.filter(row => row.slot === config.slot);
    const selected = new Set(existing.filter(row => row.value_status === RECORDED).map(row => row.trait_id));
    const explicitStatus = existing.find(row => row.value_status !== RECORDED)?.value_status || RECORDED;
    const statusOptions = [
      `<option value="RECORDED" ${explicitStatus === RECORDED ? "selected" : ""}>Välj egenskaper</option>`,
      config.none ? `<option value="NONE" ${explicitStatus === "NONE" ? "selected" : ""}>Inga</option>` : "",
      `<option value="UNASSESSABLE" ${explicitStatus === "UNASSESSABLE" ? "selected" : ""}>Ej bedömbart från fotot</option>`
    ].join("");
    const choices = traitsForDomain(config.domain, data).map(trait => `
      <label><input type="checkbox" value="${htmlEscape(trait.trait_id)}" data-observed-multi="${config.slot}" ${selected.has(trait.trait_id) ? "checked" : ""}> ${htmlEscape(trait.label)}${trait.status === "CANDIDATE" ? " · kandidat" : ""}</label>
    `).join("");
    return `
      <fieldset class="flower-field flower-multi-field">
        <legend>${htmlEscape(config.label)}</legend>
        <select name="status-${config.slot}" data-multi-status="${config.slot}">${statusOptions}</select>
        <div class="flower-choice-grid" data-multi-choices="${config.slot}">${choices}</div>
      </fieldset>`;
  }

  function propertyKey(row) { return `${row.slot}|${row.trait_id}`; }

  function collectObserved(form) {
    const rows = [];
    slots.forEach(config => {
      if (config.multiple) {
        const selected = [...form.querySelectorAll(`[data-observed-multi="${config.slot}"]:checked`)];
        const status = form.elements[`status-${config.slot}`]?.value || RECORDED;
        if (status === RECORDED) {
          selected.forEach(input => rows.push({slot: config.slot, trait_id: input.value, value_status: RECORDED}));
        } else {
          rows.push({slot: config.slot, trait_id: "", value_status: status});
        }
      } else {
        const value = form.elements[`obs-${config.slot}`]?.value || "";
        if (value === "__UNASSESSABLE__") rows.push({slot: config.slot, trait_id: "", value_status: "UNASSESSABLE"});
        else if (value) rows.push({slot: config.slot, trait_id: value, value_status: RECORDED});
      }
    });
    const eyeSize = rows.find(row => row.slot === "EYE_SIZE" && row.value_status === RECORDED);
    if (eyeSize?.trait_id === "eye.none") {
      const colorIndex = rows.findIndex(row => row.slot === "EYE_COLOR");
      if (colorIndex >= 0) rows.splice(colorIndex, 1);
      rows.push({slot: "EYE_COLOR", trait_id: "", value_status: "NOT_APPLICABLE"});
    }
    return rows;
  }

  function currentLayerKeys(form, layer) {
    return new Set([...form.querySelectorAll(`[data-flower-layer="${layer}"]:checked`)].map(input => input.value));
  }

  function propertyLabel(row, traits) {
    const slot = slotMap.get(row.slot)?.label || row.slot;
    const trait = traits.get(row.trait_id);
    return `${slot}: ${trait?.label || row.trait_id}${trait?.status === "CANDIDATE" ? " · kandidat" : ""}`;
  }

  function refreshInterpretations(form, preferredCan = null, preferredWatch = null) {
    const data = combinedDataWithFormCandidates(form);
    const traits = traitMapFor(data);
    const can = preferredCan || currentLayerKeys(form, "CAN_CONTRIBUTE");
    const watch = preferredWatch || currentLayerKeys(form, "WATCH");
    const observed = collectObserved(form).filter(row => row.value_status === RECORDED);
    const renderLayer = (layer, selected) => observed.map(row => {
      const key = propertyKey(row);
      return `<label><input type="checkbox" data-flower-layer="${layer}" value="${htmlEscape(key)}" ${selected.has(key) ? "checked" : ""}> ${htmlEscape(propertyLabel(row, traits))}</label>`;
    }).join("") || '<p class="flower-empty-copy">Välj observerade egenskaper först.</p>';
    form.querySelector("[data-can-list]").innerHTML = renderLayer("CAN_CONTRIBUTE", can);
    form.querySelector("[data-watch-list]").innerHTML = renderLayer("WATCH", watch);
    form.querySelectorAll("[data-flower-layer]").forEach(input => {
      input.addEventListener("change", () => {
        if (input.checked) {
          const other = input.dataset.flowerLayer === "WATCH" ? "CAN_CONTRIBUTE" : "WATCH";
          const opposite = [...form.querySelectorAll(`[data-flower-layer="${other}"]`)].find(item => item.value === input.value);
          if (opposite) opposite.checked = false;
        }
        refreshMarkers(form);
      });
    });
    refreshMarkers(form);
  }

  function combinedDataWithFormCandidates(form) {
    const data = combinedData();
    const map = new Map(data.traits.map(row => [row.trait_id, row]));
    (form._flowerCandidates || []).forEach(row => map.set(row.trait_id, row));
    return {...data, traits: [...map.values()]};
  }

  function currentMarkerDrafts(form) {
    const container = form.querySelector("[data-marker-editor]");
    if (!container || !container.dataset.ready) return form._initialMarkerGroups || [];
    const drafts = [];
    container.querySelectorAll("[data-atomic-marker]:checked").forEach(input => {
      drafts.push({id: input.dataset.markerId || "", label: input.dataset.markerLabel || "", parts: [input.value]});
    });
    container.querySelectorAll("[data-composite-marker]").forEach(box => {
      const parts = [...box.querySelectorAll("[data-composite-part]:checked")].map(input => input.value);
      const label = clean(box.querySelector("[data-composite-label]")?.value);
      if (parts.length || label) drafts.push({id: box.dataset.markerId || "", label, parts});
    });
    return drafts;
  }

  function compositeEditor(draft, eligible, traits) {
    return `
      <div class="flower-composite" data-composite-marker data-marker-id="${htmlEscape(draft.id || "")}">
        <label>Namn på markören<input type="text" maxlength="60" data-composite-label value="${htmlEscape(draft.label || "")}" placeholder="T.ex. Varm orange övergång"></label>
        <div class="flower-choice-grid">
          ${eligible.map(row => {
            const key = propertyKey(row);
            return `<label><input type="checkbox" data-composite-part value="${htmlEscape(key)}" ${(draft.parts || []).includes(key) ? "checked" : ""}> ${htmlEscape(propertyLabel(row, traits))}</label>`;
          }).join("")}
        </div>
        <button type="button" class="flower-text-button" data-remove-composite>Ta bort sammansatt markör</button>
      </div>`;
  }

  function refreshMarkers(form, forcedDrafts = null) {
    const data = combinedDataWithFormCandidates(form);
    const traits = traitMapFor(data);
    const observedRows = collectObserved(form).filter(row => row.value_status === RECORDED);
    const observed = new Map(observedRows.map(row => [propertyKey(row), row]));
    const can = currentLayerKeys(form, "CAN_CONTRIBUTE");
    const watch = currentLayerKeys(form, "WATCH");
    const eligible = [...can].filter(key => observed.has(key) && !watch.has(key) && traits.get(observed.get(key).trait_id)?.status === ACTIVE).map(key => observed.get(key));
    const eligibleKeys = new Set(eligible.map(propertyKey));
    const drafts = (forcedDrafts || currentMarkerDrafts(form)).map(draft => ({...draft, parts: (draft.parts || []).filter(key => eligibleKeys.has(key))}));
    const atomic = new Map(drafts.filter(draft => draft.parts.length === 1).map(draft => [draft.parts[0], draft]));
    const composites = drafts.filter(draft => draft.parts.length > 1 || (draft.label && draft.parts.length !== 1));
    const editor = form.querySelector("[data-marker-editor]");
    editor.innerHTML = `
      <p class="flower-help">Välj högst tre positiva markörer. WATCH visas aldrig här. Kandidater måste först godkännas i ordlistan.</p>
      <div class="flower-choice-grid">
        ${eligible.map(row => {
          const key = propertyKey(row);
          const saved = atomic.get(key);
          const label = saved?.label || positiveLabel(row.slot, traits.get(row.trait_id));
          return `<label><input type="checkbox" data-atomic-marker data-marker-id="${htmlEscape(saved?.id || "")}" data-marker-label="${htmlEscape(label)}" value="${htmlEscape(key)}" ${saved ? "checked" : ""}> ${htmlEscape(label)}</label>`;
        }).join("") || '<p class="flower-empty-copy">Markera först något under Kan tillföra.</p>'}
      </div>
      <div data-composite-list>${composites.map(draft => compositeEditor(draft, eligible, traits)).join("")}</div>
      <button type="button" class="flower-text-button" data-add-composite ${eligible.length < 2 ? "disabled" : ""}>+ Sammansatt markör</button>`;
    editor.dataset.ready = "true";
    editor.querySelector("[data-add-composite]")?.addEventListener("click", () => {
      editor.querySelector("[data-composite-list]").insertAdjacentHTML("beforeend", compositeEditor({id: "", label: "", parts: []}, eligible, traits));
      bindCompositeRemove(editor);
    });
    bindCompositeRemove(editor);
  }

  function bindCompositeRemove(editor) {
    editor.querySelectorAll("[data-remove-composite]").forEach(button => {
      if (button.dataset.bound) return;
      button.dataset.bound = "true";
      button.addEventListener("click", () => button.closest("[data-composite-marker]")?.remove());
    });
  }

  function initialMarkerDrafts(data, assessmentId) {
    const traits = traitMapFor(data);
    return groupedMarkers(data, assessmentId).map(group => ({
      id: group[0].marker_id,
      label: markerLabel(group, traits),
      parts: group.map(row => `${row.slot}|${row.trait_id}`)
    }));
  }

  function showGeorgeImportStatus(form, kind, title, details = []) {
    const box = form.querySelector("[data-george-import-status]");
    if (!box) return;
    box.hidden = false;
    box.dataset.kind = kind;
    box.innerHTML = `<strong>${htmlEscape(title)}</strong>${details.length ? `<ul>${details.map(detail => `<li>${htmlEscape(detail)}</li>`).join("")}</ul>` : ""}`;
  }

  function renderGeorgeImportSummary(form) {
    const summary = form._georgeImportSummary;
    if (!summary) return;
    const pending = form._georgePendingCandidates || [];
    const details = [
      `${summary.slotCount} av ${slots.length} områden fylldes från Georges strukturerade data.`,
      `${summary.canCount} val under Kan tillföra och ${summary.watchCount} val under Se upp med.`,
      "Inget har sparats ännu. Kontrollera datum och blomfoto innan du sparar."
    ];
    details.push(...summary.warnings);
    if (pending.length) details.push(`${pending.length} kandidatförslag väntar på att du godkänner eller avvisar det.`);
    showGeorgeImportStatus(form, pending.length || summary.warnings.length ? "warning" : "success", "Georges bedömning är inläst", details);
  }

  function primeGeorgeCandidate(form) {
    const proposal = (form._georgePendingCandidates || [])[0];
    const reject = form.querySelector("[data-reject-george-candidate]");
    if (!proposal) {
      if (reject) reject.hidden = true;
      return;
    }
    form.querySelector("[data-candidate-slot]").value = proposal.slot;
    form.querySelector("[data-candidate-label]").value = String(proposal.proposed_label || "").slice(0, 60);
    form.querySelector("[data-candidate-definition]").value = String(proposal.definition || "").slice(0, 160);
    if (reject) {
      reject.hidden = false;
      reject.textContent = `Avvisa Georges kandidat: ${proposal.proposed_label}`;
    }
  }

  function resolveGeorgeCandidate(form, accepted) {
    const pending = form._georgePendingCandidates || [];
    if (!pending.length) return;
    if (!accepted) pending.shift();
    primeGeorgeCandidate(form);
    renderGeorgeImportSummary(form);
  }

  function clearObservedForm(form) {
    slots.forEach(config => {
      if (config.multiple) {
        form.elements[`status-${config.slot}`].value = RECORDED;
        form.querySelectorAll(`[data-observed-multi="${config.slot}"]`).forEach(input => input.checked = false);
      } else {
        form.elements[`obs-${config.slot}`].value = "";
      }
    });
  }

  function applyGeorgeResult(form, result, photos) {
    clearObservedForm(form);
    result.observed.forEach(row => {
      const config = slotMap.get(row.slot);
      if (!config) return;
      if (config.multiple) {
        if (row.value_status === RECORDED) {
          const input = [...form.querySelectorAll(`[data-observed-multi="${row.slot}"]`)].find(item => item.value === row.trait_id);
          if (input) input.checked = true;
          form.elements[`status-${row.slot}`].value = RECORDED;
        } else {
          form.elements[`status-${row.slot}`].value = row.value_status;
        }
      } else if (row.value_status === RECORDED) {
        form.elements[`obs-${row.slot}`].value = row.trait_id;
      } else if (row.value_status === "UNASSESSABLE") {
        form.elements[`obs-${row.slot}`].value = "__UNASSESSABLE__";
      }
    });

    if (result.assessment.observed_date) form.elements.observed_date.value = result.assessment.observed_date;
    if (result.assessment.photo_id && photos.some(row => row.photo_id === result.assessment.photo_id)) {
      form.elements.photo_id.value = result.assessment.photo_id;
      form.elements.photo_id.dispatchEvent(new Event("change"));
    }

    form._georgePendingCandidates = result.candidateProposals.map(proposal => ({...proposal}));
    form._georgeImportSummary = {
      slotCount: result.slotCount,
      canCount: result.canKeys.size,
      watchCount: result.watchKeys.size,
      warnings: result.warnings
    };
    refreshInterpretations(form, result.canKeys, result.watchKeys);
    primeGeorgeCandidate(form);
    renderGeorgeImportSummary(form);
  }

  function importGeorgeText(form, plantId, photos, text) {
    const importer = window.HibiscusGeorgeImport;
    if (!importer) {
      showGeorgeImportStatus(form, "error", "Importfunktionen kunde inte starta", ["Ladda om sidan och försök igen."]);
      return;
    }
    try {
      const data = combinedDataWithFormCandidates(form);
      const result = importer.parseAndValidate(text, {
        plantId,
        traits: data.traits,
        photoIds: photos.map(row => row.photo_id)
      });
      applyGeorgeResult(form, result, photos);
    } catch (error) {
      const details = Array.isArray(error?.messages) ? error.messages : [error?.message || "Svaret kunde inte läsas."];
      showGeorgeImportStatus(form, "error", "Georges svar kunde inte läsas in", details);
    }
  }

  function assessmentDialog() {
    let dialog = document.querySelector("#hibiscusFlowerAssessmentDialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "hibiscusFlowerAssessmentDialog";
    dialog.className = "flower-assessment-dialog";
    document.body.appendChild(dialog);
    return dialog;
  }

  function openAssessmentDialog(plantId, assessmentId) {
    const data = combinedData();
    const existing = data.assessments.find(row => row.assessment_id === assessmentId) || null;
    const assessment = existing || {
      assessment_id: randomId(`FA-${plantId}`), plant_id: plantId, observed_date: localDateString(), photo_id: "",
      standard_version: STANDARD_VERSION, status: "DRAFT", note: "", created_at: "", updated_at: ""
    };
    const observed = assignmentsFor(data, assessment.assessment_id, "OBSERVED");
    const can = new Set(assignmentsFor(data, assessment.assessment_id, "CAN_CONTRIBUTE").map(propertyKey));
    const watch = new Set(assignmentsFor(data, assessment.assessment_id, "WATCH").map(propertyKey));
    const photos = basePhotos.filter(row => row.plant_id === plantId && row.type === "blomma" && row.photo_id);
    if (!existing && photos.length) assessment.photo_id = photos[photos.length - 1].photo_id;
    const photoOptions = photos.map(row => `<option value="${htmlEscape(row.photo_id)}" ${row.photo_id === assessment.photo_id ? "selected" : ""}>${htmlEscape(row.label || `${row.date} · ${row.type}`)}</option>`).join("");
    const selectedPhoto = photos.find(row => row.photo_id === assessment.photo_id) || null;
    const fields = slots.map(config => config.multiple ? multiField(config, observed, data) : selectField(config, observed, data)).join("");
    const dialog = assessmentDialog();
    dialog.innerHTML = `
      <form class="flower-assessment-form" method="dialog" novalidate>
        <header>
          <div><h2>Blombedömning</h2><p>${htmlEscape(plantId)} · ${existing ? "redigera daterad observation" : "ny daterad observation"}</p></div>
          <button type="button" class="flower-close" aria-label="Stäng">×</button>
        </header>
        <div class="flower-form-error" role="alert" hidden></div>
        <section class="flower-george-import">
          <details>
            <summary>Fyll automatiskt från Georges svar</summary>
            <p class="flower-help">Kopiera hela Georges svar, inklusive JSON-delen. Appen kontrollerar växt-ID, version, slotar och trait-ID:n innan formuläret fylls.</p>
            <textarea data-george-json-input spellcheck="false" placeholder="Klistra in hela svaret från George här"></textarea>
            <div class="flower-george-actions">
              <button type="button" data-george-paste>Klistra in från urklipp</button>
              <button type="button" class="flower-primary-button" data-george-import>Läs in och fyll formuläret</button>
            </div>
            <div class="flower-george-status" data-george-import-status hidden></div>
          </details>
        </section>
        <section class="flower-assessed-photo" data-flower-photo-drop>
          <input type="file" accept="image/*" data-flower-photo-input hidden>
          <div>
            <strong>Blombilden som George bedömde</strong>
            <p>Dra hit samma bild som du skickade till George. Den sparas som bildtypen <strong>blomma</strong> och kopplas direkt till bedömningen.</p>
            <small data-flower-photo-status>Du kan också välja ett blomfoto som redan finns nedan.</small>
          </div>
          <button type="button" data-flower-photo-choose>Välj bild</button>
        </section>
        <section class="flower-meta-grid">
          <label>Datum<input name="observed_date" type="date" value="${htmlEscape(assessment.observed_date)}" required></label>
          <label>Blomfoto<select name="photo_id"><option value="">Välj ett blomfoto</option>${photoOptions}</select></label>
        </section>
        <img class="flower-photo-preview" data-flower-photo-preview src="${htmlEscape(selectedPhoto?.file || "")}" alt="Valt blomfoto för bedömningen" ${selectedPhoto ? "" : "hidden"}>
        <p class="flower-warning" data-flower-photo-warning ${photos.length ? "hidden" : ""}>Den här plantan saknar ett foto med bildtypen blomma. Dra in den bedömda bilden ovan.</p>
        <section class="flower-assessment-layer"><h3>1. Observerad fenotyp</h3><p class="flower-help">Beskriv bara det som faktiskt syns. Lämna i utkast eller välj Ej bedömbart när fotot inte räcker.</p><div class="flower-observed-grid">${fields}</div></section>
        <section class="flower-candidate-box">
          <h4>Oväntad egenskap</h4><p class="flower-help">Skapa en kandidat i rätt fält i stället för att välja en halvfel term.</p>
          <div class="flower-candidate-fields">
            <select data-candidate-slot>${slots.map(config => `<option value="${config.slot}">${htmlEscape(config.label)}</option>`).join("")}</select>
            <input data-candidate-label maxlength="60" placeholder="Ny egenskap">
            <input data-candidate-definition maxlength="160" placeholder="Kort definition">
            <button type="button" data-add-candidate>Lägg till kandidat</button>
          </div>
          <button type="button" class="flower-text-button" data-reject-george-candidate hidden>Avvisa Georges kandidatförslag</button>
        </section>
        <section class="flower-assessment-layer"><h3>2. Kan tillföra</h3><p class="flower-help">Aktiva egenskaper som kan vara intressanta att föra vidare.</p><div class="flower-choice-grid" data-can-list></div></section>
        <section class="flower-assessment-layer"><h3>3. Se upp med</h3><p class="flower-help">Egenskaper som är verifierade men inte ska förstärkas i linjen.</p><div class="flower-choice-grid" data-watch-list></div></section>
        <section class="flower-assessment-layer"><h3>Positiva förädlingsmarkörer</h3><div data-marker-editor></div></section>
        <label class="flower-note">Bedömningsanteckning<textarea name="note" maxlength="240" placeholder="Frivillig kommentar om fotot eller bedömbarheten">${htmlEscape(assessment.note)}</textarea></label>
        <footer>
          <button type="button" class="secondary" data-save-flower="DRAFT">Spara utkast</button>
          <button type="button" class="flower-primary-button" data-save-flower="COMPLETE">Spara som komplett</button>
        </footer>
      </form>`;
    const form = dialog.querySelector("form");
    const queuedAssessment = readQueue().find(item => item.assessment?.assessment_id === assessment.assessment_id);
    form._flowerCandidates = [...(queuedAssessment?.candidates || [])];
    form._initialMarkerGroups = initialMarkerDrafts(data, assessment.assessment_id);
    form._georgePendingCandidates = [];
    form._georgeImportSummary = null;
    form._flowerPendingPhoto = null;
    dialog.querySelector(".flower-close").addEventListener("click", () => dialog.close());
    form.elements.photo_id.addEventListener("change", () => {
      const preview = form.querySelector("[data-flower-photo-preview]");
      const pending = form._flowerPendingPhoto;
      if (pending && form.elements.photo_id.value === pending.temporaryPhotoId) {
        preview.hidden = false;
        preview.src = pending.previewUrl;
        return;
      }
      const photo = photos.find(row => row.photo_id === form.elements.photo_id.value);
      preview.hidden = !photo;
      if (photo) preview.src = photo.file;
    });
    const photoInput = form.querySelector("[data-flower-photo-input]");
    const photoDrop = form.querySelector("[data-flower-photo-drop]");
    const imageFromTransfer = transfer => [...(transfer?.files || [])].find(file => file?.type?.startsWith("image/")) || null;
    const acceptFlowerPhoto = async file => {
      if (!file || !file.type?.startsWith("image/")) {
        const errorBox = form.querySelector(".flower-form-error");
        errorBox.hidden = false;
        errorBox.textContent = "Välj en bildfil för blombedömningen.";
        return;
      }
      try {
        const data = await file.arrayBuffer();
        const suggested = suggestedPhotoDate(file, data);
        if (form._flowerPendingPhoto?.previewUrl) URL.revokeObjectURL(form._flowerPendingPhoto.previewUrl);
        const importId = randomId("flower-photo");
        const temporaryPhotoId = `pending:${importId}`;
        const previewUrl = URL.createObjectURL(file);
        form._flowerPendingPhoto = {file, data, importId, photoId: randomId("HPH").toUpperCase(), temporaryPhotoId, previewUrl};
        let option = [...form.elements.photo_id.options].find(row => row.value.startsWith("pending:"));
        if (!option) {
          option = document.createElement("option");
          form.elements.photo_id.appendChild(option);
        }
        option.value = temporaryPhotoId;
        option.textContent = `${suggested.date} · blomma · ny bild`;
        form.elements.photo_id.value = temporaryPhotoId;
        form.elements.observed_date.value = suggested.date;
        form.elements.photo_id.dispatchEvent(new Event("change"));
        form.querySelector("[data-flower-photo-status]").textContent = `${file.name || "Blombild"} är vald och läggs i bildkön när bedömningen sparas.`;
        form.querySelector("[data-flower-photo-warning]").hidden = true;
        photoDrop.classList.add("has-photo");
      } catch (error) {
        const errorBox = form.querySelector(".flower-form-error");
        errorBox.hidden = false;
        errorBox.textContent = "Bilden kunde inte läsas. Prova att välja den igen.";
      }
    };
    form.querySelector("[data-flower-photo-choose]").addEventListener("click", () => {
      photoInput.value = "";
      photoInput.click();
    });
    photoInput.addEventListener("change", () => acceptFlowerPhoto(photoInput.files?.[0]));
    for (const eventName of ["dragenter", "dragover"]) {
      photoDrop.addEventListener(eventName, event => {
        if (![...(event.dataTransfer?.items || [])].some(item => item.kind === "file" && item.type.startsWith("image/"))) return;
        event.preventDefault();
        if (eventName === "dragover") event.dataTransfer.dropEffect = "copy";
        photoDrop.classList.add("is-dragging");
      });
    }
    photoDrop.addEventListener("dragleave", event => {
      if (!event.relatedTarget || !photoDrop.contains(event.relatedTarget)) photoDrop.classList.remove("is-dragging");
    });
    photoDrop.addEventListener("drop", event => {
      const file = imageFromTransfer(event.dataTransfer);
      photoDrop.classList.remove("is-dragging");
      if (!file) return;
      event.preventDefault();
      acceptFlowerPhoto(file);
    });
    dialog.addEventListener("close", () => {
      if (form._flowerPendingPhoto?.previewUrl) URL.revokeObjectURL(form._flowerPendingPhoto.previewUrl);
    }, {once: true});
    form.querySelectorAll("[data-observed-slot], [data-observed-multi], [data-multi-status]").forEach(input => {
      input.addEventListener("change", () => {
        if (input.dataset.observedMulti) {
          const status = form.elements[`status-${input.dataset.observedMulti}`];
          if (input.checked && status) status.value = RECORDED;
        }
        if (input.dataset.multiStatus && input.value !== RECORDED) {
          form.querySelectorAll(`[data-observed-multi="${input.dataset.multiStatus}"]`).forEach(box => box.checked = false);
        }
        refreshInterpretations(form);
      });
    });
    form.querySelector("[data-george-import]").addEventListener("click", () => {
      importGeorgeText(form, plantId, photos, form.querySelector("[data-george-json-input]").value);
    });
    form.querySelector("[data-george-paste]").addEventListener("click", async () => {
      try {
        if (!navigator.clipboard?.readText) throw new Error("Urklippsåtkomst saknas");
        const text = await navigator.clipboard.readText();
        form.querySelector("[data-george-json-input]").value = text;
        importGeorgeText(form, plantId, photos, text);
      } catch (error) {
        showGeorgeImportStatus(form, "warning", "Klistra in manuellt", ["Webbläsaren gav inte åtkomst till urklippet. Klistra in Georges svar i rutan och välj Läs in och fyll formuläret."]);
      }
    });
    form.querySelector("[data-reject-george-candidate]").addEventListener("click", () => resolveGeorgeCandidate(form, false));
    form.querySelector("[data-add-candidate]").addEventListener("click", () => addCandidateFromForm(form));
    form.querySelectorAll("[data-save-flower]").forEach(button => button.addEventListener("click", () => saveAssessment(form, assessment, button.dataset.saveFlower)));
    refreshInterpretations(form, can, watch);
    dialog.showModal();
  }

  function addCandidateFromForm(form) {
    const slot = form.querySelector("[data-candidate-slot]").value;
    const labelInput = form.querySelector("[data-candidate-label]");
    const definitionInput = form.querySelector("[data-candidate-definition]");
    const label = clean(labelInput.value);
    if (!label) return;
    const config = slotMap.get(slot);
    const trait = {
      trait_id: randomId(`candidate.${config.domain.toLowerCase()}`), domain: config.domain, label,
      definition: clean(definitionInput.value), status: "CANDIDATE", canonical_trait_id: ""
    };
    form._flowerCandidates.push(trait);
    if (config.multiple) {
      const wrapper = form.querySelector(`[data-multi-choices="${slot}"]`);
      wrapper.insertAdjacentHTML("beforeend", `<label><input type="checkbox" value="${htmlEscape(trait.trait_id)}" data-observed-multi="${slot}" checked> ${htmlEscape(label)} · kandidat</label>`);
      form.elements[`status-${slot}`].value = RECORDED;
      wrapper.lastElementChild.querySelector("input").addEventListener("change", () => refreshInterpretations(form));
    } else {
      const select = form.elements[`obs-${slot}`];
      select.insertAdjacentHTML("beforeend", `<option value="${htmlEscape(trait.trait_id)}">${htmlEscape(label)} · kandidat</option>`);
      select.value = trait.trait_id;
    }
    labelInput.value = "";
    definitionInput.value = "";
    const pending = form._georgePendingCandidates || [];
    if (pending.length && pending[0].slot === slot && clean(pending[0].proposed_label) === label) pending.shift();
    primeGeorgeCandidate(form);
    renderGeorgeImportSummary(form);
    refreshInterpretations(form);
  }

  function validateComplete(form, observed, markers) {
    const errors = [];
    if ((form._georgePendingCandidates || []).length) errors.push("Godkänn eller avvisa Georges kandidatförslag innan bedömningen sparas som komplett.");
    if (!form.elements.photo_id.value) errors.push("Välj det blomfoto som bedömningen gäller.");
    slots.forEach(config => {
      if (!observed.some(row => row.slot === config.slot)) errors.push(`${config.label} är inte bedömt.`);
    });
    const patterns = observed.filter(row => row.slot === "COLOR_PATTERN" && row.value_status === RECORDED);
    if (patterns.some(row => row.trait_id === "pattern.even") && patterns.length > 1) errors.push("Jämn färgspridning kan inte kombineras med andra mönster.");
    const primary = observed.find(row => row.slot === "PRIMARY_COLOR" && row.value_status === RECORDED)?.trait_id;
    if (primary && observed.some(row => row.slot === "SECONDARY_COLOR" && row.trait_id === primary)) errors.push("Huvudfärgen ska inte upprepas som sekundär färg.");
    if (markers.length > 3) errors.push("Välj högst tre positiva förädlingsmarkörer.");
    markers.forEach(group => {
      if (group.parts.length > 1 && !group.label) errors.push("En sammansatt markör behöver ett tydligt namn.");
      if (group.parts.length === 0) errors.push("En sammansatt markör behöver minst två egenskaper.");
      if (group.parts.length === 1 && group.composite) errors.push("En sammansatt markör behöver minst två egenskaper.");
    });
    return errors;
  }

  function markerDraftsForSave(form) {
    const drafts = [];
    form.querySelectorAll("[data-atomic-marker]:checked").forEach(input => drafts.push({
      id: input.dataset.markerId || randomId("FM"), label: input.dataset.markerLabel || "", parts: [input.value], composite: false
    }));
    form.querySelectorAll("[data-composite-marker]").forEach(box => {
      const parts = [...box.querySelectorAll("[data-composite-part]:checked")].map(input => input.value);
      const label = clean(box.querySelector("[data-composite-label]").value);
      if (!parts.length && !label) return;
      drafts.push({id: box.dataset.markerId || randomId("FM"), label, parts, composite: true});
    });
    return drafts;
  }

  async function saveAssessment(form, original, status) {
    const observed = collectObserved(form);
    const can = currentLayerKeys(form, "CAN_CONTRIBUTE");
    const watch = currentLayerKeys(form, "WATCH");
    const markerDrafts = markerDraftsForSave(form);
    const errors = [];
    if (!form.elements.observed_date.value) errors.push("Datum saknas.");
    if (status === "COMPLETE") errors.push(...validateComplete(form, observed, markerDrafts));
    const errorBox = form.querySelector(".flower-form-error");
    if (errors.length) {
      errorBox.hidden = false;
      errorBox.innerHTML = `<strong>Bedömningen kan inte sparas ännu:</strong><ul>${errors.map(error => `<li>${htmlEscape(error)}</li>`).join("")}</ul>`;
      errorBox.scrollIntoView({behavior: "smooth", block: "start"});
      return;
    }
    const saveButtons = [...form.querySelectorAll("[data-save-flower]")];
    saveButtons.forEach(button => button.disabled = true);
    const now = new Date().toISOString();
    let selectedPhotoId = form.elements.photo_id.value;
    const pendingPhoto = form._flowerPendingPhoto;
    if (pendingPhoto && selectedPhotoId === pendingPhoto.temporaryPhotoId) {
      try {
        selectedPhotoId = pendingPhoto.photoId;
        await addImageImportItem({
          id: pendingPhoto.importId,
          photoId: selectedPhotoId,
          createdAt: now,
          category: "Hibiskus",
          plantId: original.plant_id,
          plantName: original.plant_id,
          date: form.elements.observed_date.value,
          type: "blomma",
          note: `Blombedömning ${original.assessment_id}`,
          originalFileName: pendingPhoto.file.name || `${original.plant_id}_blomma.jpg`,
          mime: pendingPhoto.file.type || "image/jpeg",
          size: pendingPhoto.file.size || 0,
          data: pendingPhoto.data
        });
      } catch (error) {
        saveButtons.forEach(button => button.disabled = false);
        errorBox.hidden = false;
        errorBox.textContent = "Blombilden kunde inte läggas i synkkön. Bedömningen har inte sparats.";
        errorBox.scrollIntoView({behavior: "smooth", block: "start"});
        return;
      }
    }
    const assessment = {
      assessment_id: original.assessment_id,
      plant_id: original.plant_id,
      observed_date: form.elements.observed_date.value,
      photo_id: selectedPhotoId,
      standard_version: STANDARD_VERSION,
      status,
      note: clean(form.elements.note.value),
      created_at: original.created_at || now,
      updated_at: now
    };
    const assignments = observed.map(row => ({assessment_id: assessment.assessment_id, layer: "OBSERVED", ...row}));
    for (const [layer, keys] of [["CAN_CONTRIBUTE", can], ["WATCH", watch]]) {
      keys.forEach(key => {
        const [slot, trait_id] = key.split("|");
        assignments.push({assessment_id: assessment.assessment_id, layer, slot, trait_id, value_status: RECORDED});
      });
    }
    const markers = status === "COMPLETE" ? markerDrafts.flatMap(draft => draft.parts.map(key => {
      const [slot, trait_id] = key.split("|");
      return {marker_id: draft.id, assessment_id: assessment.assessment_id, slot, trait_id, label: draft.label, selected_at: now};
    })) : [];
    const item = {assessment, assignments, candidates: form._flowerCandidates || [], markers};
    const queue = readQueue().filter(row => row.assessment?.assessment_id !== assessment.assessment_id);
    queue.push(item);
    writeQueue(queue);
    assessmentDialog().close();
    window.dispatchEvent(new CustomEvent("hibiscus-flower-data-changed", {detail: {assessment_id: assessment.assessment_id}}));
  }

  window.buildHibiscusFlowerAssessmentExport = function () {
    const items = readQueue();
    const traits = new Map();
    items.flatMap(item => item.candidates || []).forEach(row => traits.set(row.trait_id, row));
    return {version: 1, exportedAt: new Date().toISOString(), standardVersion: STANDARD_VERSION, traits: [...traits.values()], items};
  };

  window.deleteHibiscusFlowerAssessmentChange = function (assessmentId) {
    writeQueue(readQueue().filter(item => item.assessment?.assessment_id !== assessmentId));
    window.dispatchEvent(new CustomEvent("hibiscus-flower-data-changed", {detail: {deleted: true}}));
  };

  window.clearHibiscusFlowerAssessmentChanges = function () {
    writeQueue([]);
    window.dispatchEvent(new CustomEvent("hibiscus-flower-data-changed", {detail: {cleared: true}}));
  };

  const style = document.createElement("style");
  style.id = "hibiscusFlowerAssessmentStyles";
  style.textContent = `
    .breeding-marker { background: #e7efe5 !important; color: #36573d !important; border: 1px solid #b9ccb8; }
    .flower-panel-intro, .flower-help { margin: 0 0 12px; color: var(--muted, #6f655b); font-size: .9rem; }
    .flower-primary-button { border: 0; border-radius: 999px; background: var(--accent, #7d4f3b); color: white; padding: 10px 16px; font-weight: 800; cursor: pointer; }
    .flower-history-list { display: grid; gap: 8px; margin-top: 10px; }
    .flower-history-item { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; align-items: center; border: 1px solid var(--line, #ded2c2); border-radius: 13px; padding: 10px; }
    .flower-history-item div { display: grid; } .flower-history-item small { color: var(--muted, #6f655b); }
    .flower-history-item p { grid-column: 1 / -1; margin: 0; font-size: .86rem; color: var(--muted, #6f655b); }
    .flower-history-item button, .flower-text-button { border: 0; background: transparent; color: var(--accent, #7d4f3b); font-weight: 800; cursor: pointer; }
    dialog.flower-assessment-dialog { width: min(94vw, 900px); max-height: 92vh; overflow: auto; border: 0; border-radius: 24px; padding: 0; background: var(--paper, #fffdf8); color: var(--ink, #2b251f); box-shadow: 0 26px 90px rgba(0,0,0,.28); }
    dialog.flower-assessment-dialog::backdrop { background: rgba(24,19,16,.55); }
    .flower-assessment-form { padding: 22px; display: grid; gap: 18px; }
    .flower-assessment-form > header { display: flex; justify-content: space-between; gap: 18px; padding: 0; text-align: left; }
    .flower-assessment-form h2 { margin: 0; font: 500 2rem/1 Georgia, serif; } .flower-assessment-form header p { margin: 6px 0 0; color: var(--muted, #6f655b); }
    .flower-close { border: 0; background: transparent; font-size: 2rem; cursor: pointer; color: inherit; }
    .flower-meta-grid, .flower-observed-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .flower-photo-preview { width: 100%; max-height: 420px; object-fit: contain; border-radius: 16px; background: #eee8df; }
    .flower-george-import { border: 1px solid #b9ccb8; border-radius: 18px; padding: 14px 16px; background: #f3f7f1; }
    .flower-george-import summary { cursor: pointer; color: #36573d; font-weight: 850; }
    .flower-george-import details[open] summary { margin-bottom: 10px; }
    .flower-george-import textarea { width: 100%; min-height: 150px; resize: vertical; border: 1px solid var(--line, #ded2c2); border-radius: 11px; padding: 10px; background: white; color: inherit; font: .82rem/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .flower-george-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 9px; }
    .flower-george-actions button:not(.flower-primary-button) { border: 1px solid #b9ccb8; border-radius: 999px; background: white; color: #36573d; padding: 10px 14px; font-weight: 800; cursor: pointer; }
    .flower-george-status { margin-top: 10px; padding: 12px; border-radius: 12px; background: #e7efe5; color: #36573d; }
    .flower-george-status[data-kind="warning"] { background: #fff1d8; color: #6f4814; }
    .flower-george-status[data-kind="error"] { background: #f8dddd; color: #712c2c; }
    .flower-george-status ul { margin: 7px 0 0; padding-left: 20px; }
    .flower-assessed-photo { display: grid; grid-template-columns: 1fr auto; gap: 14px; align-items: center; border: 2px dashed #cdbba7; border-radius: 18px; padding: 16px; background: #fbf8f2; transition: border-color .15s ease, background .15s ease; }
    .flower-assessed-photo.is-dragging { border-color: var(--accent, #7d4f3b); background: #f4ebe1; }
    .flower-assessed-photo.has-photo { border-style: solid; border-color: #9fbc9d; background: #f3f7f1; }
    .flower-assessed-photo p { margin: 5px 0; color: var(--muted, #6f655b); font-size: .9rem; }
    .flower-assessed-photo small { color: var(--muted, #6f655b); }
    .flower-assessed-photo button { border: 1px solid #cdbba7; border-radius: 999px; background: white; color: var(--accent, #7d4f3b); padding: 10px 15px; font-weight: 800; cursor: pointer; }
    .flower-assessment-layer, .flower-candidate-box { border: 1px solid var(--line, #ded2c2); border-radius: 18px; padding: 16px; }
    .flower-assessment-layer h3, .flower-candidate-box h4 { margin: 0 0 6px; }
    .flower-field, .flower-meta-grid label, .flower-note { display: grid; gap: 6px; font-weight: 800; }
    .flower-field select, .flower-meta-grid input, .flower-meta-grid select, .flower-note textarea, .flower-candidate-fields input, .flower-candidate-fields select, .flower-composite input { width: 100%; border: 1px solid var(--line, #ded2c2); border-radius: 11px; padding: 10px; background: white; color: inherit; font: inherit; }
    .flower-multi-field { border: 1px solid var(--line, #ded2c2); border-radius: 13px; padding: 10px; } .flower-multi-field legend { font-weight: 800; }
    .flower-choice-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px 12px; margin-top: 9px; }
    .flower-choice-grid label { font-weight: 600; font-size: .9rem; }
    .flower-choice-grid input[type="checkbox"] { width: auto; padding: 0; accent-color: var(--accent, #7d4f3b); }
    .flower-candidate-fields { display: grid; grid-template-columns: 1fr 1fr 1.5fr auto; gap: 8px; }
    .flower-candidate-fields button { border: 0; border-radius: 11px; background: var(--chip, #efe6da); color: inherit; font-weight: 800; padding: 10px; cursor: pointer; }
    .flower-composite { margin-top: 12px; padding: 12px; border-radius: 13px; background: rgba(239,230,218,.55); }
    .flower-composite > label { display: grid; gap: 5px; font-weight: 800; }
    .flower-warning, .flower-form-error { margin: 0; padding: 12px; border-radius: 12px; background: #fff1d8; color: #6f4814; }
    .flower-form-error { background: #f8dddd; color: #712c2c; } .flower-form-error ul { margin-bottom: 0; }
    .flower-empty-copy { color: var(--muted, #6f655b); font-size: .9rem; }
    .flower-assessment-form > footer { display: flex; justify-content: flex-end; gap: 10px; }
    .flower-assessment-form > footer .secondary { border: 1px solid var(--line, #ded2c2); border-radius: 999px; background: transparent; color: inherit; padding: 10px 16px; font-weight: 800; cursor: pointer; }
    @media (max-width: 680px) {
      .flower-assessment-form { padding: 16px; } .flower-meta-grid, .flower-observed-grid, .flower-choice-grid { grid-template-columns: 1fr; }
      .flower-candidate-fields, .flower-assessed-photo { grid-template-columns: 1fr; } .flower-assessment-form > footer, .flower-george-actions { flex-direction: column; }
      .flower-assessed-photo button { width: 100%; }
    }
  `;
  document.head.appendChild(style);
})();
