(function () {
  "use strict";

  const ENDPOINT =
    "https://us-central1-cooper-debate-team.cloudfunctions.net/manageEssayEvaluation";
  const KEYS = [
    "claimCase",
    "evidenceResearch",
    "commentaryAnalysis",
    "weighingImpacts",
    "organizationNarrative",
    "conclusionRecommendation",
    "styleVoice",
  ];
  const SCORE_LABELS = {
    5: "Outstanding",
    4: "Good",
    3: "Developing",
    2: "Limited",
    1: "Incomplete",
  };
  const BANDS = [
    [32, 35, "Outstanding"],
    [27, 31, "Strong"],
    [21, 26, "Promising"],
    [14, 20, "Developing"],
    [7, 13, "Does not yet demonstrate needed skills"],
  ];
  const RUBRIC = Array.isArray(window.COOPER_ESSAY_RUBRIC)
    ? window.COOPER_ESSAY_RUBRIC
    : [];

  let current = null;
  let state = null;
  let dialog = null;
  let saveTimer = null;
  let savePromise = null;
  let finalizePromise = null;
  let dirty = false;
  let lastSaveError = "";
  let lastPersistedEvaluation = null;
  let splitPercent = 58;
  let changeVersion = 0;
  const evaluationCache = new Map();
  const evaluationRequests = new Map();

  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[character]));
  const emptyState = () => ({
    revision: 0,
    rubric: Object.fromEntries(KEYS.map((key) => [key, null])),
    strengths: "",
    growthAreas: "",
    concerns: "",
    recommendation: "",
    status: "not-started",
  });
  const scoreCount = () =>
    KEYS.filter((key) => Number.isInteger(state.rubric[key])).length;
  const total = () =>
    KEYS.reduce((sum, key) => sum + (Number(state.rubric[key]) || 0), 0);
  const interpretation = () => {
    const completed = scoreCount();
    if (completed === 0) return "Not started";
    if (completed < KEYS.length) return "Not complete";
    const score = total();
    return BANDS.find(([minimum, maximum]) => score >= minimum && score <= maximum)?.[2] || "Not complete";
  };
  const sourceUrl = (value) => {
    const match = String(value || "").match(/https?:\/\/[^\s<>"']+/i);
    return match ? match[0].replace(/[),.;]+$/, "") : "";
  };
  const drivePreview = (value) => {
    const source = sourceUrl(value);
    if (!source) return "";
    try {
      const url = new URL(source);
      const docs = url.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([^/]+)/);
      if (docs) return `https://docs.google.com/${docs[1]}/d/${docs[2]}/preview`;
      const file = url.pathname.match(/^\/file\/d\/([^/]+)/);
      if (file) return `https://drive.google.com/file/d/${file[1]}/preview`;
      if (url.searchParams.get("id")) {
        return `https://drive.google.com/file/d/${url.searchParams.get("id")}/preview`;
      }
    } catch (_) {
      return "";
    }
    return "";
  };
  const setStatus = (message, kind = "") => {
    const element = dialog?.querySelector(".eval-status");
    if (element) {
      element.textContent = message;
      element.dataset.kind = kind;
    }
  };
  const payload = () => ({
    expectedRevision: state.revision ?? 0,
    rubric: state.rubric,
    strengths: state.strengths,
    growthAreas: state.growthAreas,
    concerns: state.concerns,
    recommendation: state.recommendation,
  });

  async function api(action, applicationId, body = {}) {
    const user = window.firebase?.auth?.().currentUser;
    if (!user) throw new Error("Your secure session has expired. Sign in again.");
    const token = await user.getIdToken();
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, applicationId, ...body }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 409) {
      const conflict = new Error("This evaluation changed in another window.");
      conflict.remoteEvaluation = result.evaluation;
      throw conflict;
    }
    if (response.status === 401) throw new Error("Your session is not authorized. Sign in again.");
    if (response.status === 403) throw new Error("Your account does not have coach evaluation access.");
    if (!response.ok || !result.ok) throw new Error(result.error || "The evaluation service is unavailable.");
    return result.evaluation;
  }

  function loadEvaluation(applicationId, { force = false } = {}) {
    if (!force && evaluationCache.has(applicationId)) {
      return Promise.resolve(evaluationCache.get(applicationId));
    }
    if (!force && evaluationRequests.has(applicationId)) {
      return evaluationRequests.get(applicationId);
    }
    const request = api("get", applicationId)
      .then((evaluation) => {
        const normalized = evaluation
          ? { ...emptyState(), ...evaluation, rubric: { ...emptyState().rubric, ...evaluation.rubric } }
          : emptyState();
        evaluationCache.set(applicationId, normalized);
        return normalized;
      })
      .finally(() => evaluationRequests.delete(applicationId));
    evaluationRequests.set(applicationId, request);
    return request;
  }

  function timestampDate(value) {
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate();
    const seconds = value._seconds ?? value.seconds;
    if (Number.isFinite(seconds)) return new Date(seconds * 1000);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function recommendationLabel(value) {
    return {
      "strongly-recommend": "Strongly recommend",
      recommend: "Recommend",
      consider: "Consider",
      "do-not-recommend": "Do not recommend at this time",
    }[value] || "No recommendation";
  }

  function launcherSummary(evaluation) {
    const rubric = evaluation?.rubric || emptyState().rubric;
    const count = KEYS.filter((key) => Number.isInteger(rubric[key])).length;
    const score = KEYS.reduce((sum, key) => sum + (Number(rubric[key]) || 0), 0);
    const band = BANDS.find(([minimum, maximum]) => score >= minimum && score <= maximum)?.[2] || "Not started";
    const completed = evaluation?.status === "finalized" || evaluation?.finalizedAt;
    const updated = timestampDate(completed ? evaluation?.finalizedAt : evaluation?.updatedAt);
    const reviewer = completed ? evaluation?.finalizedBy : evaluation?.updatedBy;
    if (completed) {
      return `Completed · ${score}/35 · ${band} · ${recommendationLabel(evaluation.recommendation)}${reviewer ? ` · ${reviewer}` : ""}${updated ? ` · ${updated.toLocaleDateString()}` : ""}`;
    }
    if (count) {
      return `Draft · ${count} of 7 scored · ${score}/35${reviewer ? ` · ${reviewer}` : ""}${updated ? ` · Last saved ${updated.toLocaleString()}` : ""}`;
    }
    return "Not started";
  }
  function updateLauncher(pane = current?.__essayPane, item = current, evaluation = state) {
    if (!pane || !item) return;
    const card = pane.querySelector(".essay-launch-wrap");
    if (!card) return;
    const completed = evaluation?.status === "finalized" || evaluation?.finalizedAt;
     const hasDraft = KEYS.some((key) => Number.isInteger(evaluation?.rubric?.[key]));
      const actionLabel = completed ? "View Evaluation" : hasDraft ? "Continue Evaluation" : "Start Essay Evaluation";
      let summaryMarkup = esc(launcherSummary(evaluation));
      if (hasDraft && !completed) {
        const rubric = evaluation?.rubric || emptyState().rubric;
        const score = KEYS.reduce((sum, key) => sum + (Number(rubric[key]) || 0), 0);
        summaryMarkup = `<span class="essay-progress-label">In Progress</span><b class="essay-progress-score">${score}/35</b>`;
      }
     if (completed) {
       const rubric = evaluation?.rubric || emptyState().rubric;
       const score = KEYS.reduce((sum, key) => sum + (Number(rubric[key]) || 0), 0);
        summaryMarkup = `<span class="essay-evaluated-result"><span class="essay-evaluated-label">Evaluated</span><b class="essay-evaluated-score">${score}/35</b></span><span class="essay-evaluated-recommendation">${esc(recommendationLabel(evaluation.recommendation))}</span>`;
     }
      const summaryClass = completed ? "is-completed" : hasDraft ? "is-draft" : "is-not-started";
      card.innerHTML = `<div class="essay-launch-heading"><strong>Evaluation workspace</strong><p class="${summaryClass}">${summaryMarkup}</p></div><button type="button" class="essay-launch ${completed ? "is-completed" : ""}" aria-label="${esc(actionLabel)}">${actionLabel}</button>`;
    card.querySelector("button").addEventListener("click", () => openWorkspace(item, evaluation));
  }

  function renderRubric() {
    const root = dialog.querySelector(".eval-rubric");
    const completed = scoreCount();
    dialog.querySelector(".eval-header-score").textContent = `${completed} of 7 scored · ${total()}/35`;
    const resetButton = dialog.querySelector(".eval-reset");
    if (resetButton) resetButton.hidden = !(Number(state.revision) > 0 || completed > 0 || state.strengths || state.growthAreas || state.concerns || state.recommendation);
    root.querySelector(".eval-meter i").style.width = `${(completed / 7) * 100}%`;
    root.querySelectorAll("[data-key]").forEach((category) => {
      const score = state.rubric[category.dataset.key];
      category.querySelector(".eval-cat-grade").textContent = score ? SCORE_LABELS[score] : "";
      category.querySelector(".eval-cat-score").textContent = score ? `${score}/5` : "Not scored";
      category.classList.toggle("scored", Boolean(score));
      category.querySelectorAll(".eval-score").forEach((button) => {
        const selected = Number(button.dataset.score) === score;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-checked", String(selected));
      });
    });
    root.querySelector("#eval-strengths").value = state.strengths || "";
    root.querySelector("#eval-growth").value = state.growthAreas || "";
    root.querySelector("#eval-concerns").value = state.concerns || "";
    root.querySelectorAll("[data-rec]").forEach((button) => {
      const selected = button.dataset.rec === state.recommendation;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
    });
    dialog.querySelector(".eval-finalize").disabled =
      completed !== 7 || !state.strengths.trim() || !state.growthAreas.trim() || !state.recommendation;
  }

  function rubricMarkup() {
    return `<div class="eval-meter"><i></i></div>${RUBRIC.map((category, index) => {
      const bodyId = `eval-category-${category.key}`;
      return `<section class="eval-category ${index === 0 ? "open" : ""}" data-key="${category.key}"><button class="eval-cat-head" type="button" aria-expanded="${index === 0}" aria-controls="${bodyId}"><span class="eval-cat-num">${index + 1}</span><span class="eval-cat-name">${category.title}</span><span class="eval-cat-grade"></span><span class="eval-cat-score">Not scored</span><span class="eval-chevron" aria-hidden="true">⌄</span></button><div class="eval-cat-body" id="${bodyId}" role="radiogroup" aria-label="${esc(category.title)} score">${[5, 4, 3, 2, 1].map((score) => `<button type="button" class="eval-score" role="radio" aria-checked="false" data-score="${score}"><b>${score}</b><small>${SCORE_LABELS[score]}</small><em>${esc(category.descriptions[score])}</em></button>`).join("")}</div></section>`;
    }).join("")}<div class="eval-fields"><div class="eval-field"><label for="eval-strengths">Strengths <span>Required</span></label><textarea id="eval-strengths" placeholder="What should the student keep doing?"></textarea></div><div class="eval-field"><label for="eval-growth">Areas for growth <span>Required</span></label><textarea id="eval-growth" placeholder="What is the clearest next coaching step?"></textarea></div><div class="eval-field"><label for="eval-concerns">Concerns <span>Optional</span></label><textarea id="eval-concerns" placeholder="Flag anything that needs follow-up."></textarea></div><div class="eval-field"><label id="eval-recommendation-label">Recommendation <span>Required</span></label><div class="eval-recommendation" role="radiogroup" aria-labelledby="eval-recommendation-label">${[["strongly-recommend", "Strongly recommend"], ["recommend", "Recommend"], ["consider", "Consider"], ["do-not-recommend", "Do not recommend at this time"]].map(([value, label]) => `<button type="button" role="radio" aria-checked="false" data-rec="${value}">${label}</button>`).join("")}</div></div></div>`;
  }

  function showSourceState(message, detail, type = "error") {
    const frame = dialog.querySelector(".eval-frame");
    frame.hidden = true;
    const notice = dialog.querySelector(".eval-source-notice");
    notice.className = `eval-source-notice ${type}`;
    notice.innerHTML = `<strong>${esc(message)}</strong><p>${esc(detail)}</p>`;
    notice.hidden = false;
  }
  function loadSource(item) {
    const preview = drivePreview(item.answers?.requiredEssay);
    const source = sourceUrl(item.answers?.requiredEssay);
    dialog.querySelector(".eval-source-open").onclick = () => source && window.open(source, "_blank", "noopener");
    if (!preview) {
      showSourceState("Unable to preview this document.", "No valid Google Drive or Google Docs link was provided with this application.");
      return;
    }
    const frame = dialog.querySelector(".eval-frame");
    const notice = dialog.querySelector(".eval-source-notice");
    notice.hidden = false;
    notice.className = "eval-source-notice loading";
    notice.innerHTML = "<strong>Loading submitted essay</strong><p>Waiting for Google Drive to respond.</p>";
    frame.hidden = true;
    frame.src = preview;
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      showSourceState("Unable to open the essay document.", "Verify the link and sharing permissions allow coaches to view it.");
    };
    const timeout = setTimeout(fail, 15000);
    frame.onload = () => {
      settled = true;
      clearTimeout(timeout);
      notice.hidden = true;
      frame.hidden = false;
    };
    frame.onerror = fail;
  }

  function markDirty() {
    dirty = true;
    changeVersion += 1;
    if (state.status === "finalized" || state.finalizedAt) {
      state.status = "draft";
      state.finalizedAt = null;
    }
    lastSaveError = "";
    setStatus("Unsaved changes", "dirty");
    updateLauncher(current?.__essayPane, current, state);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveDraft(), 700);
  }
  async function saveDraft() {
    if (!dirty || savePromise) return savePromise;
    const savingVersion = changeVersion;
    const savingPayload = payload();
    savePromise = (async () => {
      setStatus("Saving…");
      try {
        const saved = await api("save", current.id, savingPayload);
        lastPersistedEvaluation = {
          ...emptyState(),
          ...saved,
          rubric: { ...emptyState().rubric, ...saved.rubric },
        };
        evaluationCache.set(current.id, lastPersistedEvaluation);
        if (changeVersion === savingVersion) {
          state = { ...lastPersistedEvaluation, rubric: { ...lastPersistedEvaluation.rubric } };
          dirty = false;
        } else {
          state = {
            ...saved,
            ...state,
            revision: saved.revision,
            updatedAt: saved.updatedAt,
            updatedBy: saved.updatedBy,
            rubric: { ...state.rubric },
          };
          dirty = true;
        }
        lastSaveError = "";
        updateLauncher(current.__essayPane, current, state);
        setStatus(dirty ? "Saving newer changes…" : "Saved just now", dirty ? "dirty" : "saved");
      } catch (error) {
        lastSaveError = error.message;
        if (error.remoteEvaluation) showConflict(error.remoteEvaluation);
        setStatus(error.message, "error");
        throw error;
      } finally {
        savePromise = null;
        if (dirty && !lastSaveError) {
          clearTimeout(saveTimer);
          saveTimer = setTimeout(() => saveDraft(), 0);
        }
      }
    })();
    return savePromise;
  }

  function showConflict(remote) {
    const notice = dialog.querySelector(".eval-conflict");
    notice.hidden = false;
    notice.querySelector("p").textContent = "A newer evaluation exists. Your local changes have not been replaced.";
    notice.querySelector(".conflict-reload").onclick = () => {
      state = { ...emptyState(), ...remote, rubric: { ...emptyState().rubric, ...remote.rubric } };
      dirty = false;
      lastSaveError = "";
      lastPersistedEvaluation = {
        ...emptyState(),
        ...remote,
        rubric: { ...emptyState().rubric, ...remote.rubric },
      };
      evaluationCache.set(current.id, lastPersistedEvaluation);
      notice.hidden = true;
      renderRubric();
      updateLauncher(current.__essayPane, current, state);
      setStatus("Latest evaluation loaded", "saved");
    };
    notice.querySelector(".conflict-keep").onclick = () => {
      state.revision = remote?.revision ?? state.revision;
      changeVersion += 1;
      dirty = true;
      lastSaveError = "";
      notice.hidden = true;
      setStatus("Local changes kept · ready to save", "dirty");
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveDraft(), 700);
    };
    notice.querySelector(".conflict-reload").focus();
  }

  async function flushSaves() {
    clearTimeout(saveTimer);
    while (dirty && !lastSaveError) {
      await saveDraft();
    }
  }

  function closeRequest() {
    if (!dirty && !savePromise && !finalizePromise) {
      dialog.close();
      return;
    }
    if (finalizePromise || savePromise || dirty) {
      Promise.resolve(finalizePromise).then(() => flushSaves()).then(() => {
        if (!dirty && !lastSaveError) {
          dialog.close();
        } else {
          showCloseChoice();
        }
      }).catch(() => showCloseChoice());
    }
  }
  function showCloseChoice() {
    const notice = dialog.querySelector(".eval-close-confirm");
    notice.hidden = false;
    notice.querySelector(".close-keep").onclick = () => { notice.hidden = true; };
    notice.querySelector(".close-discard").onclick = () => {
      dirty = false;
      lastSaveError = "";
      clearTimeout(saveTimer);
      const saved = lastPersistedEvaluation || evaluationCache.get(current.id) || emptyState();
      state = { ...emptyState(), ...saved, rubric: { ...emptyState().rubric, ...saved.rubric } };
      updateLauncher(current.__essayPane, current, state);
      dialog.close();
    };
    notice.querySelector(".close-keep").focus();
  }

  async function finalize() {
    if (finalizePromise) return finalizePromise;
    if (scoreCount() !== 7 || !state.strengths.trim() || !state.growthAreas.trim() || !state.recommendation) {
      setStatus("Complete all required fields before finalizing.", "error");
      return;
    }
    clearTimeout(saveTimer);
    finalizePromise = (async () => {
      const rubric = dialog.querySelector(".eval-rubric");
      const finalizeButton = dialog.querySelector(".eval-finalize");
      try {
        if (dirty || savePromise) await flushSaves();
        rubric.inert = true;
        rubric.setAttribute("aria-busy", "true");
        finalizeButton.disabled = true;
        setStatus("Finalizing…");
        const saved = await api("finalize", current.id, payload());
        lastPersistedEvaluation = {
          ...emptyState(),
          ...saved,
          rubric: { ...emptyState().rubric, ...saved.rubric },
        };
        state = { ...lastPersistedEvaluation, rubric: { ...lastPersistedEvaluation.rubric } };
        dirty = false;
        lastSaveError = "";
        evaluationCache.set(current.id, lastPersistedEvaluation);
        updateLauncher(current.__essayPane, current, state);
        setStatus("Completed · edit mode", "saved");
      } catch (error) {
        lastSaveError = error.message;
        if (error.remoteEvaluation) showConflict(error.remoteEvaluation);
        setStatus(error.message, "error");
      } finally {
        rubric.inert = false;
        rubric.setAttribute("aria-busy", "false");
        finalizePromise = null;
        renderRubric();
      }
    })();
    return finalizePromise;
  }

  async function resetEvaluation() {
    if (!state || !current || !await confirmResetEvaluation()) return;
    clearTimeout(saveTimer);
    const resetButton = dialog.querySelector(".eval-reset");
    const rubric = dialog.querySelector(".eval-rubric");
    resetButton.disabled = true;
    rubric.inert = true;
    rubric.setAttribute("aria-busy", "true");
    setStatus("Resetting evaluation…");
    try {
      if (savePromise) await savePromise;
      await api("reset", current.id, { expectedRevision: state.revision ?? 0 });
      state = emptyState();
      lastPersistedEvaluation = null;
      evaluationCache.set(current.id, state);
      dirty = false;
      lastSaveError = "";
      changeVersion = 0;
      updateLauncher(current.__essayPane, current, state);
      dialog.close();
    } catch (error) {
      lastSaveError = error.message;
      if (error.remoteEvaluation) showConflict(error.remoteEvaluation);
      setStatus(error.message, "error");
      resetButton.disabled = false;
      rubric.inert = false;
      rubric.setAttribute("aria-busy", "false");
    }
  }

  function confirmResetEvaluation() {
    const notice = dialog.querySelector(".eval-reset-confirm");
    notice.hidden = false;
    notice.querySelector(".reset-cancel").focus();
    return new Promise((resolve) => {
      notice.querySelector(".reset-cancel").onclick = () => {
        notice.hidden = true;
        resolve(false);
      };
      notice.querySelector(".reset-confirm").onclick = () => {
        notice.hidden = true;
        resolve(true);
      };
    });
  }

  function wire(dialogElement) {
    const root = dialogElement.querySelector(".eval-rubric");
    root.addEventListener("click", (event) => {
      const header = event.target.closest(".eval-cat-head");
      const score = event.target.closest(".eval-score");
      const recommendation = event.target.closest("[data-rec]");
      if (header) {
        const open = header.parentElement.classList.toggle("open");
        header.setAttribute("aria-expanded", String(open));
      } else if (score) {
        state.rubric[score.closest("[data-key]").dataset.key] = Number(score.dataset.score);
        renderRubric();
        const next = KEYS.find((key) => !Number.isInteger(state.rubric[key]));
        root.querySelectorAll(".eval-category").forEach((category) => {
          const open = category.dataset.key === next;
          category.classList.toggle("open", open);
          category.querySelector(".eval-cat-head").setAttribute("aria-expanded", String(open));
        });
        markDirty();
      } else if (recommendation) {
        state.recommendation = recommendation.dataset.rec;
        renderRubric();
        markDirty();
      }
    });
    root.addEventListener("input", (event) => {
      if (event.target.id === "eval-strengths") state.strengths = event.target.value;
      if (event.target.id === "eval-growth") state.growthAreas = event.target.value;
      if (event.target.id === "eval-concerns") state.concerns = event.target.value;
      markDirty();
    });
    dialogElement.querySelector(".eval-close").onclick = closeRequest;
    dialogElement.querySelector(".eval-finalize").onclick = finalize;
    dialogElement.querySelector(".eval-reset").onclick = resetEvaluation;
    dialogElement.addEventListener("cancel", (event) => { event.preventDefault(); closeRequest(); });
    dialogElement.addEventListener("click", (event) => { if (event.target === dialogElement) closeRequest(); });
    dialogElement.querySelectorAll("[data-view]").forEach((button) => {
      button.onclick = () => {
        dialogElement.querySelectorAll("[data-view]").forEach((control) => control.classList.toggle("active", control === button));
        dialogElement.querySelector(".eval-essay").classList.toggle("mobile-hidden", button.dataset.view !== "essay");
        dialogElement.querySelector(".eval-rubric").classList.toggle("mobile-visible", button.dataset.view === "rubric");
      };
    });
    const separator = dialogElement.querySelector(".eval-drag");
    const setSplit = (value) => {
      splitPercent = Math.max(35, Math.min(70, value));
      dialogElement.querySelector(".eval-main").style.gridTemplateColumns = `${splitPercent}fr 6px ${100 - splitPercent}fr`;
      separator.setAttribute("aria-valuenow", String(splitPercent));
    };
    separator.onkeydown = (event) => {
      if (event.key === "ArrowLeft") { event.preventDefault(); setSplit(splitPercent - 2); }
      if (event.key === "ArrowRight") { event.preventDefault(); setSplit(splitPercent + 2); }
    };
    separator.onpointerdown = (event) => {
      separator.setPointerCapture(event.pointerId);
      separator.onpointermove = (move) => {
        const rect = dialogElement.querySelector(".eval-main").getBoundingClientRect();
        setSplit(((move.clientX - rect.left) / rect.width) * 100);
      };
    };
    dialogElement.querySelector(".eval-focus").onclick = () => {
      const main = dialogElement.querySelector(".eval-main");
      const focused = main.classList.toggle("reader-focused");
      dialogElement.querySelector(".eval-focus").textContent = focused ? "Restore split" : "Focus reader";
    };
  }

  async function openWorkspace(item, initialEvaluation = null) {
    current = item;
    state = initialEvaluation
      ? { ...emptyState(), ...initialEvaluation, rubric: { ...emptyState().rubric, ...initialEvaluation.rubric } }
      : emptyState();
    lastPersistedEvaluation = initialEvaluation
      ? { ...emptyState(), ...initialEvaluation, rubric: { ...emptyState().rubric, ...initialEvaluation.rubric } }
      : null;
    dirty = false;
    lastSaveError = "";
    changeVersion = 0;
    dialog?.remove();
    dialog = document.createElement("dialog");
    dialog.className = "essay-eval";
     dialog.innerHTML = `<div class="essay-eval-shell"><header class="essay-eval-head"><div class="essay-eval-identity"><div class="essay-eval-kicker">Evaluation Workspace</div><div class="essay-eval-title">${esc([item.student?.firstName, item.student?.lastName].filter(Boolean).join(" ") || "Applicant")}</div><div class="essay-eval-sub">Read document → Score categories</div></div><div class="eval-head-summary"><strong>Essay Evaluation</strong><span class="eval-header-score">0 of 7 scored · 0/35</span></div><div class="essay-eval-head-actions"><span class="eval-status" aria-live="polite">Loading evaluation…</span><button class="eval-reset" type="button" hidden>Reset evaluation</button><button class="eval-finalize" type="button" disabled>Finalize evaluation</button><button class="eval-close" type="button">Close</button></div></header><div class="eval-mobile-tabs"><button type="button" data-view="essay" class="active">Essay</button><button type="button" data-view="rubric">Rubric</button></div><main class="eval-main"><section class="eval-column eval-essay"><div class="eval-essay-inner"><div class="eval-essay-bar"><span>Submitted document</span><span><button type="button" class="eval-source-open">Open source</button><button type="button" class="eval-focus">Focus reader</button></span></div><div class="eval-source-notice loading"><strong>Loading submitted essay</strong><p>Waiting for Google Drive to respond.</p></div><iframe class="eval-frame" title="Submitted essay document" hidden></iframe></div></section><div class="eval-drag" role="separator" tabindex="0" aria-orientation="vertical" aria-valuemin="35" aria-valuemax="70" aria-valuenow="58" aria-label="Adjust essay and rubric divider"></div><section class="eval-column eval-rubric" aria-busy="true" inert>${rubricMarkup()}</section></main><div class="eval-conflict" role="alertdialog" aria-modal="true" aria-labelledby="eval-conflict-title" hidden><strong id="eval-conflict-title">Evaluation conflict</strong><p></p><button type="button" class="conflict-reload">Reload latest</button><button type="button" class="conflict-keep">Keep editing</button></div><div class="eval-close-confirm" role="alertdialog" aria-modal="true" aria-labelledby="eval-close-title" hidden><strong id="eval-close-title">Unsaved evaluation changes</strong><p>Your changes could not be saved.</p><button type="button" class="close-keep">Keep editing</button><button type="button" class="close-discard">Close without saving</button></div><div class="eval-reset-confirm" role="alertdialog" aria-modal="true" aria-labelledby="eval-reset-title" hidden><strong id="eval-reset-title">Reset essay evaluation?</strong><p>All rubric scores, notes, and the recommendation will be permanently cleared. This cannot be undone.</p><button type="button" class="reset-cancel">Keep evaluation</button><button type="button" class="reset-confirm">Reset evaluation</button></div></div>`;
    document.body.appendChild(dialog);
    dialog.showModal();
    wire(dialog);
    loadSource(item);
    renderRubric();
    try {
      const evaluation = await loadEvaluation(item.id, { force: true });
      if (current !== item || !dialog?.isConnected) return;
      state = { ...emptyState(), ...evaluation, rubric: { ...emptyState().rubric, ...evaluation.rubric } };
      lastPersistedEvaluation = {
        ...emptyState(),
        ...evaluation,
        rubric: { ...emptyState().rubric, ...evaluation.rubric },
      };
      dialog.querySelector(".eval-rubric").inert = false;
      dialog.querySelector(".eval-rubric").setAttribute("aria-busy", "false");
      renderRubric();
      updateLauncher(item.__essayPane, item, state);
      setStatus(state.status === "finalized" ? "Completed · edit mode" : scoreCount() ? "Draft loaded" : "Not started");
    } catch (error) {
      dialog.querySelector(".eval-rubric").inert = false;
      dialog.querySelector(".eval-rubric").setAttribute("aria-busy", "false");
      setStatus(error.message, "error");
    }
    dialog.addEventListener("close", () => { dialog.remove(); dialog = null; }, { once: true });
  }

  window.addEventListener("cooper:essay-ready", (event) => {
    const pane = event.detail.pane;
    const item = event.detail.item;
    item.__essayPane = pane;
    const wrapper = document.createElement("div");
    wrapper.className = "essay-launch-wrap";
    (pane.querySelector(".essay-reference-launch-content") || pane.querySelector(".essay-reference-launch") || pane).appendChild(wrapper);
    updateLauncher(pane, item, evaluationCache.get(item.id) || emptyState());
    loadEvaluation(item.id)
      .then((evaluation) => {
        if (pane.isConnected) updateLauncher(pane, item, evaluation);
      })
      .catch(() => {
        if (!pane.isConnected) return;
        wrapper.classList.add("status-unavailable");
        wrapper.querySelector("p")?.remove();
      });
  });

  window.addEventListener("beforeunload", (event) => {
    if (!dirty && !savePromise && !finalizePromise && !lastSaveError) return;
    event.preventDefault();
    event.returnValue = "";
  });
})();