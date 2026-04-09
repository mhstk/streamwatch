# StreamWatch UI Redesign — Design Spec

## Overview

A "Cinematic Polish" redesign of all StreamWatch surfaces (Home, Player, Popup, Settings) with a unified design system. The goal is a premium streaming app feel without heavy animations or complex rendering. Player functionality (Vidstack, keyboard shortcuts, mouse interactions) remains completely untouched — only the surrounding chrome gets restyled.

## Design System

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Background | `#161210` | Page background (warm charcoal) |
| Surface | `#1e1a17` | Cards, inputs, elevated elements |
| Elevated | `#2a2320` | Hover fills, secondary surfaces |
| Accent | `#B91C1C` | Primary action color (deep scarlet) |
| Accent Hover | `#dc2626` | Hover state for accent (brighter) |
| Accent Dark | `#991B1B` | Dark red variant (Add to Series btn) |
| Text Primary | `#f0ece8` | Headings, primary text (warm white) |
| Text Secondary | `#a39e99` | Body text, labels |
| Text Muted | `#6b6560` | Meta text, placeholders |
| Border | `#2c2420` | Default borders (warm tone) |
| Border Soft | `#2c242066` | Reduced opacity borders for glass panels |

### Typography

- **Headings**: Plus Jakarta Sans (700 for page titles, 600 for section/card titles)
- **Body/UI**: Inter (400 body, 500 labels/buttons)
- **Loaded via Google Fonts** — both are lightweight

| Element | Font | Size | Weight |
|---------|------|------|--------|
| Page title | Plus Jakarta Sans | 32px | 700 |
| Section heading | Plus Jakarta Sans | 18px | 600 |
| Sidebar title | Plus Jakarta Sans | 17px | 600 |
| Card title | Plus Jakarta Sans | 13px | 600 |
| Body text | Inter | 14px | 400 |
| Button text | Inter | 14px | 500 |
| Card meta | Inter | 11px | 400 |
| Badge text | Inter | 12px | 500 |
| Muted label | Inter | 12px | 500 (uppercase) |

### Icons

- **Lucide React** (`lucide-react`) for all icons throughout the app
- No emoji icons anywhere
- Common icons used: `play`, `search`, `user`, `x`, `chevron-right`, `panel-right`, `subtitles`, `folder-plus`, `list`, `check`, `film`, `arrow-left`

### Component Styles

#### Buttons

**Primary** (accent):
- Background: `#B91C1C`, text: `#f0ece8`
- Hover: bg shifts to `#dc2626`, `translateY(-2px)`, red glow shadow `0 4px 24px rgba(185,28,28,0.45)`
- Active: bg `#991B1B`, translateY(0)
- Border-radius: 8px, padding: 10px 24px

**Secondary** (outline):
- Background: transparent, border: 1px solid `#2c2420`, text: `#f0ece8`
- Hover: bg fills `#2a2320`, border brightens to `#a39e99`, `translateY(-2px)`
- Border-radius: 8px

**Ghost**:
- No border, text: `#a39e99`
- Hover: bg `#2a2320`, text brightens

**Icon buttons** (top bar):
- 38px square, border-radius: 8px
- Background: `#1e1a17`, border: 1px solid `#2c2420`
- Hover: border brightens, bg `#2a2320`

#### Custom Dropdowns

- Replace all native `<select>` elements with custom dropdown components
- Trigger: styled like an input, border-radius: 10px, chevron rotates on open
- Menu: drops below with 6px gap, border-radius: 10px, `dropIn` animation (fade + translateY)
- Items: hover fills `#2a2320`, active item has red tint bg + checkmark
- Red border on trigger when open (matches input focus)

#### Inputs

- Background: `#1e1a17`, border: 1px solid `#2c2420`, border-radius: 10px
- Focus: border-color `#B91C1C`

#### Cards (Video/Series)

