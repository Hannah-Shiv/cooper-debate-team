---
name: Member header consistency
description: Shared structure and visual invariants for the authenticated member user bar
---

Use the Debaters member user bar as the structural source of truth for every authenticated member page. The order is notification, full name, role text, and Sign Out. Do not display role artwork. Role changes update only the role label; the badge keeps the established Website Admin width and shared dark-green color.

**Why:** Applications initially used a separate user-bar structure, so matching the tab menu did not make its top-right header match. The difference was only obvious in the authenticated view.

**How to apply:** When changing member-header presentation, update the shared role styling and every affected page’s cache-busted references, then verify the four-part order and role text with the same fixed badge dimensions.