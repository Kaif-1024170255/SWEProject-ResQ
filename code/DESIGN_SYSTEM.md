# ResQ — Design System Reference

**Read this file, and open `design-reference.html` in a browser, before writing or styling any screen.**

This is the single source of truth for how ResQ should look and read. Do not default to a generic SaaS-dashboard look (rounded cards with soft shadows, purple/indigo gradients, pill badges, tracked-out uppercase eyebrow labels). ResQ is an operations tool used under pressure, not a marketing site.

## 1. Concept

**"Field Ops Ledger."** ResQ should feel like a dispatch desk or an operations-center log — closer to a logistics/flight-status board than a startup app. Calm, legible, high-density, trustworthy. The person using this during a real emergency should never be distracted by decoration.

## 2. Color

Use exactly these six colors. Do not introduce new colors, gradients, or tints beyond what's needed for hover/disabled states (darken/lighten the existing tokens, don't invent new hues).

| Name | Hex | Use |
|---|---|---|
| Ink | `#14213D` | Primary text on light backgrounds, nav/chrome, primary buttons |
| Paper | `#EEF0EE` | App background |
| Paper Raised | `#FFFFFF` | Cards, rows, panels sitting on Paper |
| Slate | `#5B6670` | Secondary text, hairline borders, muted labels |
| Signal Amber | `#D98E2B` | Status meaning only: unverified / pending / needs attention |
| Response Teal | `#1F7A6C` | Status meaning only: verified / active / resolved |
| Alert Rust | `#B23A2F` | Status meaning only: critical / unresolved — use sparingly, never decoratively |

Rule: Amber, Teal, and Rust carry **meaning**, not decoration. If a color isn't attached to a status, don't use it. No gradients anywhere.

## 3. Typography

- **Public Sans** — all headings and body copy. (Free, Google Fonts. Chosen because it's a civic/government-infrastructure typeface, not a startup display face — it fits an emergency-response tool.)
- **IBM Plex Mono** — reserved only for genuinely data-like content: request IDs, coordinates, timestamps, status codes. Do not use it for regular labels or decoration.

Type scale (see `design-reference.html` §02 for live examples):
- H1: 34px / 700
- H2: 24px / 700
- H3: 18px / 600
- Body: 16px / 400
- Small/meta: 13px / 400, Slate color
- Mono/data: 14px, IBM Plex Mono

Avoid: accenting a single word in a headline with italics/color, tracked-out ALL CAPS section eyebrows, middle-dot-joined meta strings, arrow (→) suffixes on buttons or links.

## 4. Components

### Status chip
A small tag: left border (3px, colored by status), a colored dot, and an uppercase monospace label (e.g. `VERIFIED`). Not a rounded pastel pill. See §03 of the reference file.

### Buttons
Plain rectangles with a small corner radius (3px max). No drop shadows. Label states the exact action in active voice: "Claim this request," "Mark resolved," never "Submit" or "Confirm" alone. See §04.

### Request lifecycle indicator
A five-stage strip (`Unverified → Verified → In Progress → Resolved → Closed`) with numbered stages. This is the **one place** numbering is earned, because the lifecycle genuinely is a sequence. Do not add numbered markers anywhere else.

### Dispatch log (primary list pattern)
Requests are shown as dense rows in a bordered log, not as cards with shadows and thumbnails. Each row: request ID (mono), category (small mono label) + description, a status chip, and a relative timestamp (mono). See §06.

### Map + rail console
The map is a primary, load-bearing surface (this is fundamentally a geography problem), shown side-by-side with a filterable rail/list — not hidden behind a tab. Map pins use the exact same status colors as the chips. See §07.

## 5. Layout

- Left rail (or top bar on mobile) for role context and filters; main pane is the log and/or map.
- Justify body text sparingly; prefer left-aligned, generous line-height (1.5) for readability under stress.
- Hairline 1px borders (Slate-line, a lightened Slate) instead of drop shadows to separate content.
- Minimal corner radius throughout (2–4px) — functional, not bubbly.
- Keep line lengths under ~80 characters for body copy.

## 6. Motion

Use motion only to show what changed (a status updating live, a claimed request moving out of the available list). No entrance animations on page load, no hover effects on every element. One deliberate moment beats many small ones.

## 7. Voice and copy

- Active voice, plain language, one job per label. Name things the way a volunteer or affected person would say them, not how the database models them.
- Buttons and their resulting confirmations use the same verb: "Claim this request" → toast says "Claimed."
- Empty states are an invitation to act: "No open requests in this area yet," not a decorative illustration.
- Errors state exactly what happened and how to fix it, in the interface's voice — no apologies, no vague messages.

## 8. What to avoid (generic AI-generated tells)

- Warm cream background with terracotta/clay accent, or near-black background with one neon accent.
- Identical rounded cards with the same soft grey box-shadow on everything.
- Gradient washes as decoration.
- Tracked-out ALL-CAPS eyebrow labels above every heading.
- Meta strings joined with middle dots ("A · B · C") used decoratively.
- "WORD — fragment" labels with a spaced em dash.
- A "→" appended to every button or link.

If in doubt, open `design-reference.html` and match what you see there.