- Border-radius: 12px, background: `#1e1a17`, border: 1px solid `#2c2420`
- Thumbnail: 16:9 aspect ratio with gradient placeholder
- Hover: `translateY(-4px)`, border brightens to `#3a322e`, shadow `0 8px 28px rgba(0,0,0,0.5)`
- Play icon centered in thumbnail: muted by default, turns `#B91C1C` + scale(1.15) on card hover
- Progress bar: 3px height at bottom of thumbnail
- Badge: 12px font, border-radius: 6px, positioned top-left of thumbnail
  - Accent badge (episode): red tint bg `rgba(185,28,28,0.15)`, red text
  - Neutral badge (series): glass bg, muted text

#### Tooltips

Unified styled tooltips on ALL interactive elements across all pages:
- Position: absolute below element, centered
- Background: `rgba(22,18,16,0.95)`, border: 1px solid `#2c2420`, border-radius: 6px
- Font: 11px, color: `#a39e99`
- Entrance: fade + slide up (`translateY(-4px)` to `translateY(0)`)
- Keyboard shortcut shown as `<kbd>` badge: bg `#2a2320`, font: 10px, color `#6b6560`

#### Badges

- Accent: `rgba(185,28,28,0.15)` bg, `#B91C1C` text
- Neutral: `#1e1a17` bg, `#a39e99` text, border
- Completed: `rgba(22,163,74,0.13)` bg, `#4ade80` text

### Animations

- **Micro-interactions everywhere**: hover glows, smooth color transitions, gentle scale/lift on hover. Pure CSS, no JS animation libraries.
- **Fade-up on Home page load only**: cards stagger in with `fadeUp` animation (0.4s ease, 0.05s delay between cards). After animation completes, animation is removed so hover transforms work.
- **No entrance animations on Player page** — stays snappy and distraction-free.
- **Easing**: `cubic-bezier(0.4, 0, 0.2, 1)` for interactive elements, `ease` for fade-ins.

### Scrollbar

- Width: 6px (Home), 4px (Player sidebar)
- Track: transparent
- Thumb: `#2c2420`, border-radius: 3px
- Thumb hover: `#3a322e`

## Page Designs

### Home Page

**Layout**: Max-width `1280px`, centered. Padding `32px` on sides.

**Header**:
- Sticky, frosted glass: `rgba(22,18,16,0.85)`, `backdrop-filter: blur(12px)`, border-bottom `#2c2420`
- Left: Logo (play icon in red square + "StreamWatch" text), nav tabs (Home, My List, History)
- Right: Search icon button (38px), user avatar (32px circle)
- Nav items: 13px, pill-shaped hover fill

