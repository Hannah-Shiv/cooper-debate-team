---
name: Fixed-child containing block trap
description: CSS transform on a fixed-position ancestor creates a containing block, breaking position:fixed on children — applies to the dome nav wrap.
---

## Rule
Never put `transform` on `#circ-wrap` (or any fixed ancestor that has fixed-position children).

**Why:** CSS `transform`, `filter`, `perspective`, or `will-change` on ANY ancestor — even one with `position: fixed` — creates a new containing block for descendant `position: fixed` elements. The child is then sized/positioned relative to that ancestor instead of the viewport. In this project, `#intel-threads` is a `position: fixed` child of `#circ-wrap`; if circ-wrap has `transform: translateX(-50%)`, the SVG collapses to the wrap's 72px width instead of spanning the full screen.

**How to apply:** Center `#circ-wrap` with `left: calc(50% - 36px)` (half the wrap width) instead of `left: 50%; transform: translateX(-50%)`. For mobile (52px wrap): `left: calc(50% - 26px)`. Never re-introduce a `transform` on `#circ-wrap`.
