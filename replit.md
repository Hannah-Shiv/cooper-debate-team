# Cooper Debate Team — Public Website

Public website for the Cooper Debate Team at Cooper Middle School, McLean VA.

## Tech Stack
- Pure HTML + CSS + JavaScript (no frameworks)
- Static site — ready for GitHub Pages hosting
- Python HTTP server for local development preview

## File Structure
```
/
├── index.html          — Homepage
├── about.html          — About, coaches, join info
├── awards.html         — Awards, hall of fame, stats
├── tournaments.html    — Calendar, results, parent info
├── gallery.html        — Photos, videos, events
├── resources.html      — PF topic, debate skills, templates
├── blog.html           — Tournament recaps, team stories
├── members.html        — Phase 2 placeholder (login page)
├── css/
│   ├── main.css        — Core styles, variables, layouts
│   └── dome-nav.css    — Dome navigation (adapted from Langley Legacy)
├── js/
│   ├── dome-nav.js     — Dome nav toggle logic
│   └── main.js         — Animations, counters, countdown
└── images/             — Team photos (to be added)
```

## Design System
- **Primary color**: Navy `#0B2545`
- **Accent color**: Gold `#D4A017`
- **Background**: Deep navy `#071a36`
- **Fonts**: Playfair Display (headings) + Josefin Sans (body/UI)
- **Dome Nav**: Adapted from Langley Legacy TSA project by Hannah Shiv, Netre, and Moorva

## Phase 1 — Public Site (Current)
All public pages are complete with:
- Signature dome/radial navigation (6 circles, animated sub-pills)
- Gold animated connector paths and vertical rail
- Hero section with animated badge, countdown timer
- Animated stat counters, results tables, event calendar
- Gallery with CSS-gradient placeholders (swap for real photos)
- Blog with search filter and sidebar
- Responsive — mobile-first at all breakpoints

## Phase 2 — Members Portal (Planned)
- Firebase Authentication for member login
- Private area: evidence files, team chat, practice schedule, round tracking
- `members.html` currently shows a "Coming Soon" placeholder

## GitHub Pages Hosting
- All paths use relative URLs — no server-side code needed
- Drop entire folder into a GitHub repo, enable Pages, done
- Target domain: CooperDebateTeam.com

## Developer
Hannah Shiv — Cooper Debate '26, volunteer community-service initiative

## User Preferences
- Plain HTML/CSS/JS (not React) — GitHub Pages static hosting
- Navy (#0B2545) + Gold (#D4A017) color palette
- Hannah Shiv credited in footer on every page + dedicated card on About page
- Blog and real-time team chat planned for Phase 2
- All placeholder content should use realistic debate team data
