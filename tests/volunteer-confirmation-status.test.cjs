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
  assert.ok(
    tournamentPage.indexOf('id="vol-confirmation-letter-preview"') <
      tournamentPage.indexOf('id="vol-thank-you-email-note"')
  );
  assert.match(publicScript, /confirmedLetterPreviewUrl = canvas\.toDataURL/);
  assert.match(publicScript, /preview\.src = confirmedLetterPreviewUrl/);
  assert.match(publicScript, /card\.scrollTop = 0/);
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
  assert.match(emailService, /registerFont\("GreatVibes"/);
  assert.match(emailService, /document\.polygon\(\.\.\.points\)\.fill\(gold\)/);
});

test("confirmation PDFs use the tournament name and an ordinal long-form date", () => {
  assert.match(publicScript, /function confirmationPdfFilename\(event\)/);
  assert.match(publicScript, /confirmationPdfFilename\(selectedEvent\)/);
  assert.match(publicScript, /Judge_Volunteer_For_\$\{tournamentName/);
  assert.match(publicScript, /`\$\{month\}_\$\{day\}\$\{suffix\}_\$\{year\}`/);
  assert.match(emailService, /confirmationPdfFilename\(event\)/);
  assert.match(emailService, /Judge_Volunteer_For_\$\{tournamentName\}_On_\$\{month\}_\$\{day\}\$\{suffix\}_\$\{year\}\.pdf/);
});

test("confirmation PDF uses fitted icons, blue circles, yellow stars, and the approved headline", () => {
  assert.match(publicScript, /rounded\(x \+ 10, y \+ 5, 14, 14, 3, gold\)/);
  assert.match(publicScript, /barIconSymbol\(title\)/);
  assert.match(publicScript, /ctx\.fillStyle = "#1857a6"; ctx\.beginPath\(\); ctx\.arc/);
  assert.match(publicScript, /ctx\.fillStyle = gold; drawStar/);
  assert.match(publicScript, /wrap\("Thank you for representing Cooper\."/);
  assert.doesNotMatch(publicScript, /Thank You for Representing the Cooper Debate Team!/);

  assert.match(emailService, /roundedRect\(x \+ 10, y \+ 5, 14, 14, 3\)\.fill\(gold\)/);
  assert.match(emailService, /sectionBarIcon\(title\)/);
  assert.match(emailService, /document\.circle\(x, y, 4\.5\)\.fill\(blue\)/);
  assert.match(emailService, /document\.polygon\(\.\.\.points\)\.fill\(gold\)/);
  assert.match(emailService, /\.text\("Thank you for representing"/);
});

test("volunteer roster coverage uses full-size and half-day visual states", () => {
  assert.match(tournamentPage, /\.vol-coverage-tag\s*\{[^}]*height:49px;[^}]*width:100%;/s);
  assert.match(tournamentPage, /\.vol-coverage-tag\.is-morning\s*\{[^}]*linear-gradient\(to bottom[^}]*50%/s);
  assert.match(tournamentPage, /\.vol-coverage-tag\.is-afternoon\s*\{[^}]*rgba\(221,151,28/);
  assert.match(tournamentPage, /\.vol-coverage-tag\.is-custom\s*\{[^}]*rgba\(128,75,212/);
});

test("all-day coverage is labeled consistently without visible full wording", () => {
  assert.match(publicScript, /label:\s*"All day",\s*className:\s*"is-full"/);
  assert.match(publicScript, /detail:\s*"All-day availability"/);
  assert.match(publicScript, /aria-label="Filter by all-day coverage">All day<\/button>/);
  assert.doesNotMatch(publicScript, /label:\s*"Full"|detail:\s*"Full tournament"|>Full<\/button>/);
});

test("volunteer roster reset clears search, sort, filter, and pagination", () => {
  assert.match(publicScript, /class="vol-roster-reset-btn"/);
  assert.match(publicScript, /search\.value = ""/);
  assert.match(publicScript, /button\.classList\.remove\("active"\)/);
  assert.match(publicScript, /button\.setAttribute\("aria-pressed", "false"\)/);
  assert.match(publicScript, /controls\.dataset\.page = "1"/);
  assert.match(tournamentPage, /grid-template-columns:minmax\(82px,\.7fr\)[^;]*minmax\(68px,\.55fr\)/);
});