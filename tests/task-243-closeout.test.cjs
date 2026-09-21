const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (file) => fs.readFileSync(file, 'utf8');
const publicPages = ['index.html', 'about.html', 'apply.html', 'gallery.html', 'debate-prep.html', 'privacy.html', 'tournaments.html', 'announcements.html', 'resources.html', 'awards.html', 'members-signon.html', 'members.html', 'members-blog.html', 'members-calendar.html', 'members-resources.html', 'members-stats.html', 'data/public-footer.html'];
const applicationUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSfo4hDx6trh1ypieMujM6gE34eas7cthc2a3xdgSxuX45UBPQ/viewform';

test('public pages have no active team application CTA or direct form URL', () => {
  const html = publicPages.map(read).join('\n');
  assert.equal(html.includes(applicationUrl), false);
  assert.equal(/\bApply Now\b|\bApply to Join\b|Start the application/.test(html), false);
});

test('closed application page is safe and keeps resource routes', () => {
  const html = read('apply.html');
  assert.match(html, /Applications are closed/i);
  assert.match(html, /index\.html#season-readiness/);
  assert.match(html, /debate-prep\.html/);
  assert.doesNotMatch(html, /<form\b|turnstile|applicationEndpoint|finalSubmitBtn/);
  assert.match(html, /section.*debate-prep.*location\.replace\('debate-prep\.html'\)/s);
});

test('first-party application endpoint rejects late submissions before validation or writes', () => {
  const source = read('functions/index.js');
  assert.match(source, /const TEAM_APPLICATIONS_OPEN = false/);
  const handler = source.slice(source.indexOf('exports.submitApplication'), source.indexOf('exports.syncApplicationFromSheet'));
  const closedResponse = handler.indexOf('res.status(410)');
  const applicationWrite = handler.indexOf('db.collection(\"applications\")');
  assert.ok(closedResponse > -1, 'submitApplication must return a closed response');
  assert.ok(applicationWrite > closedResponse, 'closed response must run before any application write');

  const sheetHandler = source.slice(source.indexOf('exports.syncApplicationFromSheet'));
  assert.ok(sheetHandler.indexOf('res.status(410)') > -1, 'sheet sync must reject new application rows while applications are closed');
});

test('homepage includes the core tryout guidance', () => {
  const html = read('index.html');
  for (const retired of ['Application deadline', 'Before you apply', 'application process', 'google-form-dialog', 'Google Form application', 'info-session-deck-dialog']) {
    assert.equal(html.toLowerCase().includes(retired.toLowerCase()), false, `retired homepage content remains: ${retired}`);
  }
  for (const fact of ['Tuesday, September 22', 'Wednesday, September 23', '2:30–4:30', 'Two shortened PF rounds', 'Langley mentors', 'late buses', 'Crossfire', 'impacts and weighing', 'later that week']) {
    assert.match(html, new RegExp(fact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
  for (const detail of ['day requested in your application', 'A Session', 'B Session', 'speaker assignment', 'Summary or Final Focus', 'scope, magnitude, and probability', 'family members, neighbors, or friends', 'reasons and evidence for both sides']) {
    assert.match(html, new RegExp(detail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
  assert.doesNotMatch(html, /<\/section>>/);
});

test('calendar partner signup and Debate Prep remain linked', () => {
  const html = read('index.html') + read('tournaments.html') + read('apply.html');
  assert.match(html, /partner-signup/);
  assert.match(html, /debate-prep\.html/);
  assert.match(html, /tournaments\.html/);
  assert.doesNotMatch(read('js/public-calendar.js'), /kickoff-application|Debate Team Applications Due/);
  assert.doesNotMatch(read('js/kickoff-schedule.js'), /Submit the existing Debate Team application/);
  assert.doesNotMatch(read('js/debate-prep.js'), /2026-09-16|daysLeft/);
  assert.doesNotMatch(read('debate-prep.html'), /2,000|4\+ pages|Minimum 5|required 4\+ page application essay/i);
  const debatePrep = read('debate-prep.html') + read('js/debate-prep.js');
  for (const stage of ['Constructive', 'Crossfire', 'Rebuttal', 'Summary', 'Final Focus']) {
    assert.match(debatePrep, new RegExp(stage));
  }
  assert.match(debatePrep, /Constructive.*4 minutes[\s\S]*Crossfire.*3 minutes[\s\S]*Rebuttal.*4 minutes[\s\S]*Summary.*2 minutes[\s\S]*Final Focus.*2 minutes/);
  assert.match(debatePrep, /questions \+ answers|question-and-answer/i);
  assert.match(read('js/kickoff-schedule.js'), /A Session and B Session · opposite sides/);
  assert.match(read('js/kickoff-schedule.js'), /Late buses available/);
  assert.doesNotMatch(read('js/debate-prep.js'), /words \/ 2000|Untitled position paper|Your essay preview/);
});