**Collapsible Hero** (only shown when there's a video to continue):
- Compact banner: border-radius 16px, gradient background
- Contains: poster thumbnail (100x60px), title, episode/progress info, progress bar
- Actions: Resume button (primary) + dismiss (x) button
- Collapses when dismissed or when nothing to continue

**Grid Sections** (Continue Watching, My Series, My Movies):
- Section header: title left, count right
- Grid: `repeat(auto-fill, minmax(180px, 1fr))`, gap: 16px
- Cards with fade-up stagger animation on load

### Player Page

**Architecture**: Video fills entire viewport as fixed background. All UI elements are floating glass overlays on top.

**Top Bar** (floating glass):
- Position: fixed, inset 8px from edges, border-radius: 14px
- Background: `rgba(14,12,10,0.75)`, `backdrop-filter: blur(14px)`, border: 1px solid `#2c242044`
- Left: Logo (clickable, navigates back to Home — no separate back button)
- Right: `?` keyboard shortcut button + sidebar toggle button
- Hides in fullscreen (existing behavior preserved)

**Sidebar Toggle Icon**:
- Shows `panel-right` icon when sidebar is closed
- Shows `chevron-right` icon when sidebar is open
- Implementation: swap raw SVG innerHTML (not Lucide re-render, which fails)

**Capsule Action Buttons** (on video, top-right):
- Two icons fused into one rounded rectangle (border-radius: 28px)
- Left half (Subtitles): glass background `rgba(22,18,16,0.7)`, border
- Right half (Add to Series): dark red `rgba(153,27,27,0.65)`, red border tint
- Each half: 58px wide, 50px tall, icons 21px
- Hover: left brightens, right glows red with shadow
- Styled tooltips on each half
- Position shifts left smoothly (0.3s cubic-bezier) when sidebar opens

**Title Overlay** (on video):
- Large 56px Plus Jakarta Sans bold, white, top-left
- Gradient: black 80% -> black 40% -> transparent
- Pushed down to clear the floating top bar (padding-top: 72px)
- No source host text — title only
- Hides in fullscreen (existing behavior preserved)

**Next Episode Overlay** (on video, bottom-right):
- Glass card: `rgba(22,18,16,0.9)`, blur, border-radius: 14px
- Contains: "Up Next" label, episode title, countdown, Play Now + Cancel buttons
- Timer bar: 2px red fill
- Hover: `translateY(-4px)` lift
- Position shifts left smoothly when sidebar opens

**Series Sidebar** (floating glass):
- Position: fixed, top: 76px (below top bar with gap), right: 8px, bottom: 8px
- Width: 310px, border-radius: 14px on all corners
- Background: `rgba(22,18,16,0.82)`, `backdrop-filter: blur(14px)`, border: 1px solid `#2c242044`
- Slide animation: `transform: translateX(calc(100% + 16px))` when collapsed, 0.3s cubic-bezier
- Contains: series title (17px), season tabs, episode list (14px titles, 11px meta)
- Active episode: left red border, progress bar
- Completed episodes: dimmed (0.5 opacity) + green checkmark

**Keyboard Focus Management** (critical):
- ALL buttons call `.blur()` after mouseup/click
- Prevents Space/Enter from re-triggering the last clicked button
- Ensures keyboard input always routes to the video player when not in a text input
- Implementation: `mouseup` listener on all `button`, `.capsule-left`, `.capsule-right`, `.season-tab`, `.episode-item` elements

**Keyboard Shortcut Legend**:
- Triggered by `?` button in top bar or pressing `?` key
- Full-viewport overlay with glass panel (480px wide, border-radius: 16px)
- Sections: Playback, Navigation, Subtitles
- Each row: action label left, styled key badges right
- Close: X button, Escape key, or click outside
- Scale-in entrance animation

### Popup Page

Apply the same design system:
- Warm charcoal background, Plus Jakarta Sans headings, Inter body
- Styled buttons, cards, and progress bars matching Home page
- Custom tooltips on interactive elements

### Settings Page

Apply the same design system:
- Warm charcoal background, glass-style section cards
- Custom dropdowns (not native selects)
- Styled toggles, inputs, and buttons
- Consistent typography and spacing

## What NOT to Change

- **Vidstack player** — all player functionality, controls, and behavior remain untouched
- **Keyboard shortcuts** — all existing shortcuts work exactly as before
- **Mouse interactions** — click/double-click on video, progress bar scrubbing, all preserved
- **Firebase/data layer** — no changes to hooks, firestore, auth, or any logic
- **Episode parsing** — no changes to URL parsing, series detection, or subtitle handling
- **Chrome extension manifest** — no changes to permissions, content scripts, or background worker

## Dependencies to Add

- `lucide-react` — icon library (replaces inline SVG emoji)
- Google Fonts: Plus Jakarta Sans + Inter (loaded via `<link>` in HTML entry points)

## Mockup References

All approved mockups are saved in `.superpowers/brainstorm/1980-1775741995/content/`:
- `design-system-v2.html` — buttons, dropdowns, component styles
- `home-layout-v4.html` — Home page grid layout (final)
- `player-final-v2.html` — Player page floating glass layout (final)
- `action-buttons-v2.html` — Capsule button concept (Option B)
