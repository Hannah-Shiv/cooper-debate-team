const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const publicScript = fs.readFileSync("js/volunteer-public.js", "utf8");
const functionsIndex = fs.readFileSync("functions/index.js", "utf8");
const emailService = fs.readFileSync("functions/volunteer-email.js", "utf8");
const tournamentPage = fs.readFileSync("tournaments.html", "utf8");
const { createVolunteerItineraryAttachment } = require("../functions/volunteer-email.js");
const letterAssetNames = [
  "signup-details.png",
  "tournament-resolution.png",
  "what-to-expect.png",
  "arrival-parking.png",
  "meals-refreshments.png",
  "important-information.png",
  "contact-support.png",
  "privacy.png",
  "cooper-debate-badge.png",
];

test("signup response reports saved and provider email status separately", () => {
  assert.match(functionsIndex, /signupSaved:\s*true/);
  assert.match(functionsIndex, /emailStatus:\s*emailResult\.accepted\s*\?\s*"accepted"\s*:\s*"delayed"/);
  assert.match(functionsIndex, /emailStatus\s*=\s*"failed"/);
});

test("confirmation delivery treats prior provider acceptance as accepted", () => {
  assert.match(emailService, /reservation === "sent"\)\s*return \{ accepted: true, alreadyAccepted: true \}/);
  assert.match(emailService, /reservation === "sending"\)\s*return \{ accepted: false, pending: true \}/);
  assert.match(emailService, /"Idempotency-Key": key/);
});

test("thank-you dialog only claims provider acceptance when reported", () => {
  assert.match(publicScript, /emailStatus === "accepted"/);
  assert.match(publicScript, /accepted for delivery/);
  assert.match(publicScript, /signup is saved, but the confirmation email has not been accepted/);
  assert.match(tournamentPage, /id="vol-retry-email"/);
});

test("email retry uses the saved signup reference and cannot submit signup fields", () => {
  assert.match(publicScript, /action:\s*"retry-confirmation-email"/);
  assert.match(publicScript, /signupId:\s*confirmedSignupId/);
  assert.match(publicScript, /retryToken:\s*confirmedRetryToken/);
  assert.match(functionsIndex, /body\.action === "retry-confirmation-email"/);
  assert.match(functionsIndex, /collection\("volunteer_signups"\)\.doc\(retrySignupId\)/);
  assert.match(functionsIndex, /emailRetryTokenHash/);
  assert.match(functionsIndex, /Please wait 30 seconds before retrying/);
  assert.match(functionsIndex, /`manual-\$\{retrySignup\.lastManualEmailRetryAtMs\}`/);
  assert.match(emailService, /notificationKey\(signup\.id,\s*"confirmation",\s*cleanText\(deliveryVersion,\s*120\)\)/);
  assert.match(publicScript, /retry\.hidden = !confirmedSignupId \|\| !confirmedRetryToken/);
  assert.match(tournamentPage, />Resend Email<\/button>/);
});

