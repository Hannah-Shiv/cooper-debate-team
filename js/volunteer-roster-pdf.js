/* Private volunteer roster PDF — called only from the coach/website-admin tournament manager. */
(function () {
  "use strict";

  const NAVY = "#062451";
  const GOLD = "#f6c928";
  const INK = "#102b59";
  const COLUMNS = [
    { label: "FULL NAME", width: 116, key: "parentName" },
    { label: "ROLE", width: 84, key: "roleLabel" },
    { label: "TIME FROM – TO", width: 113, key: "time" },
    { label: "EMAIL", width: 145, key: "email" },
    { label: "PHONE", width: 91, key: "phone" },
    { label: "NOTES (IF ANY)", width: 195, key: "notes" },
  ];
  const WIDTH = COLUMNS.reduce((sum, column) => sum + column.width, 0);
  const LEFT = (792 - WIDTH) / 2;
  const TABLE_TOP = 283;
  const BOTTOM = 562;

  function printable(value) {
    return String(value ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim();
  }
  function time(value) {
    if (!/^\d{2}:\d{2}$/.test(value || "")) return "";
    const [hour, minute] = value.split(":").map(Number);
    return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
  }
  function eventDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return printable(value) || "Date to be announced";
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
  }
  async function image(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Could not load the PDF header artwork (${path}).`);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(`Could not read the PDF header artwork (${path}).`));
      reader.readAsDataURL(blob);
    });
  }
  async function font(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Could not load the PDF header font (${path}).`);
    return new Uint8Array(await response.arrayBuffer());
  }
  function wrappedLines(doc, value, width, font, size) {
    doc.font(font).fontSize(size);
    const lines = [];
    for (const paragraph of (printable(value) || "—").split("\n")) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(""); continue; }
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (doc.widthOfString(candidate) <= width) { line = candidate; continue; }
        if (line) { lines.push(line); line = ""; }
        for (const char of word) {
          if (line && doc.widthOfString(line + char) > width) { lines.push(line); line = ""; }
          line += char;
        }
      }
      if (line) lines.push(line);
    }
    return lines;
  }
  function box(doc, x, width, label, value) {
    doc.roundedRect(x, 145, width, 69, 6).fillAndStroke("#eaf4fc", "#bbd3e8");
    doc.fillColor("#426381").font("Helvetica-Bold").fontSize(7)
      .text(label, x + 11, 155, { width: width - 22, lineBreak: false, characterSpacing: .65 });
    const raw = printable(value) || "To be announced";
    let size = 11;
    while (size > 7.5 && doc.font("Times-Bold").fontSize(size)
      .heightOfString(raw, { width: width - 22 }) > 42) size -= .5;
    doc.fillColor(INK).font("Times-Bold").fontSize(size)
      .text(raw, x + 11, 173, { width: width - 22, height: 37 });
  }
  function drawPage(doc, event, counts, artwork) {
    doc.rect(0, 0, 792, 91).fill(NAVY);
    doc.rect(0, 89, 792, 3).fill(GOLD);
    doc.image(artwork.badge, 18, 7, { fit: [75, 75] });
    doc.fillColor("#fffdf1").font("GreatVibes").fontSize(37)
      .text("Cooper Debate Team", 210, 5, { width: 372, align: "center", lineBreak: false });
    doc.fillColor(GOLD).font("Helvetica-Bold").fontSize(8.5)
      .text("SPEAK  ·  REASON  ·  LEAD", 210, 55, { width: 372, align: "center", characterSpacing: 2 });
    doc.fillColor("#d9e6f5").font("Helvetica").fontSize(7.2)
      .text("COOPER MIDDLE SCHOOL  ·  MCLEAN, VIRGINIA", 210, 71,
        { width: 372, align: "center", characterSpacing: 1.1 });
    doc.image(artwork.jaguar, 716, 9, { fit: [60, 70] });

    doc.roundedRect(LEFT, 101, WIDTH, 34, 6).fill(GOLD);
    doc.roundedRect(LEFT + 5, 105, 29, 26, 4).fill(NAVY);
    doc.image(artwork.gavel, LEFT + 8, 107, { fit: [23, 22] });
    doc.rect(LEFT + 42, 107, 2, 22).fill(NAVY);
    doc.fillColor(NAVY).font("Times-Bold").fontSize(15)
      .text("TOURNAMENT JUDGE ROSTER", LEFT + 55, 109, { width: WIDTH - 65, lineBreak: false });

    box(doc, LEFT, 280, "TOURNAMENT NAME", event.title);
    box(doc, LEFT + 289, 205, "EVENT DAY AND DATE", eventDate(event.date));
    box(doc, LEFT + 503, 241, "EVENT LOCATION", [event.location, event.address].filter(Boolean).join("\n"));

    const metrics = [
      ["JUDGE CAPACITY", counts.capacity],
      ["TOTAL SPOTS FILLED", counts.filled],
      ["TOTAL SPOTS OPEN", counts.open],
    ];
    metrics.forEach(([label, value], index) => {
      const x = LEFT + index * 251;
      doc.roundedRect(x, 223, 242, 48, 5).fillAndStroke(index === 1 ? "#dceaf7" : "#fff9e6", "#d8c889");
      doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(8)
        .text(label, x + 12, 231, { width: 177, characterSpacing: .35, lineBreak: false });
      doc.fillColor(NAVY).font("Times-Bold").fontSize(22)
        .text(String(value), x + 189, 229, { width: 39, align: "right", lineBreak: false });
    });

    let x = LEFT;
    for (const column of COLUMNS) {
      doc.rect(x, TABLE_TOP, column.width, 29).fill(NAVY);
      doc.fillColor("#ffdd61").font("Helvetica-Bold").fontSize(7.1)
        .text(column.label, x + 8, TABLE_TOP + 10, { width: column.width - 16, lineBreak: false });
      x += column.width;
    }
    doc.rect(LEFT, TABLE_TOP + 28, WIDTH, 2).fill(GOLD);
    return TABLE_TOP + 30;
  }

  async function build(event, signups) {
    if (!window.PDFDocument) throw new Error("PDF creation is unavailable. Refresh the page and try again.");
    const [badge, jaguar, gavel, scriptFont] = await Promise.all([
      image("images/volunteer-letter/cooper-debate-badge.png"),
      image("images/index-footer-jaguar.png"),
      image("images/volunteer-letter/judge-confirmation-gavel.png"),
      font("fonts/GreatVibes-Regular.ttf"),
    ]);
    const artwork = { badge, jaguar, gavel };
    const capacity = (event.roles || []).filter(role => role.label !== "Duplicate-check test")
      .reduce((sum, role) => sum + Math.max(0, Number(role.capacity) || 0), 0);
    const counts = { capacity, filled: signups.length, open: Math.max(0, capacity - signups.length) };
    const doc = new window.PDFDocument({
      size: "LETTER", layout: "landscape", margin: 0, bufferPages: true,
      info: { Title: `${printable(event.title)} — Volunteer Judge Roster`, Author: "Cooper Debate Team" },
    });
    doc.registerFont("GreatVibes", scriptFont);
    const chunks = [];
    const done = new Promise((resolve, reject) => {
      doc.on("data", chunk => chunks.push(chunk));
      doc.on("error", reject);
      doc.on("end", () => resolve(new Blob(chunks, { type: "application/pdf" })));
    });
    let y = drawPage(doc, event, counts, artwork);
    const nextPage = () => {
      doc.addPage({ size: "LETTER", layout: "landscape", margin: 0 });
      y = drawPage(doc, event, counts, artwork);
    };
    if (!signups.length) {
      doc.fillColor(INK).font("Helvetica").fontSize(10)
        .text("No volunteers have signed up for this tournament yet.", LEFT + 12, y + 15);
    }
    signups.forEach((signup, rowIndex) => {
      const values = {
        parentName: signup.parentName, roleLabel: signup.roleLabel,
        time: [time(signup.availabilityStart), time(signup.availabilityEnd)].filter(Boolean).join(" – ") || "Not provided",
        email: signup.email, phone: signup.phone, notes: signup.notes || "—",
      };
      const remaining = COLUMNS.map(column =>
        wrappedLines(doc, values[column.key], column.width - 16, column.key === "parentName" ? "Helvetica-Bold" : "Helvetica", 8.1));
      let continued = false;
      do {
        if (BOTTOM - y < 38) nextPage();
        const linesAvailable = Math.max(1, Math.floor((BOTTOM - y - 15) / 11));
        const segments = remaining.map(lines => lines.splice(0, linesAvailable));
        if (continued) segments[0] = ["(continued)"];
        const linesUsed = Math.max(1, ...segments.map(lines => lines.length));
        const height = Math.max(34, linesUsed * 11 + 15);
        let x = LEFT;
        COLUMNS.forEach((column, index) => {
          doc.rect(x, y, column.width, height)
            .fillAndStroke(rowIndex % 2 ? "#e7f1fa" : "#f9fcff", "#c1d5e6");
          const font = index === 0 ? "Helvetica-Bold" : "Helvetica";
          doc.fillColor(INK).font(font).fontSize(8.1);
          segments[index].forEach((line, lineIndex) =>
            doc.text(line, x + 8, y + 8 + lineIndex * 11, { width: column.width - 16, lineBreak: false }));
          x += column.width;
        });
        y += height;
        continued = true;
      } while (remaining.some(lines => lines.length));
    });
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.rect(LEFT, 574, WIDTH, 1).fill("#c1d5e6");
      doc.fillColor("#4a6682").font("Helvetica").fontSize(7.5)
        .text("Cooper Debate Team  ·  Coach / Website Admin only  ·  Contains private volunteer contact details and notes",
          LEFT, 581, { width: WIDTH - 85, lineBreak: false });
      doc.text(`Page ${i + 1} of ${range.count}`, LEFT + WIDTH - 85, 581, { width: 85, align: "right", lineBreak: false });
    }
    doc.end();
    return done;
  }

  async function save(event, signups) {
    const blob = await build(event, signups);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${printable(event.title).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "tournament"}-volunteer-roster.pdf`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  window.VolunteerRosterPdf = { build, save };
})();