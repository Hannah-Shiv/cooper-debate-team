import test from 'node:test';
import assert from 'node:assert/strict';
import scoreAccess from '../js/member-score-access.js';

const access = { approved: true, name: 'Taylor Smith' };
const tournaments = [
  { id: 'one', entries: [
    { teamName: 'Smith & Jones', wins: 3, debaters: [
      { first: 'Taylor', last: 'Smith', wins: 3, totalSpeaks: 110 },
      { first: 'Riley', last: 'Jones', wins: 3, totalSpeaks: 118 }
    ] },
    { teamName: 'Lee & Chen', wins: 4, debaters: [
      { first: 'Avery', last: 'Lee', wins: 4, totalSpeaks: 120 }
    ] },
    { teamName: 'Jones & Chen', wins: 1, debaters: [
      { first: 'Riley', last: 'Jones', wins: 1, totalSpeaks: 91 },
      { first: 'Casey', last: 'Chen', wins: 1, totalSpeaks: 94 }
    ] }
  ] },
  { id: 'two', entries: [
    { teamName: 'Smith & Patel', wins: 2, debaters: [
      { first: '', last: 'Smith', wins: 2, totalSpeaks: 0 },
      { first: 'Morgan', last: 'Patel', wins: 2, totalSpeaks: 100 }
    ] }
  ] },
  { id: 'three', entries: [
    { teamName: 'Jones & Lee', wins: 4, debaters: [
      { first: 'Riley', last: 'Jones', wins: 4, totalSpeaks: 123 },
      { first: 'Avery', last: 'Lee', wins: 4, totalSpeaks: 126 }
    ] }
  ] }
];

test('member sees their own and their partner’s scores from shared entries only', () => {
  const output = scoreAccess.personalTournaments(tournaments, access);
  assert.equal(output.length, 2);
  assert.deepEqual(output.map(t => t.entries.length), [1, 1]);
  assert.deepEqual(output[0].entries[0].debaters.map(d => d.first), ['Taylor', 'Riley']);
  assert.equal(output[0].entries[0].debaters[0].totalSpeaks, 110);
  assert.equal(output[0].entries[0].debaters[1].totalSpeaks, 118);
  assert.equal(output[1].entries[0].debaters[0].first, 'Taylor');
  assert.equal(output[1].entries[0].debaters[1].totalSpeaks, 100);
  assert.equal(tournaments[0].entries[0].debaters.length, 2);
});

test('partner sees their shared result but not the other person’s different pairing', () => {
  const output = scoreAccess.personalTournaments(tournaments, { approved: true, name: 'Riley Jones' });
  assert.deepEqual(output.map(t => t.id), ['one', 'three']);
  assert.deepEqual(output[0].entries.map(e => e.teamName), ['Smith & Jones', 'Jones & Chen']);
  assert.equal(output[1].entries[0].debaters[1].totalSpeaks, 126);
});

test('unlinked and unapproved members see no results', () => {
  assert.deepEqual(scoreAccess.personalTournaments(tournaments, { approved: true, name: '' }), []);
  assert.deepEqual(scoreAccess.personalTournaments(tournaments, { approved: false, name: 'Taylor Smith' }), []);
  assert.deepEqual(scoreAccess.personalTournaments(tournaments, { approved: true, name: 'Another Student' }), []);
});

test('surname-only stubs do not match when that surname is ambiguous', () => {
  const ambiguous = [{ entries: [
    { teamName: 'Smith & Lee', debaters: [{ first: 'Jordan', last: 'Smith' }, { first: 'Avery', last: 'Lee' }] },
    { teamName: 'Smith & Jones', debaters: [{ first: '', last: 'Smith' }] }
  ] }, ...tournaments];
  const output = scoreAccess.personalTournaments(ambiguous, access);
  assert.equal(output[0].id, 'one');
  assert.equal(output.length, 1);
});