/* Member-only resource directory. Links and counts come from Firestore, never from the markup. */
(function () {
  "use strict";

  const CATEGORIES = {
    briefs: "Briefs & Case Files",
    flows: "Flows & Notes",
    research: "Research Materials",
    tournaments: "Tournaments & Prep",
    training: "Training & Skills",
    team: "Team Information",
    official: "Official Team Documents"
  };
  const $ = (id) => document.getElementById(id);
  const stamp = () => firebase.firestore.FieldValue.serverTimestamp();
  let started = false;
  let resources = [];
  let loaded = false;
  let listenerError = "";
  let resourceUnsubscribe = null;
  let requestUnsubscribe = null;

  function role() {
    return window.currentPortalRole ||
      (typeof window.getAdminRole === "function" ? window.getAdminRole(email()) : "member");
  }
  function manager() { return role() === "coach" || role() === "website-admin" || role() === "captain"; }
  function email() { return (firebase.auth().currentUser?.email || "").toLowerCase(); }
  function safeUrl(value) {
    try {
      const url = new URL(value);
      return /^https?:$/.test(url.protocol) && !url.username && !url.password && !/\s/.test(value) ? url.href : "";
    } catch (_) { return ""; }
  }
  function dateValue(value) {
    return value && typeof value.toDate === "function" ? value.toDate().getTime() : 0;
  }
  function formatDate(value) {
    const time = dateValue(value);
    return time ? new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Just added";
  }
  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function validResource(resource) {
    return resource && CATEGORIES[resource.category] && typeof resource.title === "string" &&
      typeof resource.url === "string" && safeUrl(resource.url);
  }
  function activeResources() { return resources.filter(item => item.isActive === true && validResource(item)); }
  function recentOrder(a, b) {
    return dateValue(b.updatedAt || b.createdAt) - dateValue(a.updatedAt || a.createdAt);
  }
  function addedOrder(a, b) {
    return dateValue(b.createdAt) - dateValue(a.createdAt);
  }
  function linkFor(resource, className, label) {
    const a = node("a", className, label);
    a.href = safeUrl(resource.url);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  }

  function route(category, push) {
    const selected = category === "all" || CATEGORIES[category] ? category : "home";
    if (push) {
      const url = new URL(location.href);
      if (selected === "home") url.searchParams.delete("library");
      else url.searchParams.set("library", selected);
      history.pushState({}, "", url);
    }
    $("resources-landing").hidden = selected !== "home";
    $("resource-library").hidden = selected === "home";
    if (selected !== "home") {
      $("library-title").textContent = selected === "all" ? "Resource Library" : CATEGORIES[selected];
      $("resource-library").dataset.category = selected;
      renderLibrary();
    }
    $("rl-management").hidden = !manager() || selected !== "home";
    if (push) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderCounts() {
    for (const [category] of Object.entries(CATEGORIES)) {
      const count = activeResources().filter(item => item.category === category).length;
      const element = document.querySelector(`[data-count="${category}"]`);
      if (element) element.textContent = `${count} resource${count === 1 ? "" : "s"}`;
    }
  }

  function renderRecent() {
    const target = $("rl-recent-list");
    target.replaceChildren();
    if (listenerError) {
      target.append(node("p", "rl-empty rl-error", listenerError));
      return;
    }
    const recent = activeResources().sort(addedOrder).slice(0, 5);
    if (!recent.length) {
      target.append(node("p", "rl-empty", loaded ? "No resources have been added yet. A coach, website admin, or captain can add the first link from Manage Resources." : "Loading recent resources…"));
      return;
    }
    for (const resource of recent) {
      const row = node("div", "rl-recent-row");
      row.append(node("span", "rl-doc-icon", "▤"));
      const age = Date.now() - dateValue(resource.createdAt);
      if (age >= 0 && age < 7 * 86400000) {
        const changed = dateValue(resource.updatedAt) - dateValue(resource.createdAt) > 60000;
        row.append(node("span", `rl-badge ${changed ? "rl-updated" : ""}`, changed ? "UPDATED" : "NEW"));
      }
      const copy = node("span", "rl-row-copy");
      copy.append(node("strong", "", resource.title), node("small", "", resource.description || CATEGORIES[resource.category]));
      row.append(copy, node("time", "", formatDate(resource.createdAt)), linkFor(resource, "rl-view", "View →"));
      target.append(row);
    }
  }

  function renderOfficial() {
    const list = $("rl-official-list");
    list.querySelectorAll(".rl-doc-link, [data-dynamic='true']").forEach(element => element.remove());
    list.querySelectorAll("[data-official]").forEach(element => element.classList.remove("has-link"));
    const hiddenOfficialTitles = new Set(["position descriptions", "tournament sign-up sheet"]);
    const official = activeResources().filter(item =>
      item.category === "official" && !hiddenOfficialTitles.has(item.title.trim().toLowerCase())
    ).sort(recentOrder);
    for (const resource of official) {
      let placeholder = Array.from(list.querySelectorAll("[data-official]"))
        .find(element => element.dataset.official.toLowerCase() === resource.title.toLowerCase());
      if (!placeholder && /^october 24 tournament/i.test(resource.title)) {
        placeholder = list.querySelector("[data-official='October 24 Tournament Day Details']");
      }
      // Keep authenticated PDF actions when another link shares their title.
      if (placeholder?.dataset.official === "October 24 Tournament Day Details" ||
          placeholder?.dataset.official === "2026–27 Membership Contract") placeholder = null;
      const entry = placeholder || node("li", "");
      if (!placeholder) { entry.dataset.dynamic = "true"; list.append(entry); }
      entry.classList.add("has-link");
      const a = linkFor(resource, "rl-doc-link");
      a.append(node("span", "rl-doc-icon", ""));
      const copy = node("span", "");
      copy.append(node("strong", "", resource.title), node("small", "", resource.description || "Official team document"));
      a.append(copy, node("span", "rl-view", "View"));
      entry.append(a);
    }
  }

  function filters() {
    const items = activeResources();
    for (const [id, values] of [["rl-type", items.map(item => item.type)], ["rl-topic", items.map(item => item.topic)]]) {
      const select = $(id);
      const previous = select.value;
      select.replaceChildren(new Option(id === "rl-type" ? "All Types" : "All Topics", "all"));
      [...new Set(values.filter(Boolean))].sort().forEach(value => select.add(new Option(value, value)));
      if ([...select.options].some(option => option.value === previous)) select.value = previous;
    }
  }

  function renderLibrary() {
    const category = $("resource-library").dataset.category || "all";
    const search = $("rl-search").value.trim().toLowerCase();
    const type = $("rl-type").value;
    const topic = $("rl-topic").value;
    const target = $("rl-results");
    target.replaceChildren();
    if (listenerError) {
      $("rl-results-status").textContent = listenerError;
      return;
    }
    const filtered = activeResources().filter(item =>
      (category === "all" || item.category === category) &&
      (type === "all" || item.type === type) &&
      (topic === "all" || item.topic === topic) &&
      (!search || [item.title, item.description, CATEGORIES[item.category], item.topic, item.type]
        .some(value => String(value || "").toLowerCase().includes(search)))
    );
    const sort = $("rl-sort").value;
    if (sort === "title") filtered.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "oldest") filtered.sort((a, b) => -addedOrder(a, b));
    else filtered.sort((a, b) => (b.isPinned === true) - (a.isPinned === true) || addedOrder(a, b));
    $("rl-results-status").textContent = loaded ? `${filtered.length} resource${filtered.length === 1 ? "" : "s"} found` : "Loading resources…";
    if (loaded && !filtered.length) {
      target.append(node("p", "rl-empty", "No resources match these filters. Try another search or request a resource."));
    }
    for (const item of filtered) {
      const row = node("article", "rl-result");
      const main = node("div", "rl-result-copy");
      const title = node("h3", "", item.title);
      if (item.isPinned === true) title.append(node("span", "rl-pin-label", "Pinned"));
      main.append(title, node("p", "", item.description || ""));
      row.append(main, node("span", "rl-result-type", item.type || "Other"), node("span", "rl-result-topic", item.topic || "General"), node("time", "", formatDate(item.createdAt)), linkFor(item, "rl-view", "View →"));
      target.append(row);
    }
  }

  function renderManagement() {
    const target = $("rl-manage-list");
    target.replaceChildren();
    if (!manager()) return;
    if (!resources.length) target.append(node("p", "rl-empty", loaded ? "No resources yet. Add a resource to publish the first link." : "Loading…"));
    for (const item of [...resources].sort(recentOrder)) {
      const row = node("div", "rl-manage-row");
      row.append(node("strong", "", item.title || "Untitled"), node("small", "", `${CATEGORIES[item.category] || "Unknown"} · ${item.isActive ? "Visible" : "Inactive"}`));
      const edit = node("button", "", "Edit"); edit.type = "button";
      edit.addEventListener("click", () => openEditor(item));
      const toggle = node("button", "", item.isActive ? "Deactivate" : "Activate"); toggle.type = "button";
      toggle.addEventListener("click", async () => {
        if (!confirm(`${item.isActive ? "Hide" : "Publish"} “${item.title}”?`)) return;
        toggle.disabled = true;
        try {
          await firebase.firestore().collection("resources").doc(item.id).update({ isActive: !item.isActive, updatedAt: stamp() });
        } catch (error) { alert("Could not update this resource: " + error.message); toggle.disabled = false; }
      });
      row.append(edit, toggle);
      target.append(row);
    }
  }

  function renderRequests(snapshot) {
    const target = $("rl-request-list");
    target.replaceChildren();
    const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
    if (!requests.length) target.append(node("p", "rl-empty", "No resource requests yet."));
    for (const request of requests) {
      const row = node("div", "rl-manage-row rl-request-row");
      const copy = node("div", "");
      copy.append(node("strong", "", request.title), node("small", "", `${request.details} · ${CATEGORIES[request.category] || "Other"} · ${formatDate(request.createdAt)}`));
      const status = node("select", "");
      status.setAttribute("aria-label", `Status for ${request.title}`);
      for (const value of ["open", "in-progress", "completed", "declined"]) status.add(new Option(value, value));
      status.value = request.status;
      status.addEventListener("change", async () => {
        status.disabled = true;
        try { await firebase.firestore().collection("resource_requests").doc(request.id).update({ status: status.value }); }
        catch (error) { alert("Could not update this request: " + error.message); status.value = request.status; }
        finally { status.disabled = false; }
      });
      row.append(copy, status);
      target.append(row);
    }
  }

  function openEditor(item) {
    if (!manager()) return;
    const form = $("rl-editor-form");
    form.reset();
    for (const field of ["id", "title", "description", "category", "type", "topic", "url"]) {
      if (item) form.elements[field].value = item[field] || "";
    }
    form.elements.isPinned.checked = !!item?.isPinned;
    form.elements.isActive.checked = item ? item.isActive === true : true;
    $("rl-editor-title").textContent = item ? "Edit Resource" : "Add Resource";
    $("rl-editor-status").textContent = "";
    $("rl-editor-dialog").showModal();
  }

  async function saveResource(event) {
    event.preventDefault();
    if (!manager() || !email()) return;
    const form = event.currentTarget;
    const id = form.elements.id.value;
    const url = safeUrl(form.elements.url.value.trim());
    if (!url) { $("rl-editor-status").textContent = "Enter a valid http:// or https:// resource URL."; return; }
    const payload = {
      title: form.elements.title.value.trim(),
      description: form.elements.description.value.trim(),
      category: form.elements.category.value,
      type: form.elements.type.value,
      topic: form.elements.topic.value.trim(),
      url,
      isPinned: form.elements.isPinned.checked,
      isActive: form.elements.isActive.checked,
      updatedAt: stamp()
    };
    if (!payload.title || !payload.description) { $("rl-editor-status").textContent = "Title and description are required."; return; }
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    $("rl-editor-status").textContent = "Saving…";
    try {
      const collection = firebase.firestore().collection("resources");
      if (id) await collection.doc(id).update(payload);
      else await collection.add({ ...payload, createdAt: stamp(), createdBy: email() });
      $("rl-editor-dialog").close();
    } catch (error) {
      $("rl-editor-status").textContent = "Could not save this resource: " + error.message;
    } finally { submit.disabled = false; }
  }

  async function sendRequest(event) {
    event.preventDefault();
    if (!email()) return;
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const status = $("rl-request-status");
    submit.disabled = true;
    status.textContent = "Sending…";
    try {
      await firebase.firestore().collection("resource_requests").add({
        title: form.elements.title.value.trim(),
        details: form.elements.details.value.trim(),
        category: form.elements.category.value,
        status: "open",
        createdBy: email(),
        createdAt: stamp()
      });
      status.textContent = "Your request was sent to the coach and captain queue.";
      form.reset();
    } catch (error) { status.textContent = "Could not send this request: " + error.message; }
    finally { submit.disabled = false; }
  }

  function start() {
    if (started || !firebase.auth().currentUser) return;
    started = true;
    document.querySelectorAll("[data-library]").forEach(link => link.addEventListener("click", event => {
      event.preventDefault();
      route(link.dataset.library, true);
    }));
    window.addEventListener("popstate", () => route(new URL(location.href).searchParams.get("library") || "home", false));
    ["rl-search", "rl-type", "rl-topic", "rl-sort"].forEach(id => $(id).addEventListener(id === "rl-search" ? "input" : "change", renderLibrary));
    $("rl-request-open").addEventListener("click", () => { $("rl-request-status").textContent = ""; $("rl-request-dialog").showModal(); });
    $("rl-request-form").addEventListener("submit", sendRequest);
    $("rl-add-open").addEventListener("click", () => openEditor(null));
    $("rl-editor-form").addEventListener("submit", saveResource);
    document.querySelectorAll("[data-close]").forEach(button =>
      button.addEventListener("click", () => $(button.dataset.close).close()));
    for (const id of ["rl-editor-dialog", "rl-request-dialog"]) {
      $(id).addEventListener("click", event => { if (event.target === $(id)) $(id).close(); });
    }
    $("rl-add-open").hidden = !manager();
    $("rl-manage-list").hidden = !manager();
    $("rl-request-queue").hidden = !manager();
    route(new URL(location.href).searchParams.get("library") || "home", false);
    const resourceQuery = firebase.firestore().collection("resources");
    resourceUnsubscribe = (manager() ? resourceQuery : resourceQuery.where("isActive", "==", true)).onSnapshot(snapshot => {
      resources = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      listenerError = "";
      loaded = true;
      renderCounts(); renderRecent(); renderOfficial(); filters(); renderLibrary(); renderManagement();
    }, error => {
      listenerError = "Resources could not be loaded. Ask a coach to check the library access settings.";
      console.error("Resource library unavailable:", error);
      document.querySelectorAll("[data-count]").forEach(element => { element.textContent = "Unavailable"; });
      renderRecent(); renderLibrary();
    });
    if (manager()) {
      requestUnsubscribe = firebase.firestore().collection("resource_requests").onSnapshot(
        renderRequests,
        error => { $("rl-request-list").textContent = "Could not load resource requests."; console.error("Resource request queue unavailable:", error); }
      );
    }
    firebase.auth().onAuthStateChanged(user => {
      if (!user) { resourceUnsubscribe?.(); requestUnsubscribe?.(); resourceUnsubscribe = requestUnsubscribe = null; started = false; }
    });
  }

  window.startMemberResourceLibrary = start;
})();