test("a repeat signup overwrites the saved record and triggers a fresh automatic email", () => {
  assert.match(functionsIndex, /if \(signupSnap\.exists\)/);
  assert.match(functionsIndex, /updateExistingSignup\(signupRef,\s*signupSnap\.data\(\)\)/);
  assert.match(functionsIndex, /resolvedSignupId = existingSignupId/);
  assert.match(functionsIndex, /existing signup has been updated and a new confirmation email has been sent/);
  assert.match(functionsIndex, /`confirm-\$\{savedSignup\.confirmationRequestId\}`/);
  assert.match(functionsIndex, /const deliveryVersion = confirmationRequestId \? `confirm-\$\{confirmationRequestId\}` : ""/);
  assert.match(functionsIndex, /if \(result\.pending\)/);
  assert.match(functionsIndex, /Confirmation email delivery is still in progress/);
  assert.match(functionsIndex, /roles\[previousRoleIndex\]\.signedUp = Math\.max\(0,/);
  assert.match(functionsIndex, /roles\[roleIndex\]\.signedUp \+= 1/);
  assert.match(functionsIndex, /retryToken: emailRetryToken/);
  assert.match(publicScript, /window\.turnstile\.reset\(turnstileWidgetId\)/);
});

test("the approved meal information is identical in signup UI and email content", () => {
  for (const sentence of [
    "A complimentary lunch will be provided for all judges.",
    "Light refreshments (coffee, water, snacks) will be available throughout the day.",
    "Please let us know about any dietary restrictions in advance if possible.",
  ]) {
    assert.match(publicScript, new RegExp(sentence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(emailService, new RegExp(sentence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(emailService, /useApprovedOnePager\s*=\s*kind === "confirmation"/);
  assert.match(emailService, /useApprovedOnePager \? APPROVED_RESOLUTION/);
  assert.match(emailService, /\? APPROVED_IMPORTANT_INFORMATION\.join\("\\n"\)/);
  assert.match(emailService, /\? APPROVED_EXPECTATIONS\.join\("\\n"\)/);
  assert.match(emailService, /APPROVED_ARRIVAL/);
  assert.match(emailService, /APPROVED_CONTACT/);
});

test("the public judge signup logistics match the one-pager and ignore editable legacy instructions", () => {
  for (const constant of [
    "APPROVED_RESOLUTION",
    "APPROVED_EXPECTATIONS",
    "APPROVED_ARRIVAL",
    "APPROVED_MEAL_ITEMS",
    "APPROVED_IMPORTANT_INFORMATION",
    "APPROVED_CONTACT",
  ]) {
    assert.match(publicScript, new RegExp(constant));
  }
  for (const heading of ["Arrival & Parking", "Refreshments", "Information", "Coach contact"]) {
    assert.match(publicScript, new RegExp(heading));
  }
  assert.doesNotMatch(publicScript, /<aside class="vol-public-sidebar">/);
  assert.match(tournamentPage, /\.vol-availability-options\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)[^}]*grid-template-rows:repeat\(2,minmax\(78px,auto\)\)/s);
  assert.doesNotMatch(publicScript, /Judge at least 3 preliminary rounds/);
  assert.doesNotMatch(publicScript, /Please arrive 20 minutes early/);
  assert.doesNotMatch(publicScript, /walking from the parking lot takes about 5 minutes/);
  assert.doesNotMatch(publicScript, /publicExpectations|judgeNotes|assignmentNotes/);
  assert.doesNotMatch(publicScript, /selectedEvent\.judgeInstructions|selectedEvent\.expectations/);
  assert.match(publicScript, /title: "Coach contact", label: APPROVED_CONTACT\.join\(" "\), email: "pgkonde@fcps\.edu"/);
});

test("the public WASDL schedule modal uses a published PDF path", () => {
  const publicSchedulePath = "docs/wasdl-tournament-schedule-2026-2027.pdf";
  assert.equal((tournamentPage.match(new RegExp(publicSchedulePath.replaceAll(".", "\\."), "g")) || []).length, 2);
  assert.doesNotMatch(tournamentPage, /attached_assets\/WASDL_Tournament_Schedule/);
  assert.ok(fs.existsSync(publicSchedulePath));
});

test("confirmation email uses navy bars and only approved one-pager logistics", () => {
  assert.equal((emailService.match(/background:#062451/g) || []).length, 2);
  assert.doesNotMatch(emailService, /background:#0e3b2e/);
  assert.match(emailService, /const useApprovedOnePager = kind === "confirmation"/);
  assert.match(emailService, /useApprovedOnePager \? APPROVED_RESOLUTION/);
  assert.match(emailService, /useApprovedOnePager \? APPROVED_CONTACT\[1\]/);
  assert.match(emailService, /\["Arrival & parking", APPROVED_ARRIVAL\]/);
  assert.match(emailService, /\["Meals & refreshments", APPROVED_MEAL_ITEMS\]/);
  assert.match(emailService, /\["What to expect", APPROVED_EXPECTATIONS\]/);
  assert.match(emailService, /\["Important information", APPROVED_IMPORTANT_INFORMATION\]/);
  assert.match(emailService, /\["Contact & support", APPROVED_CONTACT\]/);
  assert.doesNotMatch(emailService, /Lunch will not be provided/);
  assert.doesNotMatch(emailService, /moratorium on hyperscale data center construction/);
  assert.doesNotMatch(emailService, /Judge at least 3 preliminary rounds/);
});

test("confirmation email uses the approved subject, greeting, and square C banner logo", () => {
  assert.match(emailService, /subject: `Confirmed: \$\{eventName\} Volunteer Signup`/);
  assert.match(emailService, /Hi \$\{name\}, thank you for volunteering for the Cooper Debate Team\./);
  assert.doesNotMatch(emailService, /thank you for volunteering with Cooper Debate\. Your signup is confirmed\./);
  assert.match(emailService, /https:\/\/cooperdebateteam\.com\/images\/index-footer-jaguar\.png/);
  assert.match(emailService, /width=\\"46\\" height=\\"46\\"/);
});

test("the automatic email attaches the exact browser-generated one-pager", async () => {
  const supplied = Buffer.from("%PDF-1.4\nexact-browser-one-pager\n", "utf8").toString("base64");
  const attachment = await createVolunteerItineraryAttachment(
    { title: "Hyperscale Data Centers", date: "2026-09-26" },
    { confirmationPdfBase64: supplied }
  );
  assert.equal(attachment.content, supplied);
  assert.match(publicScript, /payload\.confirmationPdfBase64 = pdfDataUrl\.split/);
  assert.match(functionsIndex, /confirmationPdfBase64,/);
  assert.match(functionsIndex, /if \(!confirmationPdfBase64\)/);
});

test("signup failures are shown beside the visible confirm action", () => {
  assert.match(tournamentPage, /id="vol-review-submit-status"/);
  assert.match(publicScript, /\[status, reviewStatus\]\.forEach/);
  assert.match(tournamentPage, /vol-review-submit-status\.is-error/);
});

test("invalid and throttled retry capabilities return honest errors", () => {
  assert.match(functionsIndex, /status\(403\)\.json\(\{ error: retryError \}\)/);
  assert.match(functionsIndex, /status\(429\)\.json\(\{ error: retryError \}\)/);
  assert.match(functionsIndex, /status\(503\)\.json/);
  assert.match(functionsIndex, /retry authorization failed/);
  assert.match(functionsIndex, /retry delivery failed/);
});

test("confirmation modal previews the complete generated letter above its actions", () => {
  assert.match(tournamentPage, /id="vol-confirmation-letter-preview"/);
  assert.match(tournamentPage, /Thank you for confirming\./);
  assert.match(tournamentPage, /class="vol-confirmation-summary"/);
  assert.match(tournamentPage, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(tournamentPage, /class="vol-confirmation-summary-status"/);
  assert.match(tournamentPage, /\.vol-confirmation-summary-status\s*\{[^}]*grid-template-columns:54px minmax\(0,1fr\);[^}]*padding:5px 22px 5px 0;/s);
  assert.ok(
    tournamentPage.indexOf('class="vol-thank-you-icon"') <
      tournamentPage.indexOf('id="vol-thank-you-title"')
  );
  assert.ok(
    tournamentPage.indexOf('id="vol-thank-you-title"') <
      tournamentPage.indexOf('id="vol-thank-you-email-note"')
  );
  assert.ok(
    tournamentPage.indexOf('id="vol-thank-you-email-note"') <
      tournamentPage.indexOf('id="vol-confirmation-letter-preview"')
  );
  assert.match(publicScript, /confirmedLetterPreviewUrl = canvas\.toDataURL/);
  assert.match(publicScript, /preview\.src = confirmedLetterPreviewUrl/);
  assert.match(publicScript, /card\.scrollTop = 0/);
});

test("confirmation preview uses one navy shell with charcoal utility actions", () => {
  assert.match(tournamentPage, /#volunteer-thank-you-modal \.vol-thank-you-card\s*\{[^}]*background:#071b34;/s);
  assert.match(tournamentPage, /#volunteer-thank-you-modal \.vol-confirmation-summary\s*\{[^}]*background:#071b34;/s);
  assert.match(tournamentPage, /#volunteer-thank-you-modal \.vol-confirmation-letter-stage\s*\{[^}]*background:#071b34;/s);
  assert.match(tournamentPage, /#volunteer-thank-you-modal \.vol-confirmation-actions\s*\{[^}]*background:#071b34;/s);
  assert.match(tournamentPage, /#volunteer-thank-you-modal \.vol-confirmation-actions \.vol-cancel\s*\{[^}]*background:#292d33;[^}]*color:#ffd84d;/s);
  assert.match(tournamentPage, /id="vol-thank-you-done"[^>]*>Close<\/button>/);
});

test("signup information reader shows complete guidance without an internal scrollbar", () => {
  assert.match(tournamentPage, /\.vol-condensed-form-layout\s*\{[^}]*grid-template-columns:minmax\(0,1fr\) 545px/s);
  assert.match(tournamentPage, /#volunteer-modal \.vol-condensed-form-layout\s*\{[^}]*grid-template-columns:minmax\(0,1fr\) 545px;/s);
  assert.match(tournamentPage, /#volunteer-modal \.vol-info-reader\s*\{[^}]*display:grid;[^}]*grid-template-columns:32px minmax\(0,1fr\);[^}]*grid-template-rows:32px minmax\(0,1fr\);[^}]*height:210px;[^}]*min-height:210px;[^}]*max-height:210px;[^}]*overflow:hidden;/s);
  assert.match(tournamentPage, /\.vol-judge-modal\s*\{[^}]*max-width:1320px;[^}]*overflow:hidden;[^}]*width:calc\(100vw - 12px\);/s);
  assert.match(tournamentPage, /@media\(min-width:981px\) and \(max-height:730px\)\{[^}]*\.vol-condensed-form-layout\s*\{[^}]*height:auto;/s);
  assert.match(tournamentPage, /@media\(min-width:981px\) and \(max-height:720px\)\{[^}]*\.vol-judge-modal\s*\{[^}]*max-height:none;[^}]*overflow:visible;[^}]*width:136%;[^}]*zoom:\.73;/s);
  assert.match(tournamentPage, /#volunteer-modal \.vol-condensed-main\s*\{[^}]*align-content:start;[^}]*align-self:stretch;/s);
  assert.match(tournamentPage, /grid-template-rows:auto auto 210px auto;/);
  assert.match(tournamentPage, /#volunteer-modal \.vol-info-reader-icon\s*\{[^}]*height:32px;[^}]*width:32px;/s);
  assert.match(tournamentPage, /#volunteer-modal \.vol-info-reader strong\s*\{[^}]*grid-column:2;[^}]*grid-row:1;/s);
  assert.match(tournamentPage, /#volunteer-modal \.vol-info-reader p\s*\{[^}]*grid-column:1\/-1;[^}]*grid-row:2;/s);
});

test("coach contact email action is a compact teal button with clear contrast", () => {
  assert.match(tournamentPage, /#volunteer-modal \.vol-info-reader \.vol-info-email-coach\s*\{[^}]*background:linear-gradient\(135deg,#043e48,#032f43\);[^}]*color:#fff;[^}]*font:700 \.68rem\/1[^}]*padding:10px 16px;[^}]*width:auto;/s);
  assert.match(tournamentPage, /#volunteer-modal \.vol-info-reader \.vol-info-email-coach \.vol-modal-icon\s*\{[^}]*color:#f5c542;/s);
});

test("signup information topic buttons prioritize readable labels over oversized icons", () => {
  assert.match(tournamentPage, /#volunteer-modal \.vol-info-trigger\s*\{[^}]*height:33px;[^}]*width:37px;/s);
  assert.match(tournamentPage, /#volunteer-modal \.vol-info-trigger \.vol-modal-icon\s*\{[^}]*height:31px;[^}]*width:31px;/s);
  assert.match(tournamentPage, /#volunteer-modal \.vol-info-callout strong\s*\{[^}]*font-size:\.68rem;[^}]*line-height:1.25;/s);
  assert.match(tournamentPage, /#volunteer-modal \.vol-info-trigger,\s*#volunteer-modal \.vol-info-trigger \.vol-modal-icon\s*\{[^}]*height:24px;[^}]*width:25px;/s);
});

test("signup actions keep visible breathing room below the information panel", () => {
  assert.match(tournamentPage, /#volunteer-modal section\[data-vol-step="1"\] \.vol-modal-actions\s*\{[^}]*margin-top:30px;/s);
  assert.match(tournamentPage, /@media\(min-width:981px\)\{[^]*?#volunteer-modal \.vol-condensed-form-layout\s*\{[^}]*height:auto;[^]*?#volunteer-modal section\[data-vol-step="1"\] \.vol-modal-actions\s*\{[^}]*margin-top:30px;/s);
});

test("judge opportunity header uses teal instead of the results-panel navy", () => {
  assert.match(tournamentPage, /\.vol-panel-purpose--entry\s*\{[^}]*linear-gradient\(90deg,#0b6b61 0%,#075f58 100%\)/s);
  assert.doesNotMatch(tournamentPage, /\.vol-panel-purpose--entry\s*\{[^}]*#0c234d/s);
});

test("Turnstile completion resumes a pending signup automatically", () => {
  assert.match(publicScript, /submitPendingTurnstile = true/);
  assert.match(publicScript, /if \(!submitPendingTurnstile \|\| signupSubmitting\) return/);
  assert.match(publicScript, /volunteer-signup-form"\)\?\.requestSubmit\(\)/);
});

test("confirmation PDF is prepared before submit and the modal opens before roster refresh", () => {
  assert.match(publicScript, /const preparedPdf = await pdfPromise/);
  assert.match(publicScript, /payload\.confirmationPdfBase64 = pdfDataUrl\.split/);
  const successBlock = publicScript.slice(
    publicScript.indexOf('confirmedSignupId = result.signupId'),
    publicScript.indexOf('} catch (error)', publicScript.indexOf('confirmedSignupId = result.signupId'))
  );
  assert.ok(successBlock.indexOf("openThankYou(result.emailStatus)") < successBlock.indexOf("loadVolunteerEvents()"));
  assert.doesNotMatch(successBlock, /await loadVolunteerEvents/);
});

test("browser and email PDF builders include every supplied letter asset and local font", () => {
  assert.equal(fs.existsSync("fonts/GreatVibes-Regular.ttf"), true);
  assert.equal(fs.existsSync("functions/assets/volunteer-letter/GreatVibes-Regular.ttf"), true);
  for (const filename of letterAssetNames) {
    assert.equal(fs.existsSync(`images/volunteer-letter/${filename}`), true, `missing browser asset ${filename}`);
    assert.equal(fs.existsSync(`functions/assets/volunteer-letter/${filename}`), true, `missing email asset ${filename}`);
  }
  assert.match(publicScript, /drawStar/);
  assert.match(publicScript, /privacy: "images\/volunteer-letter\/privacy\.png\?v=3"/);
  assert.match(emailService, /registerFont\("GreatVibes"/);
  assert.match(emailService, /document\.polygon\(\.\.\.points\)\.fill\(starYellow\)/);
});

test("confirmation PDFs use the tournament name and an ordinal long-form date", () => {
  assert.match(publicScript, /function confirmationPdfFilename\(event\)/);
  assert.match(publicScript, /confirmationPdfFilename\(selectedEvent\)/);
  assert.match(publicScript, /Judge_Volunteer_For_\$\{tournamentName/);
  assert.match(publicScript, /`\$\{month\}_\$\{day\}\$\{suffix\}_\$\{year\}`/);
  assert.match(emailService, /confirmationPdfFilename\(event\)/);
  assert.match(emailService, /Judge_Volunteer_For_\$\{tournamentName\}_On_\$\{month\}_\$\{day\}\$\{suffix\}_\$\{year\}\.pdf/);
});

test("confirmation PDF uses supplied title icons, navy circles, yellow stars, and the approved headline", () => {
  assert.match(publicScript, /let fittedSize = 8\.2/);
  assert.match(publicScript, /drawContainedImage\(icon, x \+ 8, y \+ 3, 18, 18\)/);
  assert.match(publicScript, /fillText\("TOURNAMENT JUDGE CONFIRMATION", 306, 102\)/);
  assert.match(publicScript, /rounded\(402, 114, 188, 127, 8, "#dceefa"\)/);
  assert.doesNotMatch(publicScript, /barIconSymbol\(title\)/);
  assert.match(publicScript, /ctx\.fillStyle = navy; ctx\.beginPath\(\); ctx\.arc\(x \+ 4, cursor \+ 5, 5\.2/);
  assert.match(publicScript, /const starYellow = "#ffd84d"/);
  assert.match(publicScript, /ctx\.fillStyle = starYellow; drawStar\(x \+ 4, cursor \+ 5, 3\.22, 1\.44\)/);
  assert.match(publicScript, /ctx\.wordSpacing = "3px"; ctx\.fillText\("Cooper Debate Team"/);
  assert.doesNotMatch(publicScript, /— Cooper Debate Team/);
  assert.match(publicScript, /const boxTitles = \["Arrival & Parking", "Refreshments", "Information", "Contact Support"\]/);
  assert.match(publicScript, /const privacyGreen = "#2f9b62"/);
  assert.match(publicScript, /bar\(22, 697, 278, "Privacy", icons\.privacy, privacyGreen\)/);
  assert.match(publicScript, /wrap\("Thank you for representing Cooper\."/);
  assert.doesNotMatch(publicScript, /Thank You for Representing the Cooper Debate Team!/);

  assert.match(emailService, /document\.image\(icon, x \+ 8, y \+ 3, \{ fit: \[18, 18\]/);
  assert.match(emailService, /\.text\("TOURNAMENT JUDGE CONFIRMATION", 0, 102, \{ width: pageWidth, align: "center"/);
  assert.match(emailService, /document\.roundedRect\(402, 114, 188, 127, 8\)\.fill\("#dceefa"\)/);
  assert.match(emailService, /\.fontSize\(8\.2\)/);
  assert.doesNotMatch(emailService, /sectionBarIcon\(title\)/);
  assert.match(emailService, /document\.circle\(x, y, 5\.2\)\.fill\(navy\)/);
  assert.match(emailService, /point % 2 === 0 \? 3\.22 : 1\.44/);
  assert.match(emailService, /const starYellow = "#ffd84d"/);
  assert.match(emailService, /document\.polygon\(\.\.\.points\)\.fill\(starYellow\)/);
  assert.match(emailService, /wordSpacing: 3/);
  assert.doesNotMatch(emailService, /— Cooper Debate Team/);
  assert.match(emailService, /\["Refreshments", icons\.meals/);
  assert.match(emailService, /\["Information", icons\.information/);
  assert.match(emailService, /\["Contact Support", icons\.contact/);
  assert.match(emailService, /const privacyGreen = "#2f9b62"/);
  assert.match(emailService, /sectionBar\(22, 697, 278, "Privacy", icons\.privacy, privacyGreen\)/);
  assert.match(emailService, /\.text\("Thank you for representing"/);
});

test("the four lower information cards use distinct muted fills", () => {
  for (const color of ["#eef5fb", "#fff8df", "#f3effa", "#fff2e5"]) {
    assert.match(publicScript, new RegExp(color));
    assert.match(emailService, new RegExp(color));
  }
  assert.match(publicScript, /boxFills\[index\], boxLines\[index\]/);
  assert.match(emailService, /fillAndStroke\(fill, border\)/);
});

test("volunteer roster coverage uses full-size and half-day visual states", () => {
  assert.match(tournamentPage, /\.vol-coverage-tag\s*\{[^}]*height:49px;[^}]*width:100%;/s);
  assert.match(tournamentPage, /\.vol-coverage-tag\.is-morning\s*\{[^}]*#f6c928[^}]*color:#121820/s);
  assert.match(tournamentPage, /\.vol-coverage-tag\.is-afternoon\s*\{[^}]*#d9931d[^}]*color:#17120a/s);
  assert.match(tournamentPage, /\.vol-coverage-tag\.is-full\s*\{[^}]*#169c7c[^}]*color:#fff/s);
  assert.match(tournamentPage, /\.vol-coverage-tag\.is-custom\s*\{[^}]*rgba\(128,75,212/);
});

test("all-day coverage is labeled consistently without visible full wording", () => {
  assert.match(publicScript, /label:\s*"All day",\s*className:\s*"is-full"/);
  assert.match(publicScript, /detail:\s*"All-day availability"/);
  assert.match(publicScript, /aria-label="Filter by all-day coverage">All day<\/button>/);
  assert.doesNotMatch(publicScript, /label:\s*"Full"|detail:\s*"Full tournament"|>Full<\/button>/);
});

test("all-day availability is the first and initially selected signup choice", () => {
  assert.match(publicScript, /return \[\s*\{ id: "full"[^]*?\{ id: "morning"[^]*?\{ id: "afternoon"[^]*?\{ id: "custom"/);
  assert.match(publicScript, /const availabilityIconNames = \["full-day", "morning", "afternoon", "other"\]/);
  assert.match(publicScript, /vol-availability-option\$\{index === 0 \? " is-selected" : ""\}/);
  assert.match(publicScript, /\$\{index === 0 \? "checked" : ""\}/);
});

test("phone signup stacks time controls and keeps information readable", () => {
  assert.match(tournamentPage, /@media \(max-width:700px\)[^]*?\.vol-time-grid\s*\{[^}]*grid-template-columns:1fr!important;[^]*?\.vol-info-reader\s*\{[^}]*height:auto;[^}]*min-height:240px;[^}]*max-height:none;[^}]*overflow:visible;/s);
});

test("the narrow review card keeps the Cloudflare widget fully inside its bounds", () => {
  assert.match(publicScript, /appearance: "interaction-only"/);
  assert.match(tournamentPage, /\.vol-review-side #vol-turnstile\s*\{[^}]*border-radius:8px;[^}]*display:flex;[^}]*justify-content:center;[^}]*overflow:hidden;[^}]*width:100%;/s);
  assert.match(tournamentPage, /\.vol-review-side #vol-turnstile > div\s*\{[^}]*border-radius:8px;[^}]*overflow:hidden;[^}]*transform:scale\(\.88\);[^}]*transform-origin:center top;/s);
  assert.match(tournamentPage, /\.vol-review-side #vol-turnstile iframe\s*\{[^}]*border-radius:8px !important;/s);
});

test("long volunteer emails shrink to remain visible in their input", () => {
  assert.match(publicScript, /const fitEmailFieldText = field =>/);
  assert.match(publicScript, /Math\.max\(8\.3, Math\.floor\(\(baseFontSize \* availableWidth \/ textWidth\)/);
  assert.match(publicScript, /field\.style\.setProperty\("font-size", `\$\{fittedFontSize\}px`, "important"\)/);
  assert.match(publicScript, /emailField\?\.addEventListener\("input", \(\) => \{[^}]*fitEmailFieldText\(emailField\)/s);
  assert.match(publicScript, /window\.addEventListener\("resize", \(\) => fitEmailFieldText\(emailField\)\)/);
  assert.match(tournamentPage, /@media \(min-width:701px\)[^]*?\.vol-email-field\s*\{[^}]*grid-column:1\/-1!important;/s);
  assert.match(tournamentPage, /@media \(min-width:701px\)[^]*?\.vol-phone-field\s*\{[^}]*grid-column:1!important;[^}]*grid-row:2!important;[^]*?\.vol-debater-field\s*\{[^}]*display:flex;[^}]*grid-column:2!important;[^}]*grid-row:2!important;/s);
  assert.match(tournamentPage, /@media \(min-width:701px\)[^]*?\.vol-form-grid\s*\{[^}]*grid-template-rows:repeat\(3,minmax\(0,1fr\)\);[^}]*min-height:0;/s);
  assert.match(tournamentPage, /@media \(min-width:701px\)[^]*?\.vol-debater-field label\s*\{[^}]*align-self:flex-start!important;[^}]*justify-content:flex-start;[^}]*width:100%;/s);
  assert.match(tournamentPage, /@media \(min-width:701px\)[^]*?\.vol-compact-entry-field input\s*\{[^}]*height:34px;[^}]*min-height:34px;/s);
  assert.match(tournamentPage, /\.vol-debater-help\s*\{[^}]*border:1px solid rgba\(246,202,73,.72\);[^}]*color:#f6ca49;[^}]*cursor:help;/s);
  assert.match(tournamentPage, /\.vol-debater-help-tooltip\s*\{[^}]*background:#075457;[^}]*font:\.62rem\/1\.45[^}]*width:220px;/s);
  assert.match(tournamentPage, /\.vol-debater-help:hover \.vol-debater-help-tooltip,[^]*?\.vol-debater-help:focus-visible \.vol-debater-help-tooltip\s*\{[^}]*opacity:1;[^}]*visibility:visible;/s);
  assert.match(tournamentPage, /class="vol-debater-help" tabindex="0" role="button" aria-label="About the optional debater field">i/);
  assert.match(tournamentPage, /id="vol-student-name"[^>]*aria-describedby="vol-debater-help-text"/);
  assert.match(tournamentPage, /@media \(min-width:981px\)[^]*?\.vol-availability-card--compact\s*\{[^}]*align-self:stretch;[^}]*box-sizing:border-box;[^}]*height:100%;/s);
  assert.match(tournamentPage, /@media \(min-width:701px\)[^]*?\.vol-phone-field label,[^]*?\.vol-debater-field label\s*\{[^}]*font-size:\.56rem;[^}]*letter-spacing:\.05em;/s);
  assert.match(tournamentPage, /<div class="vol-form-field vol-email-field">\s*<label for="vol-email">/);
});

test("portrait tablet signup uses a compact two-column layout without stretched information", () => {
  assert.match(tournamentPage, /@media \(min-width:701px\) and \(max-width:980px\)[^]*?\.vol-condensed-form-layout\s*\{[^}]*grid-template-columns:minmax\(0,1fr\) 310px;[^]*?\.vol-condensed-main > \.vol-form-grid\s*\{[^}]*grid-template-rows:repeat\(4,auto\);[^}]*height:auto;[^]*?\.vol-signup-sidebar > \.vol-side-card:first-child\s*\{[^}]*height:auto;[^]*?\.vol-info-reader\s*\{[^}]*height:310px;[^}]*min-height:310px;[^}]*max-height:310px;/s);
});

test("phone and portrait tablet modals retain the desktop teal background", () => {
  assert.match(tournamentPage, /@media\(max-width:980px\)[^]*?#volunteer-modal \.vol-judge-modal,[^]*?#volunteer-thank-you-modal \.vol-modal-card\s*\{[^}]*background:#012838;/s);
  assert.doesNotMatch(tournamentPage, /background:linear-gradient\(145deg,#102d59 0%,#071d41 100%\)/);
});

test("volunteer roster reset clears search, sort, filter, and pagination", () => {
  assert.match(publicScript, /class="vol-roster-reset-btn"/);
  assert.match(publicScript, /search\.value = ""/);
  assert.match(publicScript, /button\.classList\.remove\("active"\)/);
  assert.match(publicScript, /button\.setAttribute\("aria-pressed", "false"\)/);
  assert.match(publicScript, /controls\.dataset\.page = "1"/);
  assert.match(tournamentPage, /grid-template-columns:minmax\(82px,\.7fr\)[^;]*minmax\(68px,\.55fr\)/);
});