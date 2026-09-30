"use strict";

const path = require("node:path");
const PDFDocument = require("pdfkit");

const NAVY = "#062451";
const INK = "#102b59";
const TEAL = "#08647c";
const GOLD = "#f6c928";
const PALE = "#eaf4fc";
const MINT = "#e1f2f0";
const CREAM = "#fff5d8";
const ASSET = name => path.join(__dirname, "assets", "volunteer-letter", name);
const ICON_FILES = Object.freeze({
  gavel: "judge-confirmation-gavel.png",
  signup: "signup-details.png",
  resolution: "tournament-resolution.png",
  checklist: "what-to-expect.png",
  car: "arrival-parking.png",
  meals: "meals-refreshments.png",
  info: "important-information.png",
  contact: "contact-support.png",
  privacy: "privacy.png",
});
const VENUES = Object.freeze({
  "Congressional Middle School": {
    rank: 1, date: "October 24, 2026", short: "Sat, Oct 24, 2026",
    address: "3229 Sleepy Hollow Rd\nFalls Church, VA 22042", online: false,
  },
  "Cooper Middle School": {
    rank: 2, date: "November 14, 2026", short: "Sat, Nov 14, 2026",
    address: "977 Balls Hill Rd\nMcLean, VA 22101", online: false,
  },
  "Longfellow Middle School": {
    rank: 3, date: "December 5, 2026", short: "Sat, Dec 5, 2026",
    address: "2000 Westmoreland St\nFalls Church, VA 22043", online: false,
  },
  "Norwood Middle School": {
    rank: 4, date: "January 30, 2027", short: "Sat, Jan 30, 2027",
    address: "8821 River Rd\nBethesda, MD 20817", online: false,
  },
  "Online — Virtual Tournament": {
    rank: 5, date: "February 20, 2027", short: "Sat, Feb 20, 2027",
    address: "Virtual (online)", online: true,
  },
});
const EXPECTATIONS = [
  "You will be assigned to multiple rounds throughout the day.",
  "Each round is about a 60-minute session, followed by a short feedback period.",
  "You will evaluate constructive speeches, crossfire, and rebuttals using a provided ballot.",
  "Coaches and student volunteers will be available to answer questions and provide support.",
  "You may be paired with another judge for certain rounds.",
];

