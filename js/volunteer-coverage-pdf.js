/* Public-memory-only browser exporter for the approved season coverage report. */
(function () {
  "use strict";

  const scriptCache = new Map();
  const assetCache = new Map();
  let reportModulesPromise = null;
  let pdfkitPromise = null;

  function staticUrl(path) {
    return new URL(path, document.baseURI).href;
  }

  function loadScript(path) {
    const url = staticUrl(path);
    if (scriptCache.has(url)) return scriptCache.get(url);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        reject(new Error(`Could not load the volunteer coverage PDF asset: ${path}`));
      };
      document.head.append(script);
    });
    scriptCache.set(url, promise);
    promise.catch(() => {
      if (scriptCache.get(url) === promise) scriptCache.delete(url);
    });
    return promise;
  }

  function loadPdfkit() {
    if (!pdfkitPromise) {
      pdfkitPromise = loadScript("js/vendor/pdfkit.standalone.js").then(() => {
        if (!window.PDFDocument) throw new Error("PDF creation is unavailable. Refresh the page and try again.");
      });
      pdfkitPromise.catch(() => { pdfkitPromise = null; });
    }
    return pdfkitPromise;
  }

  function loadReportModules() {
    if (!reportModulesPromise) {
      reportModulesPromise = (async () => {
        await loadScript("js/volunteer-coverage-report-model.js");
        await loadScript("js/volunteer-coverage-report-analysis-pages.js");
        await loadScript("js/volunteer-coverage-report-renderer.js");
        const model = window.CooperVolunteerCoverageReportModel;
        const renderer = window.CooperVolunteerCoverageReportRenderer;
        if (!model || !renderer) throw new Error("The volunteer coverage PDF renderer could not be initialized.");
        return { model, renderer };
      })();
      reportModulesPromise.catch(() => { reportModulesPromise = null; });
    }
    return reportModulesPromise;
  }

  function loadStaticAsset(path, kind) {
    if (assetCache.has(path)) return assetCache.get(path);
    const promise = fetch(staticUrl(path)).then(response => {
      if (!response.ok) throw new Error(`Could not load the volunteer coverage PDF asset: ${path}`);
      return kind === "font" ? response.arrayBuffer() : response.blob();
    }).then(value => {
      if (kind === "font") return new Uint8Array(value);
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error(`Could not read the volunteer coverage PDF artwork: ${path}`));
        reader.readAsDataURL(value);
      });
    });
    assetCache.set(path, promise);
    promise.catch(() => {
      if (assetCache.get(path) === promise) assetCache.delete(path);
    });
    return promise;
  }

  const eventStyles = [
    { match: /congressional/i, short: "Congressional", color: "#087d58", pale: "#e8f8f1", icon: "building" },
    { match: /\bcooper\b/i, short: "Cooper", color: "#0f60d6", pale: "#ecf5ff", icon: "building" },
    { match: /longfellow/i, short: "Longfellow", color: "#e6a419", pale: "#fff8e7", icon: "book" },
    { match: /norwood/i, short: "Norwood", color: "#ce152b", pale: "#fff0f2", icon: "people" },
    { match: /virtual|online/i, short: "Online – Virtual", color: "#703db5", pale: "#f2ecfc", icon: "laptop" },
  ];

  function dateShort(tournament) {
    const match = String(tournament.id || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    let month;
    let day;
    if (match) {
      month = Number(match[2]);
      day = Number(match[3]);
    } else {
      const dateMatch = String(tournament.date || "").match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\b/i);
      if (!dateMatch) throw new Error(`A usable event date is required for ${tournament.name || "a tournament"}.`);
      month = new Date(`${dateMatch[1]} 1, 2000`).getMonth() + 1;
      day = Number(dateMatch[2]);
    }
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    return `${months[month - 1]} ${String(day).padStart(2, "0")}`;
  }

  function seasonLabel(season) {
    const value = String(season ?? "").trim();
    if (!value) throw new Error("A season label is required.");
    const yearRange = value.match(/^(\d{4})[-–/](\d{2}|\d{4})$/);
    if (!yearRange) return value;
    const end = yearRange[2].length === 2 ? yearRange[2] : yearRange[2].slice(-2);
    return `${yearRange[1]}–${end}`;
  }

  function modelInput(input) {
    if (!input || !Array.isArray(input.tournaments) || input.tournaments.length !== 5) {
      throw new Error("This report requires the five public season tournament dates.");
    }
    if (!Array.isArray(input.people)) throw new Error("Public volunteer names and date selections are required.");
    const events = input.tournaments.map(tournament => {
      const identity = `${tournament.id || ""} ${tournament.name || ""}`;
      const style = eventStyles.find(item => item.match.test(identity));
      if (!style) throw new Error(`No approved report style is configured for ${tournament.name || tournament.id || "a tournament"}.`);
      if (typeof tournament.date !== "string" || !tournament.date.trim()) {
        throw new Error(`A public date is required for ${tournament.name}.`);
      }
      if (typeof tournament.location !== "string" || !tournament.location.trim()) {
        throw new Error(`A public venue is required for ${tournament.name}.`);
      }
      return {
        short: style.short,
        venue: tournament.location.trim(),
        date: tournament.date.trim(),
        dateShort: dateShort(tournament),
        target: Number(tournament.judgeTarget),
        color: style.color,
        pale: style.pale,
        icon: style.icon,
      };
    });
    const idToIndex = new Map(input.tournaments.map((tournament, index) => [String(tournament.id), index]));
    const volunteers = input.people.map(person => {
      if (!person || typeof person.name !== "string" || !Array.isArray(person.dates)) {
        throw new Error("Each public volunteer record must contain a name and selected tournament IDs.");
      }
      return {
        name: person.name,
        dates: person.dates.map(id => {
          const index = idToIndex.get(String(id));
          if (index === undefined) throw new Error(`Unknown public tournament selection: ${String(id)}.`);
          return index;
        }),
      };
    });
    return {
      seasonLabel: seasonLabel(input.season),
      sampleData: input.sampleData === true,
      events,
      volunteers,
    };
  }

  async function build(input) {
    const [modules] = await Promise.all([loadReportModules(), loadPdfkit()]);
    const model = modules.model.buildReportModel(modelInput(input));
    const [badge, jaguar, gavel, scriptFont] = await Promise.all([
      loadStaticAsset("images/volunteer-letter/cooper-debate-badge.png", "image"),
      loadStaticAsset("images/volunteer-letter/cooper-jaguar-mark.png", "image"),
      loadStaticAsset("images/volunteer-letter/judge-confirmation-gavel.png", "image"),
      loadStaticAsset("fonts/GreatVibes-Regular.ttf", "font"),
    ]);
    const artwork = {
      "cooper-debate-badge.png": badge,
      "cooper-jaguar-mark.png": jaguar,
      "judge-confirmation-gavel.png": gavel,
    };
    const doc = new window.PDFDocument({
      size: [792, 528], autoFirstPage: false, margin: 0,
      info: {
        Title: `Judge Volunteer Coverage — Four-Page Report${model.sampleData ? " (Test Data)" : ""}`,
        Author: "Cooper Debate Team",
        Subject: "Season coverage, volunteer roster, tournament signup lists, and next steps",
      },
    });
    const chunks = [];
    const done = new Promise((resolve, reject) => {
      doc.on("data", chunk => chunks.push(chunk));
      doc.on("error", reject);
      doc.on("end", () => resolve(new Blob(chunks, { type: "application/pdf" })));
    });
    try {
      modules.renderer.renderCoverageReport(doc, model, {
        artworkResolver: name => artwork[name],
        scriptFont,
      });
      doc.end();
    } catch (error) {
      doc.destroy();
      throw error;
    }
    return done;
  }

  async function save(input) {
    const blob = await build(input);
    const selectedSeason = String(input?.season ?? "season")
      .replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "season";
    const testMode = input?.testMode === true || input?.sampleData === true;
    const filename = `Cooper_Debate_Judge_Volunteer_Coverage_${selectedSeason}${testMode ? "_TEST" : ""}.pdf`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  window.CooperVolunteerCoveragePdf = { build, save };
})();