(function () {
  "use strict";
  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyD0LYz6AAdiOKIrZ8cmaJEpfHBuYfm_TSc",
    authDomain: "cooper-debate-team.firebaseapp.com",
    projectId: "cooper-debate-team",
    appId: "1:112813790184:web:ac559cb64747d7fd590a5d"
  };
  var ENDPOINT = "https://us-central1-cooper-debate-team.cloudfunctions.net/debateWork";
  var TOPIC = "2026-data-centers";
  var STAGES = [
    ["prep", "Prep", "Get ready", "Understand the resolution before building your case."],
    ["constructive", "Constructive", "4 min speaking time", "State your position, define the problem, and make your clearest first claim."],
    ["crossfire", "Crossfire", "3 min speaking time", "Ask focused questions that test the other side's assumptions. Answer in one precise thought."],
    ["rebuttal", "Rebuttal", "4 min speaking time", "Answer the strongest opposing argument and explain why your evidence matters."],
    ["summary", "Summary", "2 min speaking time", "Weigh the round. Which issue matters most, and why does your side win it?"],
    ["finalFocus", "Final Focus", "2 min speaking time", "Leave the judge with one memorable reason to vote for your position."]
  ];
  var ROUND_STAGES = STAGES.slice(1);
  var $ = function (id) { return document.getElementById(id); };
  var token = sessionStorage.getItem("cooper-debate-session") || "";
  var works = [];
  var current = null;
  var currentStage = "prep";
  var pace = 150;
  var saveTimer = null;
  var autoSaveInFlight = false;
  var autoSaveQueued = false;
  var studentIdentity = token ? token.split(".")[0].slice(0, 24) : "session";
  var studentProfile = {};
  try { studentProfile = JSON.parse(sessionStorage.getItem("cooper-debate-profile") || "{}"); } catch (_) {}
  if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  var auth = firebase.auth();

  function emptyStages() {
    var result = {};
    STAGES.forEach(function (stage) { result[stage[0]] = { content: "", notes: "", sources: [], completed: false }; });
    return result;
  }
  function wordCount(text) { return (text || "").trim() ? (text || "").trim().split(/\s+/).length : 0; }
  function textFromHtml(html) { var node = document.createElement("div"); node.innerHTML = html || ""; return node.textContent || ""; }
  function escape(text) { return String(text || "").replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]; }); }
  function status(work) { return !work ? "Not started" : work.status === "submitted" ? "Submitted for review" : "In progress"; }
  function progress(work) { return work ? ROUND_STAGES.filter(function (s) { return work.stages && work.stages[s[0]] && (work.stages[s[0]].content || work.stages[s[0]].completed); }).length : 0; }
  function localKey(work) { return "cooper-debate-unsaved:" + studentIdentity + ":" + (work.id || (TOPIC + ":" + work.side)); }
  function showError(id, message) { var el = $(id); el.textContent = message || ""; el.hidden = !message; }
  function setAutoSaveStatus(text, state) {
    var status = $("autosaveStatus");
    status.textContent = text;
    status.className = "autosave-status" + (state ? " " + state : "");
  }
  function savedTime(value) {
    var date = value ? new Date(value) : new Date();
    return isNaN(date.getTime()) ? new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  function sanitizeRichHtml(html) {
    var template = document.createElement("template");
    template.innerHTML = typeof html === "string" ? html : "";
    var allowed = { P: 1, BR: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, UL: 1, OL: 1, LI: 1 };
    Array.prototype.slice.call(template.content.querySelectorAll("*")).forEach(function (node) {
      if (!allowed[node.tagName]) {
        node.replaceWith(document.createTextNode(node.textContent || ""));
        return;
      }
      Array.prototype.slice.call(node.attributes).forEach(function (attribute) { node.removeAttribute(attribute.name); });
    });
    return template.innerHTML;
  }
  function isEditable(work) {
    return !(work && work.status === "submitted") ||
      (work.feedback && work.feedback.status === "needs-revision");
  }
  function fcpsIdFromEmail(email) {
    var normalized = String(email || "").trim().toLowerCase();
    if (normalized === "hannahbshiv@gmail.com") return "1806950";
    var localPart = normalized.split("@")[0] || "";
    return /^\d{7}$/.test(localPart) ? localPart : "";
  }
  function setStudentProfile(profile) {
    studentProfile = Object.assign({}, studentProfile, profile || {});
    try { sessionStorage.setItem("cooper-debate-profile", JSON.stringify(studentProfile)); } catch (_) {}
    $("studentName").textContent = studentProfile.displayName || "Student";
    $("studentFcpsId").textContent = studentProfile.fcpsId || "—";
  }
  function updateSessionFacts() {
    $("studentSide").textContent = current && current.side ? current.side : "Not selected";
    $("workMode").textContent = current && current.status === "submitted"
      ? "Submitted"
      : current && current.feedback && current.feedback.status === "needs-revision"
        ? "Revision"
        : "Draft";
  }

  async function request(action, body) {
    var response = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ action: action, topicId: TOPIC, sessionToken: token }, body || {})) });
    var data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok || data.ok === false) throw new Error(data.error || "The debate-work service is unavailable. Try again.");
    return data;
  }
  function normalizeWork(work, side) {
    var value = work || { topicId: TOPIC, side: side, title: "", resolution: "", stages: emptyStages(), revision: 0 };
    value.stages = Object.assign(emptyStages(), value.stages || {});
    return value;
  }
  function readLocal(work) {
    try {
      var saved = JSON.parse(localStorage.getItem(localKey(work)) || "null");
      if (saved && saved.stages) {
        if (!work || !work.revision || saved.baseRevision === Number(work.revision)) return Object.assign({}, work, saved);
        if (window.confirm("Unsaved local work has revision " + saved.baseRevision + ", while the server has revision " + work.revision + ". Restore the local copy? Choose Cancel to use the server copy.")) return Object.assign({}, work, saved);
      }
    } catch (_) {}
    return work;
  }
  function writeLocal() {
    if (!current) return;
    try { localStorage.setItem(localKey(current), JSON.stringify({ title: current.title, stages: current.stages, baseRevision: Number(current.revision || 0), savedAt: Date.now() })); } catch (_) {}
  }
  function clearLocal(work) { try { localStorage.removeItem(localKey(work)); } catch (_) {} }
  function renderCards() {
    var container = $("workCards");
    container.innerHTML = ["PRO", "CON"].map(function (side) {
      var work = works.filter(function (item) { return item.side === side; })[0] || null;
      var count = progress(work);
      return '<button class="work-card ' + side.toLowerCase() + '" data-side="' + side + '" type="button"><div class="work-card-top"><div class="work-art"><img src="images/debate-courthouse-' + side.toLowerCase() + '.png" alt=""></div><span class="work-card-divider" aria-hidden="true"></span><div class="work-card-heading"><span class="eyebrow">' + side + ' · ' + (side === "PRO" ? "Support" : "Oppose") + '</span><h3>' + side + '</h3></div></div><div class="work-card-details"><p>' + (work ? status(work) : "Start a new side") + ' · ' + count + ' of 5 stages touched</p><div class="progress"><span style="width:' + (count / 5 * 100) + '%"></span></div><div class="card-meta"><span>' + (work && work.updatedAt ? "Updated recently" : "Ready when you are") + '</span><strong>Open side →</strong></div></div></button>';
    }).join("");
    Array.prototype.forEach.call(container.querySelectorAll("[data-side]"), function (button) { button.addEventListener("click", function () { openSide(button.dataset.side); }); });
  }
  async function loadWorks() {
    showError("listError", "");
    $("workCards").innerHTML = '<div class="loading">Loading your debate work…</div>';
    try {
      var response = await request("listStudentWorks");
      works = (response.works || []).map(function (work) { return normalizeWork(work, work.side); });
      renderCards();
    } catch (error) {
      if (/session|token|auth|expired|recognized/i.test(error.message)) {
        token = ""; sessionStorage.removeItem("cooper-debate-session"); $("gate").hidden = false; $("appView").hidden = true; $("identity").hidden = true;
        showError("authError", "Your session expired. Sign in with your FCPS Google account again.");
      }
      $("workCards").innerHTML = "";
      showError("listError", error.message);
    }
  }
  function stageFor(key) { return STAGES.filter(function (stage) { return stage[0] === key; })[0]; }
  function prepData(content) {
    var value = {};
    try { value = JSON.parse(content || "{}"); } catch (_) {}
    value = Object.assign({ qHyperscale: "", qMoratorium: "", qFederal: "", qIssues: "", qNuances: "", qImpacts: "", proEvidence: "", conEvidence: "", proArgument: "", conArgument: "" }, value);
    if (!value.qHyperscale && value.definitions) value.qHyperscale = value.definitions;
    if (!value.qImpacts && value.impacts) value.qImpacts = value.impacts;
    if (!value.proArgument && value.proArguments) value.proArgument = value.proArguments;
    if (!value.conArgument && value.conArguments) value.conArgument = value.conArguments;
    return value;
  }
  function updatePrepReady() {
    if (!$("prepReady") || currentStage !== "prep") return;
    var values = prepData(current.stages.prep.content);
    var required = ["qHyperscale", "qMoratorium", "qFederal", "qIssues", "qNuances", "qImpacts", "proEvidence", "conEvidence", "proArgument", "conArgument"];
    var complete = required.every(function (key) { return String(values[key] || "").trim(); });
    $("prepReady").classList.toggle("ready", complete);
    $("prepReady").textContent = complete ? "Ready for Constructive" : "Keep thinking and researching";
  }
  function renderPrep(data, readOnly, feedbackNote) {
    var values = prepData(data.content);
    function question(key, number, label, placeholder) {
      return '<label class="prep-question"><span>' + number + '. ' + label + '</span><textarea data-prep="' + key + '" placeholder="' + placeholder + '"' + (readOnly ? ' disabled' : '') + '>' + escape(values[key]) + '</textarea></label>';
    }
    $("stageContent").innerHTML = feedbackNote + (readOnly ? '<div class="notice">Submitted for review. This preparation is read-only until a coach requests revisions.</div>' : '') +
      '<section class="prep-intro"><div><div class="eyebrow">Prep · Understand the Resolution</div><h3>Think. Research. Organize.</h3><p>This is an ungraded thinking exercise, not part of coach review.</p></div><div class="prep-resolution">The United States federal government should enact a moratorium on hyperscale data center construction.</div></section>' +
      '<section class="prep-section"><div class="prep-section-head"><h4>Quick preparation worksheet</h4><p>Questions 1–6 are shared between PRO and CON.</p></div><div class="prep-question-grid">' +
      question("qHyperscale", "1", "What is a hyperscale data center?", "Type your answer…") +
      question("qMoratorium", "2", "What does “moratorium” mean?", "Type your answer…") +
      question("qFederal", "3", "Why does the resolution specify the federal government?", "Type your answer…") +
      question("qIssues", "4", "What are the core issues in this debate?", "Type your answer…") +
      question("qNuances", "5", "What are some important nuances?", "Type your answer…") +
      question("qImpacts", "6", "What are the potential impacts?", "Type your answer…") +
      '</div><div class="prep-side-grid"><section class="prep-side-card pro"><h5>PRO PREPARATION</h5><div class="prep-side-fields">' +
      question("proEvidence", "7", "What evidence could support PRO?", "Key PRO evidence…") +
      question("proArgument", "8", "What is your strongest PRO argument?", "Strongest PRO argument…") +
      '</div></section><section class="prep-side-card con"><h5>CON PREPARATION</h5><div class="prep-side-fields">' +
      question("conEvidence", "7", "What evidence could support CON?", "Key CON evidence…") +
      question("conArgument", "8", "What is your strongest CON argument?", "Strongest CON argument…") +
      '</div></section></div></section>';
    Array.prototype.forEach.call($("stageContent").querySelectorAll("[data-prep]"), function (input) { input.addEventListener("input", function () { capture(); updatePrepReady(); scheduleSave(); }); });
    updatePrepReady();
  }
  function renderStage() {
    if (!current) return;
    var stage = stageFor(currentStage), data = current.stages[currentStage] || { content: "" };
    var readOnly = !isEditable(current);
    var feedback = current.feedback && typeof current.feedback === "object" ? current.feedback : null;
    var feedbackNote = feedback && (feedback.note || feedback.nextStep || feedback.status)
      ? '<div class="notice"><strong>Coach review · ' + escape(feedback.status || "Feedback") + '</strong>' +
        (feedback.note ? '<br><span>' + escape(feedback.note) + '</span>' : '') +
        (feedback.nextStep ? '<br><b>Next step:</b> ' + escape(feedback.nextStep) : '') + '</div>' : "";
    $("studioTitle").textContent = stage[1];
    $("stageTabs").innerHTML = STAGES.map(function (item) { var done = current.stages[item[0]] && current.stages[item[0]].content; var duration = item[0] === "prep" ? item[2] : item[2].replace(" speaking time", " of speaking time"); return '<button class="stage-tab stage-' + item[0].replace(/[A-Z]/g, function (letter) { return "-" + letter.toLowerCase(); }) + ' ' + (item[0] === currentStage ? "active" : "") + '" data-stage="' + item[0] + '" type="button"><strong>' + item[1] + ' · ' + duration + '</strong><small>' + (done ? "Draft started" : "Not started") + '</small></button>'; }).join("");
    if (currentStage === "prep") {
      renderPrep(data, readOnly, feedbackNote);
    } else if (currentStage === "crossfire") {
      var pairs = [];
      try { pairs = JSON.parse(data.content || "[]"); } catch (_) {}
      if (!Array.isArray(pairs) || !pairs.length) pairs = [{ q: "", a: "" }];
      $("stageContent").innerHTML = feedbackNote + (readOnly ? '<div class="notice">Submitted for review. This work is read-only until a coach requests revisions.</div>' : '') + '<h3>Crossfire practice</h3><p class="prompt">' + stage[3] + '</p><div class="crossfire">' + pairs.map(function (pair, index) { return '<div class="cross-row"><label>Question ' + (index + 1) + '<textarea data-cf-q' + (readOnly ? ' disabled' : '') + '>' + escape(pair.q) + '</textarea></label><label>Answer ' + (index + 1) + '<textarea data-cf-a' + (readOnly ? ' disabled' : '') + '>' + escape(pair.a) + '</textarea></label></div>'; }).join("") + (readOnly ? '' : '<button class="btn" id="addQuestion" type="button">Add question</button>') + '</div>';
      if ($("addQuestion")) $("addQuestion").addEventListener("click", function () { capture(); current.stages.crossfire.content = JSON.stringify((JSON.parse(current.stages.crossfire.content || "[]") || []).concat([{ q: "", a: "" }])); renderStage(); scheduleSave(); });
      Array.prototype.forEach.call($("stageContent").querySelectorAll("[data-cf-q],[data-cf-a]"), function (field) { field.addEventListener("input", function () { capture(); updateStats(); scheduleSave(); }); });
    } else {
      $("stageContent").innerHTML = feedbackNote + (readOnly ? '<div class="notice">Submitted for review. This speech is read-only until a coach requests revisions.</div>' : '') + '<h3>' + stage[1] + '</h3><p class="prompt">' + stage[3] + '</p><div class="toolbar" role="toolbar" aria-label="Speech formatting"><button type="button" data-command="bold" title="Bold" aria-label="Bold"' + (readOnly ? " disabled" : "") + '><strong>B</strong></button><button type="button" data-command="italic" title="Italic" aria-label="Italic"' + (readOnly ? " disabled" : "") + '><em>I</em></button><button type="button" data-command="underline" title="Underline" aria-label="Underline"' + (readOnly ? " disabled" : "") + '><u>U</u></button><span class="toolbar-divider" aria-hidden="true"></span><button type="button" data-command="insertUnorderedList" title="Bullet list" aria-label="Bullet list"' + (readOnly ? " disabled" : "") + '><span aria-hidden="true">• List</span></button><button type="button" data-command="insertOrderedList" title="Numbered list" aria-label="Numbered list"' + (readOnly ? " disabled" : "") + '><span aria-hidden="true">1. List</span></button><span class="toolbar-divider" aria-hidden="true"></span><button type="button" data-command="undo" title="Undo" aria-label="Undo"' + (readOnly ? " disabled" : "") + '>↶</button><button type="button" data-command="redo" title="Redo" aria-label="Redo"' + (readOnly ? " disabled" : "") + '>↷</button><button type="button" data-command="removeFormat" title="Clear formatting" aria-label="Clear formatting"' + (readOnly ? " disabled" : "") + '>Clear</button></div><div class="editor" id="editor" contenteditable="' + (!readOnly) + '" role="textbox" aria-label="' + stage[1] + ' speech editor" data-placeholder="Start writing your ' + stage[1].toLowerCase() + '…">' + sanitizeRichHtml(data.content) + '</div>';
      Array.prototype.forEach.call($("stageContent").querySelectorAll("[data-command]"), function (button) { button.addEventListener("mousedown", function (event) { event.preventDefault(); }); button.addEventListener("click", function () { $("editor").focus(); document.execCommand(button.dataset.command, false, null); capture(); updateStats(); scheduleSave(); }); });
      $("editor").addEventListener("input", function () { capture(); updateStats(); scheduleSave(); });
    }
    $("submitWork").disabled = readOnly;
    $("editorLayout").classList.toggle("prep-layout", currentStage === "prep");
    $("prepActions").hidden = currentStage !== "prep";
    $("reviewActions").hidden = currentStage === "prep";
    $("savePrep").disabled = readOnly;
    $("stageContent").classList.remove("stage-changing");
    void $("stageContent").offsetWidth;
    $("stageContent").classList.add("stage-changing");
    updateStats();
  }
  function capture() {
    if (!current) return;
    if (currentStage === "prep") {
      var values = prepData(current.stages.prep.content);
      Array.prototype.forEach.call(document.querySelectorAll("[data-prep]"), function (field) { values[field.dataset.prep] = field.value; });
      current.stages.prep.content = JSON.stringify(values);
      works.forEach(function (work) { if (work !== current && work.stages) work.stages.prep = JSON.parse(JSON.stringify(current.stages.prep)); });
    } else if (currentStage === "crossfire") {
      var pairs = Array.prototype.map.call(document.querySelectorAll("[data-cf-q]"), function (q, index) { var answers = document.querySelectorAll("[data-cf-a]"); return { q: q.value, a: answers[index] ? answers[index].value : "" }; });
      current.stages.crossfire.content = JSON.stringify(pairs);
    } else if ($("editor")) current.stages[currentStage].content = $("editor").innerHTML;
    writeLocal();
  }
  function updateStats() {
    if (currentStage === "prep") {
      var prepText = Object.keys(prepData(current.stages.prep.content)).map(function (key) { return prepData(current.stages.prep.content)[key]; }).join(" ");
      $("wordLabel").textContent = "Prep words"; $("charLabel").textContent = "Round status"; $("paceMetric").hidden = true;
      $("wordStat").textContent = wordCount(prepText).toLocaleString(); $("charStat").textContent = "Before the timer"; $("timeStat").textContent = "Untimed"; return;
    }
    if (currentStage === "crossfire") {
      var pairs = []; try { pairs = JSON.parse((current && current.stages.crossfire.content) || "[]"); } catch (_) {}
      $("wordLabel").textContent = "Prepared pairs"; $("charLabel").textContent = "Speech metrics"; $("paceMetric").hidden = true;
      $("wordStat").textContent = pairs.filter(function (pair) { return pair.q || pair.a; }).length;
      $("charStat").textContent = "Not used"; $("timeStat").textContent = "3:00 target"; return;
    }
    $("wordLabel").textContent = "Words"; $("charLabel").textContent = "Characters"; $("paceMetric").hidden = false;
    var text = textFromHtml((current && current.stages[currentStage] && current.stages[currentStage].content) || "");
    var words = wordCount(text), chars = text.replace(/\s/g, "").length;
    var targetMinutes = Number(stageFor(currentStage)[2].split(" ")[0]) || 0;
    var currentMinutes = words / pace;
    var currentLabel = Math.floor(currentMinutes) + ":" + String(Math.round(currentMinutes % 1 * 60)).padStart(2, "0");
    var guidance = currentMinutes > targetMinutes ? " · Over target" : currentMinutes > targetMinutes * .8 ? " · On pace" : " · Under target";
    $("wordStat").textContent = words.toLocaleString(); $("charStat").textContent = chars.toLocaleString(); $("timeStat").textContent = currentLabel + " / " + targetMinutes + ":00" + guidance;
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    writeLocal();
    setAutoSaveStatus("Saving…", "saving");
    saveTimer = setTimeout(autoSaveDraft, 1200);
  }
  async function autoSaveDraft() {
    if (!current || !isEditable(current)) return;
    if (autoSaveInFlight) { autoSaveQueued = true; return; }
    autoSaveInFlight = true;
    autoSaveQueued = false;
    $("submitWork").disabled = true;
    capture();
    var savingSide = current.side;
    var expectedRevision = Number(current.revision || 0);
    var snapshot = JSON.parse(JSON.stringify({ topicId: TOPIC, side: current.side, title: current.title || "", resolution: current.resolution || "", stages: current.stages }));
    try {
      var response = await request("saveStudentWork", { expectedRevision: expectedRevision, work: snapshot });
      if (current && current.side === savingSide) {
        current.revision = Number(response.work.revision || current.revision || 0);
        current.updatedAt = response.work.updatedAt || new Date().toISOString();
        works = works.filter(function (work) { return work.side !== current.side; }).concat([current]);
        if (!autoSaveQueued) clearLocal(current);
        setAutoSaveStatus("Saved last: " + savedTime(current.updatedAt), "");
        showError("saveError", "");
      }
    } catch (error) {
      setAutoSaveStatus("Draft not saved", "failed");
      showError("saveError", error.message + " Your local unsaved work remains on this device.");
    }
    autoSaveInFlight = false;
    $("submitWork").disabled = !current || !isEditable(current);
    if (autoSaveQueued) { autoSaveQueued = false; autoSaveDraft(); }
  }
  async function save(submit) {
    if (!current) return;
    clearTimeout(saveTimer); capture(); showError("saveError", ""); $("submitWork").disabled = true;
    try {
      var response = await request(submit ? "submitStudentWork" : "saveStudentWork", { expectedRevision: Number(current.revision || 0), work: { topicId: TOPIC, side: current.side, title: current.title || "", resolution: current.resolution || "", stages: current.stages } });
      current = normalizeWork(response.work, current.side); works = works.filter(function (w) { return w.side !== current.side; }).concat([current]); clearLocal(current); updateSessionFacts(); renderCards(); renderStage();
    } catch (error) { showError("saveError", error.message + " Your local unsaved work remains on this device."); }
    $("submitWork").disabled = false;
  }
  async function openSide(side) {
    try {
      var found = works.filter(function (work) { return work.side === side; })[0] || null;
      if (!found) { var response = await request("getStudentWork", { side: side }); found = response.work; }
       current = readLocal(normalizeWork(found, side));
       var sharedPrep = works.filter(function (work) { return work.stages && work.stages.prep && work.stages.prep.content; }).sort(function (a, b) { return String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")); })[0];
       if (sharedPrep) current.stages.prep = JSON.parse(JSON.stringify(sharedPrep.stages.prep));
       currentStage = "prep"; updateSessionFacts(); setAutoSaveStatus(current.updatedAt ? "Saved last: " + savedTime(current.updatedAt) : "Saved last: —", ""); $("studio").hidden = false; $("positionHeader").hidden = true; $("positionHeader").style.display = "none"; $("positionDashboard").hidden = true; $("positionDashboard").style.display = "none"; $("studio").scrollIntoView({ behavior: "smooth", block: "start" }); $("sideEyebrow").textContent = side + " · " + (side === "PRO" ? "Support the resolution" : "Oppose the resolution"); renderStage();
    } catch (error) { showError("listError", error.message); }
  }
  $("googleSignIn").addEventListener("click", async function () {
    showError("authError", "");
    var button = $("googleSignIn"); button.disabled = true;
    try {
      await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
      var provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      var signIn = await auth.signInWithPopup(provider);
      var idToken = await signIn.user.getIdToken();
      var response = await request("authenticate", { idToken: idToken, sessionToken: undefined });
      token = response.sessionToken;
      studentIdentity = response.student.id || token.split(".")[0].slice(0, 24);
      sessionStorage.setItem("cooper-debate-session", token);
      setStudentProfile({
        displayName: response.student.displayName || signIn.user.displayName || "Student",
        fcpsId: fcpsIdFromEmail(signIn.user.email)
      });
      $("gate").hidden = true; $("appView").hidden = false; $("identity").hidden = false;
      updateSessionFacts();
      await loadWorks();
    } catch (error) {
      token = ""; sessionStorage.removeItem("cooper-debate-session");
      if (!/popup-closed-by-user|cancelled-popup-request/i.test(error.code || "")) showError("authError", error.message);
      try { await auth.signOut(); } catch (_) {}
    }
    button.disabled = false;
  });
  $("refreshWorks").addEventListener("click", loadWorks);
  $("stageTabs").addEventListener("click", function (event) {
    var button = event.target.closest("[data-stage]");
    if (!button || !$("stageTabs").contains(button) || button.dataset.stage === currentStage) return;
    event.preventDefault();
    try {
      capture();
    } catch (error) {
      console.error("Could not capture the current stage before switching.", error);
      showError("saveError", "The current stage could not be saved locally, but you can continue working in the other tabs.");
    }
    currentStage = button.dataset.stage;
    renderStage();
  });
  $("backToSides").addEventListener("click", function () { clearTimeout(saveTimer); capture(); current = null; updateSessionFacts(); $("studio").hidden = true; $("positionHeader").hidden = false; $("positionHeader").style.display = ""; $("positionDashboard").hidden = false; $("positionDashboard").style.display = ""; renderCards(); });
  $("submitWork").textContent = "Submit to coach for review";
  $("submitWork").addEventListener("click", function () { if (window.confirm("Submit this side for coach review? It will be read-only unless a coach requests revisions.")) save(true); });
  $("savePrep").addEventListener("click", async function () {
    $("prepSaveConfirmation").hidden = true;
    await save(false);
    if (!$("saveError").textContent) {
      $("prepSaveConfirmation").hidden = false;
      setTimeout(function () { $("prepSaveConfirmation").hidden = true; }, 2200);
    }
  });
  $("signOut").addEventListener("click", function () { sessionStorage.removeItem("cooper-debate-session"); sessionStorage.removeItem("cooper-debate-profile"); auth.signOut().finally(function () { window.location.reload(); }); });
  Array.prototype.forEach.call(document.querySelectorAll("[data-pace]"), function (button) { button.addEventListener("click", function () { pace = Number(button.dataset.pace); document.querySelectorAll("[data-pace]").forEach(function (b) { b.classList.toggle("selected", b === button); }); updateStats(); }); });
  auth.onAuthStateChanged(function (user) {
    if (!token || !user) return;
    setStudentProfile({
      displayName: studentProfile.displayName || user.displayName || "Student",
      fcpsId: studentProfile.fcpsId || fcpsIdFromEmail(user.email)
    });
  });
  if (token) { setStudentProfile(studentProfile); updateSessionFacts(); $("gate").hidden = true; $("appView").hidden = false; $("identity").hidden = false; loadWorks(); }
}());