function clean(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function createSeasonLetter(submission, selections, testPreview = false) {
  if (!Array.isArray(selections) || !selections.length || selections.length > 5) {
    throw new Error("The season letter requires one to five selected tournaments.");
  }
  const tournaments = selections.map(item => {
    const venue = VENUES[item.name];
    if (!venue || venue.date !== item.date) throw new Error("Unknown selected tournament.");
    return { ...venue, name: item.name };
  }).sort((a, b) => a.rank - b.rank);
  if (new Set(tournaments.map(item => item.rank)).size !== tournaments.length) {
    throw new Error("Duplicate selected tournament.");
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      autoFirstPage: false,
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      info: {
        Title: "2026–27 Cooper Debate Season Judge Availability Confirmation",
        Author: "Cooper Debate Team",
        Subject: "Selected tournament dates and tournament-day guide",
      },
    });
    doc.registerFont("GreatVibes", ASSET("GreatVibes-Regular.ttf"));
    const chunks = [];
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve({
      filename: "Cooper_Debate_2026-27_Judge_Availability.pdf",
      content: Buffer.concat(chunks).toString("base64"),
    }));

    const text = (value, x, y, width, height, size = 8, font = "Helvetica", options = {}) => {
      const label = String(value || "");
      const lineGap = options.lineGap ?? 1;
      let fitted = size;
      while (fitted > Math.max(5.7, size - 2.2)) {
        doc.font(font).fontSize(fitted);
        if (doc.heightOfString(label, { width, lineGap, align: options.align }) <= height) break;
        fitted -= .25;
      }
      doc.fillColor(options.color || INK).font(font).fontSize(fitted)
        .text(label, x, y, {
          width, height, lineGap, align: options.align || "left",
          ellipsis: true, characterSpacing: options.characterSpacing || 0,
        });
    };
    const centeredText = (value, x, y, width, height, size, font = "Helvetica", options = {}) => {
      doc.font(font).fontSize(size);
      const contentHeight = doc.heightOfString(String(value), { width, lineGap: 1, align: "center" });
      const offset = Math.max(0, (height - contentHeight) / 2);
      text(value, x, y + offset, width, height - offset, size, font, { ...options, align: "center" });
    };
    const card = (x, y, width, height, fill, stroke = "#c7ddeb", radius = 6) => {
      doc.lineWidth(.7).roundedRect(x, y, width, height, radius).fillAndStroke(fill, stroke);
    };
    const circle = (x, y, radius, fill) => doc.circle(x, y, radius).fill(fill);
    const line = (x1, y1, x2, y2, color = "#b9d3e2", width = .7) => {
      doc.lineWidth(width).strokeColor(color).moveTo(x1, y1).lineTo(x2, y2).stroke();
    };
    const icon = (kind, x, y, size = 20) => {
      const file = ICON_FILES[kind];
      if (!file) throw new Error(`Unknown volunteer letter icon: ${kind}`);
      doc.image(ASSET(file), x - size / 2, y - size / 2,
        { fit: [size, size], align: "center", valign: "center" });
    };
    const starBullet = (x, y, radius = 9) => {
      circle(x, y, radius, NAVY);
      const points = [];
      for (let point = 0; point < 10; point += 1) {
        const angle = -Math.PI / 2 + point * Math.PI / 5;
        const r = point % 2 === 0 ? radius * .63 : radius * .27;
        points.push([x + Math.cos(angle) * r, y + Math.sin(angle) * r]);
      }
      doc.polygon(...points).fill("#ffd84d");
    };
    const number = (value, x, y, radius = 11) => {
      circle(x, y, radius, TEAL);
      text(value, x - radius, y - radius + 3, radius * 2, radius * 2 - 5,
        radius + 1, "Helvetica-Bold", { align: "center", color: "#ffffff" });
    };
    const bar = (title, x, y, width, height = 25, glyph = null, fill = NAVY) => {
      card(x, y, width, height, fill, fill, 5);
      if (glyph) {
        icon(glyph, x + 16, y + height / 2, 20);
        text(title, x + 33, y + 5, width - 39, height - 9, 9, "Helvetica-Bold", { color: "#ffffff" });
      } else {
        text(title, x + 10, y + 5, width - 20, height - 9, 9, "Helvetica-Bold", { color: "#ffffff" });
      }
    };
    const headerHeight = 90;
    const bodyScale = (756 - headerHeight) / (756 - 77);
    const beginBody = () => {
      doc.save().translate(0, headerHeight - 77 * bodyScale).scale(1, bodyScale);
    };
    const header = () => {
      doc.rect(0, 0, 612, headerHeight).fill(NAVY);
      doc.save().fillOpacity(.22).fillColor("#147196")
        .moveTo(0, 0).lineTo(220, 0).lineTo(477, headerHeight).lineTo(0, 28).closePath().fill()
        .moveTo(612, 0).lineTo(612, headerHeight).lineTo(363, headerHeight).closePath().fill();
      doc.restore();
      doc.rect(0, headerHeight - 1, 612, 2).fill(GOLD);
      doc.image(ASSET("cooper-debate-badge.png"), 16, 12,
        { fit: [65, 68], align: "center", valign: "center" });
      doc.image(ASSET("cooper-jaguar-mark.png"), 528, 14,
        { fit: [57, 63], align: "center", valign: "center" });
      text("Cooper Debate Team", 113, 7, 383, 41, 31, "GreatVibes",
        { align: "center", color: "#ffffff" });
      text("S P E A K    ·    R E A S O N    ·    L E A D", 119, 44, 370, 12, 9,
        "Helvetica-Bold", { align: "center", color: GOLD });
      text("C O O P E R  M I D D L E  S C H O O L   ·   M C L E A N,  V I R G I N I A",
        111, 57, 383, 11, 6.8, "Helvetica", { align: "center", color: "#e3edf5" });
    };
    const footer = page => {
      doc.save().fillColor(TEAL).moveTo(0, 760)
        .bezierCurveTo(140, 786, 273, 762, 612, 778)
        .lineTo(612, 792).lineTo(0, 792).closePath().fill();
      doc.fillColor(NAVY).moveTo(0, 775)
        .bezierCurveTo(183, 789, 362, 771, 612, 786)
        .lineTo(612, 792).lineTo(0, 792).closePath().fill();
      doc.restore();
      text(`Page ${page} of 2`, 525, 765, 69, 11, 7.5, "Helvetica", { align: "right" });
    };
    const contact = (x, y, width, height) => {
      card(x, y, width, height, "#fff9e8", "#f2de98");
      bar("CONTACT SUPPORT", x, y, width, 24, "contact");
      const intro = "If you have any questions before or during the tournaments, please contact:";
      const closing = "On tournament day, contact a coach or tournament volunteer if you need help.";
      const textWidth = width - 28;
      const introY = y + 30;
      const introHeight = doc.font("Helvetica").fontSize(7.7)
        .heightOfString(intro, { width: textWidth, lineGap: 1 });
      const closingHeight = doc.font("Helvetica").fontSize(7.5)
        .heightOfString(closing, { width: textWidth, lineGap: 1 });
      const closingY = y + height - 7 - closingHeight;
      const boxHeight = 23;
      const boxY = (introY + introHeight + closingY - boxHeight) / 2;
      text(intro, x + 14, introY, textWidth, introHeight + 2, 7.7);
      card(x + 14, boxY, textWidth, boxHeight, TEAL, GOLD, 4);
      centeredText("Coach Pamela Konde at pgkonde@fcps.edu",
        x + 19, boxY + 4, width - 38, boxHeight - 4, 9, "Helvetica-Bold", { color: "#ffffff" });
      text(closing, x + 14, closingY, textWidth, closingHeight + 2, 7.5);
    };
    const privacyAndThanks = (x, y, width, thanksY, thanksHeight) => {
      card(x, y, width, thanksY - y - 6, "#edf8fb", "#c8e0e9");
      bar("PRIVACY", x, y, width, 23, "privacy");
      text("Your contact information and notes are shared only with the Cooper Debate coaching staff and used solely for tournament-related communication.",
        x + 12, y + 28, width - 24, thanksY - y - 35, 7.1);
      card(x, thanksY, width, thanksHeight, NAVY, NAVY);
      icon("resolution", x + 27, thanksY + 20, 29);
      text("Thank you again for supporting\nthe Cooper Debate Team!",
        x + 61, thanksY + 3, width - 71, 28, 11.6, "Times-Bold", { color: GOLD });
      text("WE LOOK FORWARD TO SEEING YOU AT THE TOURNAMENTS THIS SEASON!",
        x + 61, thanksY + thanksHeight - 10, width - 71, 8, 5.7, "Helvetica-Bold",
        { color: "#e7eef8" });
    };

    const name = clean(submission.parentName, 120) ||
      [clean(submission.parentFirstName, 60), clean(submission.parentLastName, 60)]
        .filter(Boolean).join(" ") || "Volunteer";
    const firstName = clean(submission.parentFirstName, 60) || name.split(/\s+/)[0];
    doc.addPage();
    header();
    beginBody();

    circle(43, 116, 27, "#e2f6fa");
    icon("gavel", 43, 116, 39);
    text("2 0 2 6  –  2 7   S E A S O N", 81, 87, 283, 13, 8.5, "Helvetica-Bold");
    if (testPreview) {
      card(236, 86, 192, 15, CREAM, GOLD, 3);
      text("TEST PREVIEW — NOT A REAL REGISTRATION", 240, 89, 184, 11, 6.8,
        "Helvetica-Bold", { align: "center" });
    }
    text("Season Judge Availability\nConfirmation", 81, 101, 342, 52, 23, "Times-Bold");
    text(`${firstName}, thank you for representing Cooper!`, 22, 158, 404, 21,
      18, "Times-Bold");
    text("Thank you for volunteering to judge at the 2026–27 tournaments. You are representing the Cooper Debate Team at these events. To support fair and unbiased rounds, you will not judge Cooper teams and may be assigned to rounds involving other schools.",
      22, 181, 400, 42, 8.4);

    card(435, 88, 161, 136, "#fffbec", "#9cc9d4");
    circle(463, 116, 18, NAVY);
    icon("signup", 463, 116, 30);
    text(`${tournaments.length} ${tournaments.length === 1 ? "TOURNAMENT" : "TOURNAMENTS"}\nSELECTED`,
      488, 103, 99, 39, 10.5, "Helvetica-Bold");
    line(448, 143, 584, 143, NAVY, .9);
    text("Full-day commitment on\neach date:", 448, 150, 136, 28, 9);
    card(448, 181, 136, 28, "#fff0be", "#fff0be");
    text("8:00 AM – 5:30 PM", 451, 189, 130, 13, 10.6, "Helvetica-Bold",
      { align: "center" });

    bar("YOUR REGISTRATION DETAILS", 16, 228, 262, 26, "signup");
    bar("YOUR SELECTED TOURNAMENTS", 285, 228, 311, 26, "resolution");
    card(16, 254, 262, 209, PALE);
    const details = [
      ["Role", "Judge"],
      ["Volunteer Name", name],
      ["Your Debater", clean(submission.studentName, 120) || "Not provided"],
      ["Email", clean(submission.email, 160) || "Not provided"],
      ["Phone", clean(submission.phone, 40) || "Not provided"],
      ["Tabroom Account", clean(submission.tabroomUsernameOrEmail, 160) || "Not provided"],
      ["Availability", "8:00 AM – 5:30 PM (Full Day)"],
      ["Registration", `2026–27 Season\n(${tournaments.length} ${tournaments.length === 1 ? "Tournament" : "Tournaments"})`],
    ];
    let detailY = 255;
    details.forEach(([label, value], index) => {
      const height = index === details.length - 1 ? 35 : 24.5;
      if (index % 2 === 0) doc.rect(17, detailY, 260, height).fill("#d9eefa");
      text(label, 26, detailY + 5, 91, height - 7, 7.9, "Helvetica-Bold");
      text(value, 122, detailY + 4, 146, height - 6, 8);
      detailY += height;
    });

    card(285, 254, 311, 209, "#f7fbfd");
    const columns = [286, 308, 360, 441, 535, 595];
    doc.rect(286, 255, 309, 25).fill("#dceff7");
    ["No.", "Date", "Tournament", "Location", "Commitment"].forEach((label, index) =>
      centeredText(label, columns[index] + 1, 256,
        columns[index + 1] - columns[index] - 2, 23, 7.3, "Helvetica-Bold"));
    for (let index = 0; index < 5; index += 1) {
      const top = 280 + index * 36.4;
      if (index % 2 === 0) doc.rect(286, top, 309, 36.4).fill("#e9f5fa");
      columns.slice(1, -1).forEach(x => line(x, top, x, top + 36.4, "#cbdfe9", .4));
      const item = tournaments[index];
      if (!item) continue;
      number(String(index + 1), (columns[0] + columns[1]) / 2, top + 18, 9);
      centeredText(item.short.replaceAll(", ", ",\n"), 310, top + 2, 48, 32.4, 7);
      centeredText(item.name, 363, top + 2, 75, 32.4, 7.7, "Helvetica-Bold");
      centeredText(item.address, 444, top + 2, 88, 32.4, 6.5);
      card(538, top + 6, 54, 25, MINT, MINT, 4);
      centeredText("Full Day\n8:00 AM – 5:30 PM", 540, top + 7, 50, 23, 6.4, "Helvetica-Bold");
    }

    card(16, 470, 580, 52, "#fff6d9", "#f5da79");
    circle(41, 493, 17, NAVY);
    icon("resolution", 41, 493, 28);
    text("YOUR SEASON COMMITMENT", 68, 476, 507, 16, 10, "Helvetica-Bold");
    text(`You selected ${tournaments.length} full-day ${tournaments.length === 1 ? "tournament" : "tournaments"} to judge. These dates are your availability, not a confirmed judging assignment. Cooper Debate coaches will coordinate Tabroom registration for each selected event.`,
      68, 494, 506, 26, 8.2);

    bar("WHAT TO EXPECT", 16, 529, 580, 25, "checklist");
    card(16, 554, 580, 93, "#f7fcfd", "#d3e7ed");
    const expectationIcons = ["signup", "info", "checklist", "contact", "checklist"];
    EXPECTATIONS.forEach((item, index) => {
      const x = 16 + index * 116;
      if (index > 0) line(x, 563, x, 639, "#b4d5dc", .8);
      circle(x + 58, 575, 16, "#e0f3f8");
      icon(expectationIcons[index], x + 58, 575, 28);
      text(item, x + 8, 595, 100, 47, 7.3, "Helvetica", { align: "center" });
    });
    contact(16, 653, 286, 103);
    privacyAndThanks(308, 653, 288, 713, 43);
    doc.restore();
    footer(1);

    doc.addPage();
    header();
    beginBody();
    circle(44, 113, 27, "#e2f6fa");
    icon("car", 44, 113, 39);
    text("Tournament Day Guide", 81, 89, 310, 39, 28, "Times-Bold");
    text("2 0 2 6  –  2 7   S E A S O N   ·   J U D G E   I N F O R M A T I O N",
      84, 130, 304, 13, 7.3, "Helvetica-Bold");
    card(391, 86, 205, 69, "#fff7dc", "#e5d29d");
    icon("gavel", 407, 107, 25);
    text("Thank you for supporting\nthe Cooper Debate Team!", 427, 90, 163, 35,
      13.4, "Times-Bold");
    text("We look forward to seeing you at the tournaments this season!",
      402, 128, 182, 24, 7.7, "Times-Italic");

    const guides = [
      {
        title: "ARRIVAL & PARKING", glyph: "car",
        items: [
          "For in-person dates, arrive early at 8:00 AM for check-in.",
          "Enter through the main entrance from the parking lot.",
          "Check in at Judge Registration in the lobby.",
          "Parking is available in the main school lot.",
          "Look for signs and student volunteers.",
        ],
      },
      {
        title: "REFRESHMENTS", glyph: "meals",
        items: [
          "Complimentary lunch will be provided at in-person tournaments.",
          "Coffee, water, and light snacks will be available throughout the day.",
          "Share dietary restrictions in advance if possible.",
        ],
      },
      {
        title: "WHAT TO EXPECT", glyph: "checklist",
        items: [
          "Multiple rounds throughout the day.",
          "Each round lasts about 60 minutes, plus feedback.",
          "Evaluate speeches, crossfire, and rebuttals using a ballot.",
          "Coaches and volunteers can answer questions.",
          "You may be paired with another judge.",
        ],
      },
      {
        title: "VIRTUAL TOURNAMENT\nINFORMATION", glyph: "info",
        items: [
          "Join using the meeting link sent closer to the event.",
          "Complete online check-in at the start of the day.",
          "Test your microphone and camera beforehand.",
          "Stay available for the full judging window (8:00 AM–5:30 PM).",
          "Contact a coach about technical issues.",
        ],
      },
    ];
    guides.forEach((guide, index) => {
      const x = 16 + index * 146;
      const width = 140;
      card(x, 160, width, 222, "#edf6fa", "#d6e8ed");
      bar(guide.title, x, 160, width, 30, guide.glyph);
      guide.items.forEach((item, itemIndex) => {
        const row = guide.items.length === 3 ? 52 : 34;
        const top = 195 + itemIndex * row;
        if (index === 0) {
          circle(x + 16, top + 7, 9, NAVY);
          text(itemIndex + 1, x + 7, top + 2, 18, 14, 8, "Helvetica-Bold",
            { align: "center", color: "#ffffff" });
        } else {
          starBullet(x + 16, top + 7);
        }
        text(item, x + 30, top - 1, width - 37, row - 3, 7.1);
      });
    });

    bar("YOUR TOURNAMENT LOCATIONS", 16, 388, 580, 29, "car");
    text(`Below are the ${tournaments.length} ${tournaments.length === 1 ? "tournament" : "tournaments"} you selected. Detailed instructions will be shared closer to each event.`,
      277, 394, 306, 19, 7.2, "Helvetica", { color: "#e9f4fa" });
    const gap = 6;
    const venueWidth = (580 - (tournaments.length - 1) * gap) / tournaments.length;
    doc.font("Helvetica").fontSize(7);
    const dateWidth = Math.max(...tournaments.map(item => doc.widthOfString(item.short))) + 2;
    const dateOffset = (venueWidth - 23 - dateWidth) / 2;
    tournaments.forEach((item, index) => {
      const x = 16 + index * (venueWidth + gap);
      card(x, 417, venueWidth, 220, "#edf7fa", "#d5e8ed", 4);
      const dateStart = x + dateOffset;
      number(String(index + 1), dateStart + 9, 433, 9);
      text(item.short, dateStart + 23, 430, dateWidth, 12, 7);
      centeredText(item.name, x + 6, 448, venueWidth - 12, 31, 10, "Times-Bold");
      card(x + 5, 481, venueWidth - 10, 62, "#dceef5", "#dceef5", 3);
      icon(item.online ? "info" : "car", x + venueWidth / 2, 494, 24);
      centeredText(item.online ? "VIRTUAL EVENT" : "IN-PERSON VENUE", x + 7, 507,
        venueWidth - 14, 11, 6.4, "Helvetica-Bold");
      centeredText(item.address, x + 7, 518, venueWidth - 14, 23, 6.8);
      doc.font("Helvetica").fontSize(7.1);
      const timeWidth = doc.widthOfString("8:00 AM – 5:30 PM") + 2;
      const timeStart = x + (venueWidth - 20 - timeWidth) / 2;
      starBullet(timeStart + 8, 558, 8);
      centeredText("8:00 AM – 5:30 PM\n(Full Day)", timeStart + 20, 546,
        timeWidth, 25, 7.1);
      card(x + 5, 581, venueWidth - 10, 49, MINT, MINT, 3);
      centeredText(item.online
        ? "Join via the link provided closer to the event. Test your audio and camera."
        : "Arrive early for check-in. Parking is available in the main school parking lot.",
      x + 10, 584, venueWidth - 20, 43, 6.7);
    });
    contact(16, 644, 286, 112);
    privacyAndThanks(308, 644, 288, 713, 43);
    doc.restore();
    footer(2);
    doc.end();
  });
}

module.exports = { createSeasonLetter, VENUES, EXPECTATIONS };