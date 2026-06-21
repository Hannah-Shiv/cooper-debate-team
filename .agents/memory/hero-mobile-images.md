---
name: Hero mobile images
description: Which background images are used for the hero section on desktop vs mobile/iPad, and why.
---

## Rule
Use two separate hero images — landscape for desktop, portrait for mobile/tablet portrait.

- **Desktop** (`> 768px landscape`): `images/hero-stage.png` (1536×1024, 3:2 landscape). `background-size: cover` fills widescreen fine; both podiums are visible.
- **Mobile** (`≤ 768px`): `images/hero-stage-mobile.png` (941×1672, portrait ~9:16). `background-size: cover` fills portrait screen natively — no stretch, no crop of podiums.
- **iPad portrait** (`769–1024px, orientation: portrait`): same `hero-stage-mobile.png` with `background-size: cover`. Separate media query targets this breakpoint explicitly.
- **iPad landscape**: falls through to desktop CSS — already looks fine.

**Why:** The landscape image stretched to `100% 100%` looked distorted on portrait screens. A dedicated portrait-composed image is the only clean solution. Do NOT use `background-size: 100% 100%` on the landscape image for mobile.

## Mobile layout pattern
- `min-height: 100svh` on `.home-hero`
- `flex: 1` + `flex-direction: column` on `.hero-content`
- `padding-top: 130px` → title starts just below nav dome; "Team" (3rd line) lands near podium tops (~35% of viewport height)
- `margin-top: auto` on `.hero-school` → "Public Forum" pushed down to podium-floor level
- `padding-bottom: 28px` → fine-tunes how close to the bottom the subtitle sits
