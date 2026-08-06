// js/drive-api.js — Google Drive API integration (Phase C)
// Populates resource cards with live file counts, last-updated dates,
// latest 3 file links, NEW badges, and the What's New panel.

(function() {
  const API_KEY    = 'AIzaSyDQLFIipyTLZonee_o4tc35gYWOc8TN8-M';
  const NEW_DAYS   = 7;

  // Map card element IDs → Drive folder IDs
  const FOLDERS = [
    { cardId: 'drive-evidence-link',    folderId: '10PY63bQqPJl40fIvwCnyii8vBS890cL1' },
    { cardId: 'drive-flows-link',       folderId: '1SHmgfvi6YlGFBtaM6bdcdcBsFU8Kqr8E' },
    { cardId: 'drive-research-link',    folderId: '1ZDlvJJLC0HqXGtHIIqlrDbFgjyuQKAEx' },
    { cardId: 'drive-schedule-link',    folderId: '1WBwF33mAmuHzIBshaOGa0l9z-ptBovP4' },
    { cardId: 'drive-assignments-link', folderId: '112MTL_rSk-sJF7_hfBUbm4SRMTfsy0g_' },
    { cardId: 'drive-tournament-link',  folderId: '1bRpZgA1kYIMl-LjnmnMOzSOH3Cn4BToM' },
  ];

  // ── Helpers ──────────────────────────────────────────────────

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function mimeIcon(mime) {
    if (!mime) return '📎';
    if (mime.includes('document'))     return '📄';
    if (mime.includes('spreadsheet'))  return '📊';
    if (mime.includes('presentation')) return '📽️';
    if (mime.includes('pdf'))          return '📕';
    if (mime.includes('video'))        return '🎥';
    if (mime.includes('image'))        return '🖼️';
    if (mime.includes('audio'))        return '🎵';
    return '📎';
  }

  function timeAgoShort(iso) {
    const date  = new Date(iso);
    const hours = (Date.now() - date.getTime()) / 3600000;
    if (hours < 24) {
      // Same day — show HH:MM AM/PM
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    // Older — show "Aug 4"
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function isNew(iso) {
    return (Date.now() - new Date(iso).getTime()) / 86400000 <= NEW_DAYS;
  }

  // ── Drive API fetch ──────────────────────────────────────────

  async function fetchFiles(folderId) {
    const q      = encodeURIComponent(
      `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`
    );
    const fields = encodeURIComponent('files(id,name,mimeType,modifiedTime,webViewLink)');
    const url    = `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime+desc&pageSize=20&fields=${fields}&key=${API_KEY}`;
    const res    = await fetch(url, { referrerPolicy: 'unsafe-url' });
    if (!res.ok) throw new Error(`Drive API ${res.status} for folder ${folderId}`);
    return (await res.json()).files || [];
  }

  // ── Card renderer ────────────────────────────────────────────

  function renderCard(cardEl, files) {
    const metaEl  = cardEl.querySelector('.card-drive-meta');
    const filesEl = cardEl.querySelector('.card-files');
    if (!metaEl || !filesEl) return;

    // File count + last updated
    const count   = files.length;
    const lastMod = files[0]?.modifiedTime ?? null;
    const countLabel = count === 0 ? 'No files' : `${count} file${count !== 1 ? 's' : ''}`;
    metaEl.innerHTML =
      `<span class="card-file-count">📁 ${countLabel}</span>` +
      (lastMod ? `<span class="card-updated">Updated ${timeAgoShort(lastMod)}</span>` : '');
    metaEl.style.display = 'flex';

    // Latest 3 files
    const top3 = files.slice(0, 3);
    if (top3.length) {
      filesEl.innerHTML = top3.map(f =>
        `<a href="${escHtml(f.webViewLink)}" target="_blank"
            class="card-file-item" onclick="event.stopPropagation();event.preventDefault();window.open('${escHtml(f.webViewLink)}','_blank')">
          <div class="card-file-row1">
            <span class="card-file-icon">${mimeIcon(f.mimeType)}</span>
            <span class="card-file-name">${escHtml(f.name)}</span>
            ${isNew(f.modifiedTime) ? '<span class="card-file-new">NEW</span>' : ''}
          </div>
          <div class="card-file-row2">
            <span class="card-file-age">${timeAgoShort(f.modifiedTime)}</span>
          </div>
        </a>`
      ).join('');
      filesEl.style.display = 'flex';
    }
  }

  // ── What's New panel ─────────────────────────────────────────

  function renderWhatsNew(allFiles) {
    const panel = document.getElementById('whats-new-panel');
    if (!panel) return;

    const cutoff = Date.now() - NEW_DAYS * 86400000;
    const recent = allFiles
      .filter(f => new Date(f.modifiedTime).getTime() > cutoff)
      .sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime))
      .slice(0, 10);

    const list  = document.getElementById('whats-new-list');
    const empty = document.getElementById('whats-new-empty');
    if (!list) return;

    if (recent.length === 0) {
      list.style.display   = 'none';
      if (empty) empty.style.display = '';
    } else {
      if (empty) empty.style.display = 'none';
      list.innerHTML = recent.map(f =>
        `<a href="${escHtml(f.webViewLink)}" target="_blank" class="wn-item">
          <span class="wn-icon">${mimeIcon(f.mimeType)}</span>
          <span class="wn-name">${escHtml(f.name)}</span>
          <span class="wn-section">${escHtml(f._section || '')}</span>
          <span class="wn-age">${timeAgoShort(f.modifiedTime)}</span>
        </a>`
      ).join('');
      list.style.display = 'flex';
    }
    panel.style.display = '';
  }

  // ── Main entry point (called from members-auth.js) ───────────

  window.loadDriveData = async function() {
    const results = await Promise.allSettled(
      FOLDERS.map(async ({ cardId, folderId }) => {
        const cardEl = document.getElementById(cardId);
        if (!cardEl) return [];
        const section = cardEl.querySelector('.portal-card-title')?.textContent?.trim() || '';
        try {
          const files = await fetchFiles(folderId);
          renderCard(cardEl, files);
          return files.map(f => ({ ...f, _section: section }));
        } catch (err) {
          console.warn(`[Drive] Failed to load ${cardId}:`, err.message);
          const metaEl = cardEl.querySelector('.card-drive-meta');
          if (metaEl) {
            metaEl.innerHTML = '<span class="card-updated" style="color:rgba(255,100,100,0.6)">Could not load files</span>';
            metaEl.style.display = 'flex';
          }
          return [];
        }
      })
    );

    const allFiles = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    renderWhatsNew(allFiles);
  };

})();
