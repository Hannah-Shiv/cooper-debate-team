// Portal presentation filter. The public tournament collection is not a private
// data source; this limits what these two portal pages display, not direct reads.
(function (root) {
  'use strict';

  function normalizedName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function ownName(access) {
    if (!access || access.approved !== true) return '';
    // The portal directory (or the existing legacy allowlist) supplies the name,
    // never an editable browser display name or a query-string parameter.
    return String(access.name || '').trim().replace(/\s+/g, ' ');
  }

  function personalTournaments(tournaments, access) {
    const name = ownName(access);
    if (!name) return [];
    const expected = normalizedName(name);
    const fullNamesByLast = new Map();
    (tournaments || []).forEach(t => (t.entries || []).forEach(e =>
      (e.debaters || []).forEach(d => {
        if (!d.first || !d.last) return;
        const last = normalizedName(d.last);
        const full = normalizedName(d.first + ' ' + d.last);
        const previous = fullNamesByLast.get(last);
        if (previous && previous !== full) fullNamesByLast.set(last, null);
        else if (previous === undefined) fullNamesByLast.set(last, full);
      })
    ));

    function belongsToMember(d) {
      const first = normalizedName(d.first), last = normalizedName(d.last);
      if (!last) return false;
      return first
        ? normalizedName(first + ' ' + last) === expected
        : fullNamesByLast.get(last) === expected;
    }

    return (tournaments || []).map(t => {
      const entries = (t.entries || []).flatMap(e => {
        const debaters = e.debaters || [];
        const ownDebaters = debaters.filter(belongsToMember);
        // Some old imports have no debater objects. Match only if the
        // surname has one known full-name owner in the tournament dataset.
        const teamPart = String(e.teamName || '').split('&').map(normalizedName);
        const hasOwnTeamPart = teamPart.some(part =>
          part === expected || fullNamesByLast.get(part) === expected
        );
        if (!ownDebaters.length && !debaters.length && hasOwnTeamPart) {
          const parts = name.split(' ');
          ownDebaters.push({
            first: parts[0], last: parts.slice(1).join(' '),
            wins: e.wins || 0, losses: e.losses || 0,
            totalSpeaks: 0, avgSpeak: 0, rounds: []
          });
        }
        if (!ownDebaters.length) return [];
        // Speaker points and round details for the other debater belong to
        // this member's pair only when both are on this exact tournament entry.
        // Never pull a partner's results from a separate entry or tournament.
        const visibleDebaters = debaters.length === 2 ? debaters : ownDebaters;
        const parts = name.split(' ');
        return [{
          ...e,
          debaters: visibleDebaters.map(d => belongsToMember(d) && !d.first
            ? { ...d, first: parts[0], last: parts.slice(1).join(' ') }
            : d)
        }];
      });
      return entries.length ? { ...t, entries } : null;
    }).filter(Boolean);
  }

  const api = { ownName, personalTournaments };
  root.MemberScoreAccess = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);