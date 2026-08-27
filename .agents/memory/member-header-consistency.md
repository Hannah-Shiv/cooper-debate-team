---
name: Member header consistency
description: Shared structure and visual invariants for the authenticated member user bar
---

Use the Debaters member user bar as the structural source of truth for every authenticated member page. Role changes should update only the role label and artwork; the role badge keeps the established Website Admin width and Captain brown/gold color.

**Why:** Applications initially used a separate user-bar structure, so matching the tab menu did not make its top-right header match. The difference was only obvious in the authenticated view.

**How to apply:** When changing member-header presentation, update the shared role styling and every page’s cache-busted stylesheet reference, then verify the role-specific text/icon with the same fixed badge dimensions.