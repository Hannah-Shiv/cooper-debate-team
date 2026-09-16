(function () {
  "use strict";

  const TIME_ZONE = "America/New_York";
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
  const dateValue = value => {
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate();
    if (value._seconds || value.seconds) return new Date(Number(value._seconds ?? value.seconds) * 1000);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const zonedParts = date => Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  const inputValue = date => {
    const parts = zonedParts(date);
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  };
  const fromEasternInput = value => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value || "")) return null;
    const [year, month, day, hour, minute] = value.match(/\d+/g).map(Number);
    const desired = Date.UTC(year, month - 1, day, hour, minute);
    let result = new Date(desired);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const parts = zonedParts(result);
      const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
      result = new Date(result.getTime() + desired - represented);
    }
    return result;
  };
  const axisDate = date => new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, month: "short", day: "numeric" }).format(date);
  const axisHour = date => new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric" }).format(date);
  const fullTime = date => new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(date);
  const dayStart = time => fromEasternInput(`${inputValue(new Date(time)).slice(0, 10)}T00:00`).getTime();
  const dayEnd = time => fromEasternInput(`${inputValue(new Date(time)).slice(0, 10)}T23:59`).getTime();

  let context = window.__cooperApplicationsReportContext || { applications: [] };
  let dialog = null;
  let domainStart = 0;
  let domainEnd = 0;
  let selectedStart = 0;
  let selectedEnd = 0;

  function submissionTimes() {
    return context.applications.map(item => dateValue(item.createdAt)?.getTime()).filter(Number.isFinite).sort((a, b) => a - b);
  }

  function buildBins(start, end) {
    const hourly = end - start <= DAY;
    const size = hourly ? HOUR : DAY;
    const first = hourly
      ? fromEasternInput(`${inputValue(new Date(start)).slice(0, 13)}:00`).getTime()
      : fromEasternInput(`${inputValue(new Date(start)).slice(0, 10)}T00:00`).getTime();
    const bins = [];
    for (let cursor = first; cursor <= end && bins.length < 370; cursor += size) {
      bins.push({ start: cursor, end: cursor + size, count: 0 });
    }
    submissionTimes().forEach(time => {
      if (time < start || time > end) return;
      const bin = bins.find(candidate => time >= candidate.start && time < candidate.end);
      if (bin) bin.count += 1;
    });
    return { bins, hourly };
  }

  function chartSvg(bins, hourly) {
    const width = 1100;
    const height = 350;
    const plot = { left: 58, right: 22, top: 24, bottom: 54 };
    const plotWidth = width - plot.left - plot.right;
    const plotHeight = height - plot.top - plot.bottom;
    const max = Math.max(1, ...bins.map(bin => bin.count));
    const ticks = [...new Set([0, Math.ceil(max / 2), max])].sort((a, b) => a - b);
    const slot = plotWidth / Math.max(1, bins.length);
    const barWidth = Math.max(3, Math.min(42, slot * 0.68));
    const labelEvery = Math.max(1, Math.ceil(bins.length / 10));
    const grid = ticks.map(value => {
      const y = plot.top + plotHeight - value / max * plotHeight;
      return `<line class="stats-grid-line" x1="${plot.left}" y1="${y}" x2="${width - plot.right}" y2="${y}"/><text class="stats-y-label" x="${plot.left - 12}" y="${y + 4}" text-anchor="end">${value}</text>`;
    }).join("");
    const bars = bins.map((bin, index) => {
      const x = plot.left + index * slot + (slot - barWidth) / 2;
      const barHeight = bin.count / max * plotHeight;
      const y = plot.top + plotHeight - barHeight;
      const label = hourly ? axisHour(new Date(bin.start)) : axisDate(new Date(bin.start));
      return `<g><rect class="stats-bar" x="${x}" y="${y}" width="${barWidth}" height="${Math.max(bin.count ? 3 : 1, barHeight)}" rx="3" tabindex="0" aria-label="${esc(label)}: ${bin.count} submission${bin.count === 1 ? "" : "s"}"><title>${esc(label)} · ${bin.count} submission${bin.count === 1 ? "" : "s"}</title></rect>${index % labelEvery === 0 || index === bins.length - 1 ? `<text class="stats-x-label" x="${x + barWidth / 2}" y="${height - 24}" text-anchor="middle">${esc(label)}</text>` : ""}</g>`;
    }).join("");
    return `<svg class="stats-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Column chart showing application submissions grouped ${hourly ? "by hour" : "by day"}"><text class="stats-axis-title" transform="translate(15 ${plot.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">Submissions</text>${grid}<line class="stats-axis" x1="${plot.left}" y1="${plot.top + plotHeight}" x2="${width - plot.right}" y2="${plot.top + plotHeight}"/>${bars}<text class="stats-axis-title" x="${plot.left + plotWidth / 2}" y="${height - 2}" text-anchor="middle">Date / time</text></svg>`;
  }

  function updateHandles() {
    if (!dialog) return;
    const span = Math.max(1, domainEnd - domainStart);
    const left = (selectedStart - domainStart) / span * 100;
    const right = (selectedEnd - domainStart) / span * 100;
    const selection = dialog.querySelector(".stats-range-selection");
    const railRect = dialog.querySelector(".stats-range-rail").getBoundingClientRect();
    const stageRect = dialog.querySelector(".stats-chart-stage").getBoundingClientRect();
    const handleHeight = Math.max(160, railRect.top - stageRect.top - 26);
    selection.style.left = `${left}%`;
    selection.style.width = `${Math.max(0, right - left)}%`;
    [["from", left, selectedStart], ["to", right, selectedEnd]].forEach(([side, position, value]) => {
      const handle = dialog.querySelector(`[data-stats-handle="${side}"]`);
      handle.style.left = `${position}%`;
      handle.style.height = `${handleHeight}px`;
      handle.style.top = `${-handleHeight - 7}px`;
      handle.setAttribute("aria-valuemin", String(domainStart));
      handle.setAttribute("aria-valuemax", String(domainEnd));
      handle.setAttribute("aria-valuenow", String(value));
      handle.setAttribute("aria-valuetext", fullTime(new Date(value)));
    });
  }

  function render() {
    if (!dialog) return;
    const { bins, hourly } = buildBins(selectedStart, selectedEnd);
    const selectedCount = submissionTimes().filter(time => time >= selectedStart && time <= selectedEnd).length;
    dialog.querySelector(".stats-chart-stage").innerHTML = chartSvg(bins, hourly);
    dialog.querySelector(".stats-count").textContent = `${selectedCount} submission${selectedCount === 1 ? "" : "s"}`;
    dialog.querySelector(".stats-granularity").textContent = hourly ? "Grouped hour by hour" : "Grouped by day";
    dialog.querySelector("#stats-from").value = inputValue(new Date(selectedStart));
    dialog.querySelector("#stats-to").value = inputValue(new Date(selectedEnd));
    updateHandles();
  }

  function setSelection(start, end, changedSide) {
    const minimumGap = Math.min(HOUR, domainEnd - domainStart);
    let nextStart = Math.max(domainStart, Math.min(Number(start), domainEnd));
    let nextEnd = Math.max(domainStart, Math.min(Number(end), domainEnd));
    if (nextStart > nextEnd - minimumGap) {
      if (changedSide === "from") nextStart = Math.max(domainStart, nextEnd - minimumGap);
      else nextEnd = Math.min(domainEnd, nextStart + minimumGap);
    }
    selectedStart = nextStart;
    selectedEnd = nextEnd;
    render();
  }

  function wireHandle(handle) {
    const side = handle.dataset.statsHandle;
    const moveToClientX = clientX => {
      const rail = dialog.querySelector(".stats-range-rail");
      const rect = rail.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const value = domainStart + ratio * (domainEnd - domainStart);
      setSelection(side === "from" ? value : selectedStart, side === "to" ? value : selectedEnd, side);
    };
    handle.addEventListener("pointerdown", event => {
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      moveToClientX(event.clientX);
    });
    handle.addEventListener("pointermove", event => {
      if (handle.hasPointerCapture(event.pointerId)) moveToClientX(event.clientX);
    });
    handle.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const step = selectedEnd - selectedStart <= DAY ? HOUR : DAY;
      const current = side === "from" ? selectedStart : selectedEnd;
      const value = event.key === "Home" ? domainStart : event.key === "End" ? domainEnd : current + (event.key === "ArrowRight" ? step : -step);
      setSelection(side === "from" ? value : selectedStart, side === "to" ? value : selectedEnd, side);
    });
  }

  function open() {
    dialog?.remove();
    const times = submissionTimes();
    const now = Date.now();
    domainStart = dayStart(times[0] ?? now - DAY);
    domainEnd = dayEnd(times[times.length - 1] ?? now);
    if (domainEnd - domainStart < HOUR) domainEnd = domainStart + HOUR;
    selectedStart = domainStart;
    selectedEnd = domainEnd;
    dialog = document.createElement("dialog");
    dialog.className = "application-stats-dialog";
    dialog.setAttribute("aria-labelledby", "stats-title");
    dialog.innerHTML = `<div class="stats-shell"><header class="stats-head"><div><p>Application records</p><h2 id="stats-title">Submissions over time</h2><span>Times shown in Eastern Time</span></div><div class="stats-head-summary"><strong class="stats-count"></strong><small class="stats-granularity"></small></div><button type="button" class="stats-close" aria-label="Close stats">✕</button></header><section class="stats-controls" aria-label="Submission date and time range"><label>From<input id="stats-from" type="datetime-local"></label><label>To<input id="stats-to" type="datetime-local"></label><button type="button" class="stats-reset">Reset range</button></section><section class="stats-visual"><div class="stats-chart-stage"></div><div class="stats-range-rail" aria-label="Draggable submission range"><div class="stats-range-selection"></div><button type="button" class="stats-range-handle from" data-stats-handle="from" role="slider" aria-label="From date and time"></button><button type="button" class="stats-range-handle to" data-stats-handle="to" role="slider" aria-label="To date and time"></button></div><p class="stats-range-help">Drag the vertical handles to zoom. Select one day or less to see submissions hour by hour.</p></section></div>`;
    document.body.appendChild(dialog);
    dialog.showModal();
    dialog.querySelector(".stats-close").onclick = () => dialog.close();
    dialog.querySelector(".stats-reset").onclick = () => setSelection(domainStart, domainEnd);
    dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener("close", () => { dialog.remove(); dialog = null; }, { once: true });
    ["from", "to"].forEach(side => {
      dialog.querySelector(`#stats-${side}`).addEventListener("change", event => {
        const value = fromEasternInput(event.target.value)?.getTime();
        if (!Number.isFinite(value)) return;
        setSelection(side === "from" ? value : selectedStart, side === "to" ? value : selectedEnd, side);
      });
      wireHandle(dialog.querySelector(`[data-stats-handle="${side}"]`));
    });
    render();
  }

  window.addEventListener("cooper:applications-context", event => {
    context = event.detail;
    if (dialog) {
      const times = submissionTimes();
      if (times.length) {
        domainStart = dayStart(times[0]);
        domainEnd = Math.max(dayEnd(times[times.length - 1]), domainStart + HOUR);
        setSelection(domainStart, domainEnd);
      }
    }
  });
  window.addEventListener("resize", () => { if (dialog) updateHandles(); });
  document.addEventListener("click", event => {
    if (event.target.closest("#application-stats-report")) open();
  });
})();