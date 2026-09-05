const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const publicScript = fs.readFileSync("js/volunteer-public.js", "utf8");
const functionsIndex = fs.readFileSync("functions/index.js", "utf8");
const emailService = fs.readFileSync("functions/volunteer-email.js", "utf8");
const tournamentPage = fs.readFileSync("tournaments.html", "utf8");
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
});

test("an exact resubmission recovers the saved signup and rotates retry access", () => {
  assert.match(functionsIndex, /if \(signupSnap\.exists\)/);
  assert.match(functionsIndex, /const isExactRetry/);
  assert.match(functionsIndex, /savedSignupData = signupSnap\.data\(\)/);
  assert.match(functionsIndex, /retryToken: emailRetryToken/);
  assert.match(publicScript, /window\.turnstile\.reset\(turnstileWidgetId\)/);
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

test("browser and email PDF builders include every supplied letter asset and local font", () => {
  assert.equal(fs.existsSync("fonts/GreatVibes-Regular.ttf"), true);
  assert.equal(fs.existsSync("functions/assets/volunteer-letter/GreatVibes-Regular.ttf"), true);
  for (const filename of letterAssetNames) {
    assert.equal(fs.existsSync(`images/volunteer-letter/${filename}`), true, `missing browser asset ${filename}`);
    assert.equal(fs.existsSync(`functions/assets/volunteer-letter/${filename}`), true, `missing email asset ${filename}`);
  }
  assert.match(publicScript, /drawStar/);
  assert.match(emailService, /registerFont\("GreatVibes"/);
  assert.match(emailService, /document\.polygon\(\.\.\.points\)\.fill\(blue\)/);
});

test("confirmation PDFs use the tournament name and an ordinal long-form date", () => {
  assert.match(publicScript, /function confirmationPdfFilename\(event\)/);
  assert.match(publicScript, /confirmationPdfFilename\(selectedEvent\)/);
  assert.match(publicScript, /Judge_Volunteer_For_\$\{tournamentName/);
  assert.match(publicScript, /`\$\{month\}_\$\{day\}\$\{suffix\}_\$\{year\}`/);
  assert.match(emailService, /confirmationPdfFilename\(event\)/);
  assert.match(emailService, /Judge_Volunteer_For_\$\{tournamentName\}_On_\$\{month\}_\$\{day\}\$\{suffix\}_\$\{year\}\.pdf/);
});

test("volunteer roster coverage uses full-size and half-day visual states", () => {
  assert.match(tournamentPage, /\.vol-coverage-tag\s*\{[^}]*height:49px;[^}]*width:100%;/s);
  assert.match(tournamentPage, /\.vol-coverage-tag\.is-morning\s*\{[^}]*linear-gradient\(to bottom[^}]*50%/s);
  assert.match(tournamentPage, /\.vol-coverage-tag\.is-afternoon\s*\{[^}]*rgba\(221,151,28/);
  assert.match(tournamentPage, /\.vol-coverage-tag\.is-custom\s*\{[^}]*rgba\(128,75,212/);
});

test("volunteer roster reset clears search, sort, filter, and pagination", () => {
  assert.match(publicScript, /class="vol-roster-reset-btn"/);
  assert.match(publicScript, /search\.value = ""/);
  assert.match(publicScript, /button\.classList\.remove\("active"\)/);
  assert.match(publicScript, /button\.setAttribute\("aria-pressed", "false"\)/);
  assert.match(publicScript, /controls\.dataset\.page = "1"/);
  assert.match(tournamentPage, /grid-template-columns:minmax\(82px,\.7fr\)[^;]*minmax\(68px,\.55fr\)/);
});