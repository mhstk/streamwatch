# StreamWatch UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle all StreamWatch surfaces (Home, Player, Popup, Settings) with a unified cinematic design system — warm charcoal palette, Plus Jakarta Sans/Inter fonts, Lucide icons, micro-interactions — without touching any player logic or keyboard shortcut behavior.

**Architecture:** Update the design system foundation (Tailwind config, globals.css, HTML font links, lucide-react dep) first, then restyle each page in order: Home, Player, Popup, Settings. Each page task is independent after the foundation is in place. Player page gets the most structural change (floating glass overlays on full-viewport video).

**Tech Stack:** React 18, Tailwind CSS 3.4, lucide-react (new), Google Fonts (Plus Jakarta Sans, Inter), existing Vidstack player (untouched).

**Spec:** `docs/superpowers/specs/2026-04-09-ui-redesign-design.md`

**Approved mockups:** `.superpowers/brainstorm/1980-1775741995/content/` — reference `player-final-v2.html` and `home-layout-v4.html` for exact values.

---

## File Map

### Files to create:
- `src/components/Tooltip.tsx` — reusable tooltip wrapper component
- `src/components/CustomDropdown.tsx` — custom dropdown replacing native `<select>`
- `src/components/CapsuleActions.tsx` — the split capsule button (subtitles + add to series)
- `src/components/KeyboardLegend.tsx` — keyboard shortcut overlay modal
- `src/player/components/PlayerTopBar.tsx` — floating glass top bar for player

### Files to modify:
- `package.json` — add `lucide-react` dependency
- `tailwind.config.js` — update color tokens, add font families
- `src/styles/globals.css` — rewrite with new palette, typography, component classes, animations
- `index.html` — add Google Fonts link
- `src/home/home.html` — add Google Fonts link
- `src/popup/popup.html` — add Google Fonts link
- `src/settings/settings.html` — add Google Fonts link
- `src/home/Home.tsx` — restyle header, hero, grid sections
- `src/home/components/SeriesCard.tsx` — restyle with new card design
- `src/home/components/SeriesDetailModal.tsx` — restyle modal with new palette
- `src/player/Player.tsx` — restructure to full-viewport video + floating overlays, add keyboard focus management, add `?` shortcut legend
- `src/player/components/SeriesSidebar.tsx` — restyle as floating glass panel
- `src/player/components/NextEpisodeOverlay.tsx` — restyle as glass card with hover lift
- `src/player/components/AddToSeriesModal.tsx` — restyle with new palette
- `src/player/components/SubtitleModal.tsx` — restyle with new palette
- `src/popup/Popup.tsx` — restyle with new palette and components
- `src/settings/Settings.tsx` — restyle with new palette and components

---

## Task 1: Install dependency and add Google Fonts

**Files:**
- Modify: `package.json`
- Modify: `index.html`
- Modify: `src/home/home.html`
- Modify: `src/popup/popup.html`
- Modify: `src/settings/settings.html`

- [ ] **Step 1: Install lucide-react**

Run:
```bash
cd c:/Users/mhset/OneDrive/Documents/streamwatch && npm install lucide-react
```

- [ ] **Step 2: Add Google Fonts link to all HTML entry points**

Add this line inside `<head>` of each HTML file, before any other `<link>` or `<script>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700&family=Inter:wght@400;500&display=swap" rel="stylesheet">
```

Files to edit: `index.html`, `src/home/home.html`, `src/popup/popup.html`, `src/settings/settings.html`.

- [ ] **Step 3: Verify build works**

Run:
```bash
npm run build
```
Expected: Build completes without errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json index.html src/home/home.html src/popup/popup.html src/settings/settings.html
git commit -m "Add lucide-react and Google Fonts (Plus Jakarta Sans, Inter)"
```

---

## Task 2: Update Tailwind config and globals.css

**Files:**
- Modify: `tailwind.config.js`
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Rewrite tailwind.config.js**

Replace the entire contents of `tailwind.config.js` with:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,html}",
  ],
  theme: {
    extend: {
      colors: {
        'sw-bg': '#161210',
        'sw-surface': '#1e1a17',
        'sw-elevated': '#2a2320',
        'sw-accent': '#B91C1C',
        'sw-accent-hover': '#dc2626',
        'sw-accent-dark': '#991B1B',
        'sw-text': '#f0ece8',
        'sw-text-secondary': '#a39e99',
        'sw-text-muted': '#6b6560',
        'sw-border': '#2c2420',
        'sw-border-soft': 'rgba(44, 36, 32, 0.4)',
        // Keep old token as alias during migration
        'sw-red': '#B91C1C',
        'sw-dark': '#161210',
      },
      fontFamily: {
        'heading': ['"Plus Jakarta Sans"', 'sans-serif'],
        'body': ['"Inter"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 2: Rewrite globals.css**

Replace the entire contents of `src/styles/globals.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --sw-accent: #B91C1C;
  --sw-accent-hover: #dc2626;
  --sw-accent-dark: #991B1B;
  --sw-bg: #161210;
  --sw-surface: #1e1a17;
  --sw-elevated: #2a2320;
  --sw-text: #f0ece8;
  --sw-text-secondary: #a39e99;
  --sw-text-muted: #6b6560;
  --sw-border: #2c2420;
}

@layer base {
  html {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  body {
    background-color: var(--sw-bg);
    color: var(--sw-text);
    margin: 0;
    padding: 0;
  }

  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--sw-border); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #3a322e; }
}

@layer components {
  .btn-primary {
    @apply py-2.5 px-6 rounded-lg font-medium text-sm;
    font-family: 'Inter', sans-serif;
    background: var(--sw-accent);
    color: var(--sw-text);
    border: none;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .btn-primary:hover {
    background: var(--sw-accent-hover);
    transform: translateY(-2px);
    box-shadow: 0 4px 24px rgba(185, 28, 28, 0.45);
  }
  .btn-primary:active {
    background: var(--sw-accent-dark);
    transform: translateY(0);
  }

  .btn-secondary {
    @apply py-2.5 px-6 rounded-lg font-medium text-sm;
    font-family: 'Inter', sans-serif;
    background: transparent;
    color: var(--sw-text);
    border: 1px solid var(--sw-border);
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .btn-secondary:hover {
    background: var(--sw-elevated);
    border-color: var(--sw-text-secondary);
    transform: translateY(-2px);
  }

  .btn-ghost {
    @apply py-2.5 px-6 rounded-lg font-medium text-sm;
    font-family: 'Inter', sans-serif;
    background: transparent;
    color: var(--sw-text-secondary);
    border: none;
    transition: all 0.2s ease;
  }
  .btn-ghost:hover {
    background: var(--sw-elevated);
    color: var(--sw-text);
  }

  .btn-icon {
    @apply rounded-lg flex items-center justify-center;
    width: 38px;
    height: 38px;
    background: var(--sw-surface);
    border: 1px solid var(--sw-border);
    color: var(--sw-text-secondary);
    transition: all 0.2s ease;
    cursor: pointer;
    outline: none;
    position: relative;
  }
  .btn-icon:hover {
    border-color: var(--sw-text-secondary);
    color: var(--sw-text);
    background: var(--sw-elevated);
  }

  .card {
    background: var(--sw-surface);
    border: 1px solid var(--sw-border);
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .card:hover {
    transform: translateY(-4px);
    border-color: #3a322e;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
  }

  .input {
    font-family: 'Inter', sans-serif;
    background: var(--sw-surface);
    color: var(--sw-text);
    border: 1px solid var(--sw-border);
    border-radius: 10px;
    padding: 10px 16px;
    font-size: 14px;
    outline: none;
    transition: border-color 0.2s;
  }
  .input:focus {
    border-color: var(--sw-accent);
  }

  .badge {
    font-family: 'Inter', sans-serif;
    font-size: 12px;
    font-weight: 500;
    padding: 3px 9px;
    border-radius: 6px;
  }
  .badge-accent {
    background: rgba(185, 28, 28, 0.15);
    color: var(--sw-accent);
  }
  .badge-neutral {
    background: var(--sw-surface);
    color: var(--sw-text-secondary);
    border: 1px solid var(--sw-border);
  }
  .badge-success {
    background: rgba(22, 163, 74, 0.13);
    color: #4ade80;
  }
}

@layer utilities {
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }

  .scrollbar-thin::-webkit-scrollbar { width: 4px; }
  .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
  .scrollbar-thin::-webkit-scrollbar-thumb { background: var(--sw-border); border-radius: 2px; }

  .aspect-video { aspect-ratio: 16 / 9; }

  .truncate-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .font-heading { font-family: 'Plus Jakarta Sans', sans-serif; }
  .font-body { font-family: 'Inter', sans-serif; }

  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slide-up {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes fade-up {
    from { opacity: 0; transform: translateY(16px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes action-flash {
    0% { opacity: 0.7; transform: scale(0.8); }
    30% { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(1.1); }
  }
  @keyframes drop-in {
    from { opacity: 0; transform: translateY(-6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes scale-in {
    from { opacity: 0; transform: scale(0.96) translateY(8px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
  .animate-slide-up { animation: slide-up 0.5s ease-out forwards; }
  .animate-fade-up { animation: fade-up 0.4s ease forwards; }
  .animate-action-flash { animation: action-flash 0.6s ease-out forwards; }
  .animate-drop-in { animation: drop-in 0.2s ease forwards; }
  .animate-scale-in { animation: scale-in 0.2s ease forwards; }

  .glass {
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
  }
  .glass-light {
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
}

video::cue {
  background: rgba(0, 0, 0, 0.7);
  color: white;
  font-size: 1.2em;
  line-height: 1.4;
  border-radius: 2px;
  padding: 2px 6px;
}
```

- [ ] **Step 3: Verify build works**

Run: `npm run build`
Expected: Build completes. Some Tailwind class warnings may appear for old classes not yet migrated — that is expected.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.js src/styles/globals.css
git commit -m "Update design system: warm charcoal palette, new typography, component classes"
```

---

## Task 3: Create shared UI components (Tooltip, CustomDropdown)

**Files:**
- Create: `src/components/Tooltip.tsx`
- Create: `src/components/CustomDropdown.tsx`

- [ ] **Step 1: Create Tooltip component**

Create `src/components/Tooltip.tsx`:

```tsx
import { ReactNode } from 'react';

interface TooltipProps {
  text: string;
  shortcut?: string;
  children: ReactNode;
  position?: 'bottom' | 'top';
}

export default function Tooltip({ text, shortcut, children, position = 'bottom' }: TooltipProps) {
  const posClass = position === 'bottom'
    ? 'top-full mt-2 left-1/2 -translate-x-1/2'
    : 'bottom-full mb-2 left-1/2 -translate-x-1/2';

  return (
    <div className="relative group">
      {children}
      <div className={`absolute ${posClass} pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-200 z-50 translate-y-[-4px] group-hover:translate-y-0`}>
        <div className="glass bg-[rgba(22,18,16,0.95)] border border-sw-border rounded-md px-2.5 py-1.5 whitespace-nowrap flex items-center gap-1.5">
          <span className="text-sw-text-secondary text-[11px] font-medium font-body">{text}</span>
          {shortcut && (
            <kbd className="bg-sw-elevated px-1.5 py-0.5 rounded text-[10px] text-sw-text-muted font-body">{shortcut}</kbd>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create CustomDropdown component**

Create `src/components/CustomDropdown.tsx`:

```tsx
import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface DropdownOption {
  value: string;
  label: string;
}

interface CustomDropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export default function CustomDropdown({ options, value, onChange, className = '' }: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        onMouseUp={(e) => (e.currentTarget as HTMLButtonElement).blur()}
        className={`w-full font-body text-sm bg-sw-surface text-sw-text border rounded-[10px] px-4 py-2.5 flex items-center justify-between cursor-pointer transition-colors duration-200 outline-none ${
          isOpen ? 'border-sw-accent' : 'border-sw-border hover:border-[#3a322e]'
        }`}
      >
        <span>{selected?.label ?? 'Select...'}</span>
        <ChevronDown size={14} className={`text-sw-text-muted transition-transform duration-250 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-1.5 left-0 right-0 bg-sw-surface border border-sw-border rounded-[10px] overflow-hidden z-50 shadow-[0_12px_32px_rgba(0,0,0,0.5)] animate-drop-in">
          {options.map((opt) => (
            <div
              key={opt.value}
              onClick={() => { onChange(opt.value); setIsOpen(false); }}
              className={`font-body text-sm px-4 py-2.5 cursor-pointer transition-colors duration-150 flex items-center justify-between ${
                opt.value === value
                  ? 'bg-[rgba(185,28,28,0.07)] text-sw-text'
                  : 'text-sw-text-secondary hover:bg-sw-elevated hover:text-sw-text'
              }`}
            >
              {opt.label}
              {opt.value === value && <Check size={14} className="text-sw-accent" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS (components are created but not yet imported anywhere).

- [ ] **Step 4: Commit**

```bash
git add src/components/Tooltip.tsx src/components/CustomDropdown.tsx
git commit -m "Add shared Tooltip and CustomDropdown components"
```

---

## Task 4: Restyle Home page

**Files:**
- Modify: `src/home/Home.tsx`
- Modify: `src/home/components/SeriesCard.tsx`
- Modify: `src/home/components/SeriesDetailModal.tsx`

This is the largest task. The engineer should reference the approved mockup at `.superpowers/brainstorm/1980-1775741995/content/home-layout-v4.html` for exact styling values.

- [ ] **Step 1: Restyle Home.tsx**

Key changes to make (do NOT change any data-fetching logic, hooks, or state management — only JSX and className attributes):

1. **Wrap content** in `<div className="max-w-[1280px] mx-auto">`
2. **Header**: Replace with sticky frosted glass header:
   - Container: `fixed top-0 left-0 right-0 z-50 glass-light bg-[rgba(22,18,16,0.85)] border-b border-sw-border`
   - Inner: `max-w-[1280px] mx-auto flex items-center justify-between px-8 py-4`
   - Logo: `font-heading font-bold text-xl text-sw-text flex items-center gap-2.5` with a red square icon `bg-sw-accent rounded-lg w-8 h-8 flex items-center justify-center` containing `<Play size={14} fill="#f0ece8" stroke="none" />` from lucide-react
   - Nav: `flex gap-1.5` with nav items as `font-body text-[13px] font-medium px-4 py-1.5 rounded-lg transition-all duration-200` — active: `text-sw-text bg-sw-surface`, inactive: `text-sw-text-muted hover:text-sw-text hover:bg-sw-elevated`
   - Right: Search button using `btn-icon` class + `<Search size={16} />`, avatar circle `w-8 h-8 rounded-full bg-sw-elevated border-2 border-sw-border hover:border-sw-accent`
   - Add `pt-[72px]` to main content to account for fixed header
3. **Replace all inline SVGs** with Lucide imports: `import { Play, Search, User, X, ChevronRight } from 'lucide-react'`
4. **Hero section**: Replace the large backdrop hero with a compact collapsible banner:
   - Container: `mx-8 mt-6 p-7 rounded-2xl border border-sw-border` with gradient background `bg-gradient-to-r from-sw-elevated via-sw-surface to-[#2a1a18]`
   - Flex layout: poster thumbnail (100x60, rounded-xl), info column (title, meta, progress bar), actions (Resume btn-primary + dismiss btn-icon with X)
   - Only show when there's a `continueWatching` video. Add a dismiss state: `const [heroDismissed, setHeroDismissed] = useState(false)`
5. **Section headers**: `font-heading text-lg font-semibold` for title, `text-xs text-sw-text-muted` for count
6. **Grid**: Replace any horizontal scroll with `grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4`
7. **Card animations**: Each card gets `animate-fade-up opacity-0` with inline `style={{ animationDelay: '${index * 0.05}s', animationFillMode: 'forwards' }}`. Add an `onAnimationEnd` handler that removes the animation class and sets `opacity: 1` so hover transforms work.

- [ ] **Step 2: Restyle SeriesCard.tsx**

Key changes (keep all click handlers and data logic — only change JSX structure and classes):

1. Container: `card` class (from globals.css)
2. Thumbnail: `aspect-video relative flex items-center justify-center bg-gradient-to-br from-sw-elevated to-sw-surface`
   - If poster exists, render `<img>` filling the area
   - Play icon: `<Play size={24} className="text-sw-text-muted transition-all duration-200 group-hover:text-sw-accent group-hover:scale-[1.15]" />`
   - Add `group` class to outer card for group-hover to work
3. Badge: `badge badge-neutral absolute top-2 left-2` for "Series", `badge badge-accent` for episode badges
4. Progress bar: `absolute bottom-0 left-0 right-0 h-[3px] bg-sw-border` with fill `bg-sw-accent`
5. Body: `p-2.5 px-3` — title `font-heading text-[13px] font-semibold truncate`, meta `font-body text-[11px] text-sw-text-muted`

- [ ] **Step 3: Restyle SeriesDetailModal.tsx**

Update the modal overlay and panel styling:
1. Overlay: `fixed inset-0 z-50 flex items-center justify-center bg-black/60 glass`
2. Panel: `bg-sw-bg border border-sw-border-soft rounded-2xl max-w-lg w-full max-h-[80vh] overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.7)] animate-scale-in`
3. Header: `p-5 border-b border-sw-border-soft flex items-center justify-between` — title `font-heading text-base font-semibold`, close button `btn-icon` with `<X size={16} />`
4. Season tabs: styled like player mockup — `font-body text-xs font-medium px-3.5 py-1.5 rounded-md border border-sw-border` active: `bg-sw-accent border-sw-accent text-sw-text`
5. Episode rows: `hover:bg-sw-surface` with active row `border-l-[3px] border-sw-accent bg-sw-surface`
6. Replace all inline SVGs with Lucide icons

- [ ] **Step 4: Verify build and visual check**

Run: `npm run build`
Load the home page in the extension to verify layout.

- [ ] **Step 5: Commit**

```bash
git add src/home/Home.tsx src/home/components/SeriesCard.tsx src/home/components/SeriesDetailModal.tsx
git commit -m "Restyle Home page: grid layout, warm charcoal palette, Lucide icons"
```

---

## Task 5: Create Player-specific shared components

**Files:**
- Create: `src/components/CapsuleActions.tsx`
- Create: `src/components/KeyboardLegend.tsx`
- Create: `src/player/components/PlayerTopBar.tsx`

- [ ] **Step 1: Create CapsuleActions component**

Create `src/components/CapsuleActions.tsx`:

```tsx
import { Subtitles, FolderPlus } from 'lucide-react';

interface CapsuleActionsProps {
  onSubtitles: () => void;
  onAddToSeries: () => void;
  sidebarOpen: boolean;
}

export default function CapsuleActions({ onSubtitles, onAddToSeries, sidebarOpen }: CapsuleActionsProps) {
  const blur = (e: React.MouseEvent) => (e.currentTarget as HTMLElement).blur();

  return (
    <div
      className="fixed top-[82px] z-10 transition-[right] duration-300"
      style={{ right: sidebarOpen ? 330 : 20, transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
    >
      <div className="flex rounded-[28px] glass shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
        {/* Subtitles — glass left */}
        <button
          onClick={onSubtitles}
          onMouseUp={blur}
          className="group relative w-[58px] h-[50px] flex items-center justify-center cursor-pointer transition-all duration-250 text-sw-text/70 bg-[rgba(22,18,16,0.7)] border border-[rgba(44,36,32,0.5)] border-r-0 rounded-l-[28px] outline-none hover:text-sw-text hover:bg-[rgba(42,35,32,0.9)]"
          style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
        >
          <Subtitles size={21} />
          <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-[-4px] group-hover:translate-y-0 z-50">
            <span className="glass bg-[rgba(22,18,16,0.95)] border border-sw-border rounded-md px-2.5 py-1.5 whitespace-nowrap flex items-center gap-1.5">
              <span className="text-sw-text-secondary text-[11px] font-medium font-body">Subtitles</span>
              <kbd className="bg-sw-elevated px-1.5 py-0.5 rounded text-[10px] text-sw-text-muted font-body">C</kbd>
            </span>
          </span>
        </button>
        {/* Add to Series — dark red right */}
        <button
          onClick={onAddToSeries}
          onMouseUp={blur}
          className="group relative w-[58px] h-[50px] flex items-center justify-center cursor-pointer transition-all duration-250 text-sw-text/85 bg-[rgba(153,27,27,0.65)] border border-[rgba(185,28,28,0.3)] border-l-0 rounded-r-[28px] outline-none hover:bg-[rgba(185,28,28,0.9)] hover:text-sw-text hover:shadow-[0_0_20px_rgba(185,28,28,0.3)]"
          style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
        >
          <FolderPlus size={21} />
          <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-[-4px] group-hover:translate-y-0 z-50">
            <span className="glass bg-[rgba(22,18,16,0.95)] border border-sw-border rounded-md px-2.5 py-1.5 whitespace-nowrap">
              <span className="text-sw-text-secondary text-[11px] font-medium font-body">Add to Series</span>
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create KeyboardLegend component**

Create `src/components/KeyboardLegend.tsx`:

```tsx
import { X } from 'lucide-react';
import { useEffect } from 'react';

interface KeyboardLegendProps {
  isOpen: boolean;
  onClose: () => void;
}

const sections = [
  {
    title: 'Playback',
    shortcuts: [
      { action: 'Play / Pause', keys: ['Space', 'K'] },
      { action: 'Fullscreen', keys: ['F'] },
      { action: 'Mute', keys: ['M'] },
      { action: 'Seek back 15s', keys: ['\u2190', 'J'] },
      { action: 'Seek forward 15s', keys: ['\u2192', 'L'] },
      { action: 'Volume up / down', keys: ['\u2191', '\u2193'] },
      { action: 'Jump to 0\u201390%', keys: ['0', '\u2013', '9'] },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { action: 'Frame back / forward', keys: [',', '.'] },
      { action: 'Start / End', keys: ['Home', 'End'] },
      { action: 'Next episode', keys: ['N'] },
    ],
  },
  {
    title: 'Subtitles',
    shortcuts: [
      { action: 'Toggle subtitles', keys: ['C'] },
      { action: 'Subtitle offset +/\u2212', keys: ['+', '\u2212'] },
    ],
  },
];

export default function KeyboardLegend({ isOpen, onClose }: KeyboardLegendProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 glass"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[rgba(22,18,16,0.95)] border border-sw-border-soft rounded-2xl w-[480px] max-h-[80vh] overflow-y-auto shadow-[0_24px_64px_rgba(0,0,0,0.7)] glass animate-scale-in">
        <div className="p-5 border-b border-sw-border-soft flex items-center justify-between">
          <h2 className="font-heading text-base font-semibold">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="btn-icon w-8 h-8 bg-transparent"><X size={14} /></button>
        </div>
        {sections.map((section, si) => (
          <div key={section.title}>
            {si > 0 && <div className="h-px bg-sw-border-soft mx-5" />}
            <div className="px-5 py-3.5">
              <div className="text-[10px] font-medium text-sw-accent uppercase tracking-[1.5px] mb-2.5 font-body">{section.title}</div>
              {section.shortcuts.map((s) => (
                <div key={s.action} className="flex items-center justify-between py-1.5">
                  <span className="text-[13px] text-sw-text-secondary font-body">{s.action}</span>
                  <div className="flex gap-1">
                    {s.keys.map((k) => (
                      <span key={k} className="bg-sw-surface border border-sw-border text-sw-text px-2 py-0.5 rounded-[5px] font-body text-[11px] font-medium min-w-[28px] text-center">{k}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create PlayerTopBar component**

Create `src/player/components/PlayerTopBar.tsx`:

```tsx
import { Play, PanelRight, ChevronRight } from 'lucide-react';
import Tooltip from '../../components/Tooltip';

interface PlayerTopBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onShowShortcuts: () => void;
}

export default function PlayerTopBar({ sidebarOpen, onToggleSidebar, onShowShortcuts }: PlayerTopBarProps) {
  const blur = (e: React.MouseEvent) => (e.currentTarget as HTMLElement).blur();

  return (
    <div className="fixed top-2 left-2 right-2 z-20 flex items-center justify-between px-5 py-3 bg-[rgba(14,12,10,0.75)] glass border border-sw-border-soft rounded-[14px]">
      <a
        href={chrome.runtime.getURL('src/home/home.html')}
        className="font-heading font-bold text-base text-sw-text flex items-center gap-2 no-underline hover:opacity-80 transition-opacity"
      >
        <div className="w-7 h-7 bg-sw-accent rounded-md flex items-center justify-center">
          <Play size={12} fill="#f0ece8" stroke="none" />
        </div>
        StreamWatch
      </a>
      <div className="flex items-center gap-2">
        <Tooltip text="Shortcuts" shortcut="?">
          <button onClick={(e) => { onShowShortcuts(); blur(e); }} className="btn-icon w-9 h-9 bg-[rgba(30,26,23,0.6)] border-sw-border-soft font-heading text-[15px] font-semibold">?</button>
        </Tooltip>
        <Tooltip text="Sidebar">
          <button onClick={(e) => { onToggleSidebar(); blur(e); }} className="btn-icon w-9 h-9 bg-[rgba(30,26,23,0.6)] border-sw-border-soft">
            {sidebarOpen ? <ChevronRight size={17} /> : <PanelRight size={17} />}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/CapsuleActions.tsx src/components/KeyboardLegend.tsx src/player/components/PlayerTopBar.tsx
git commit -m "Add CapsuleActions, KeyboardLegend, and PlayerTopBar components"
```

---

## Task 6: Restyle Player page

**Files:**
- Modify: `src/player/Player.tsx`
- Modify: `src/player/components/SeriesSidebar.tsx`
- Modify: `src/player/components/NextEpisodeOverlay.tsx`

This is the most critical task. Reference the approved mockup at `.superpowers/brainstorm/1980-1775741995/content/player-final-v2.html` for exact positioning and styling. **Do NOT change any video playback logic, keyboard handlers, subtitle handling, or progress tracking.**

- [ ] **Step 1: Restructure Player.tsx layout**

Key structural changes (keep ALL existing state, refs, handlers, useEffects — only change the JSX return):

1. **Remove the old header/info panel** — replaced by `PlayerTopBar` and title overlay on video
2. **Add new state**: `const [showShortcuts, setShowShortcuts] = useState(false)`
3. **Add `?` key handler** to existing `handleKeyDown`: add a case for `?` that calls `setShowShortcuts(true)` (only when not in an input)
4. **Video fills viewport**: The main container becomes `fixed inset-0` with the `<video>` element filling it. Remove any flex split layout.
5. **Title overlay**: `fixed top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 via-black/40 to-transparent pt-[72px] px-8 pb-16 pointer-events-none` — title `font-heading text-[56px] font-bold text-white leading-none drop-shadow-lg`
6. **Import and render** `PlayerTopBar`, `CapsuleActions`, `KeyboardLegend`
7. **CapsuleActions**: pass `sidebarOpen={showSidebar}`, `onSubtitles={() => setShowSubtitleModal(true)}`, `onAddToSeries={() => setShowAddModal(true)}`
8. **KeyboardLegend**: `isOpen={showShortcuts}` `onClose={() => setShowShortcuts(false)}`
9. **Keyboard focus management**: Add to the container div: `onMouseUp` handler that blurs `document.activeElement`
10. **Next Episode + Sidebar**: positions shift based on `showSidebar` — pass the flag to both
11. **Remove the old bottom info section** (VideoInfo component is no longer used in this layout — the title overlay replaces it)
12. **Keep all existing**: keyboard handler, video event handlers, progress tracking, subtitle logic, series logic

- [ ] **Step 2: Restyle SeriesSidebar.tsx**

Key changes (keep all episode navigation and series logic):

1. Container: `fixed top-[76px] right-2 bottom-2 z-[15] w-[310px] glass bg-[rgba(22,18,16,0.82)] border border-sw-border-soft rounded-[14px] flex flex-col overflow-hidden transition-all duration-300` with collapsed state: `translate-x-[calc(100%+16px)] opacity-0`
2. Use `cubic-bezier(0.4, 0, 0.2, 1)` for the transition
3. Header: `p-4 pt-5 border-b border-sw-border-soft` — title `font-heading text-[17px] font-semibold`
4. Season tabs: `font-body text-[13px] font-medium px-3.5 py-1.5 rounded-md border border-[rgba(44,36,32,0.53)]` — active: `bg-sw-accent border-sw-accent text-sw-text`
5. Episode items: `flex items-center gap-3 px-[18px] py-2.5 cursor-pointer transition-colors duration-150 border-l-[3px] border-transparent` — active: `bg-[rgba(30,26,23,0.5)] border-l-sw-accent`, completed: `opacity-50`
6. Episode number: `font-heading text-sm font-semibold text-sw-text-muted` — active number: `text-sw-accent`
7. Episode title: `font-body text-sm font-medium truncate`, meta: `font-body text-[11px] text-sw-text-muted`
8. Check icon: `<Check size={14} className="text-green-400" />` from lucide-react
9. Scrollbar: `scrollbar-thin` class
10. Remove any close/X button — sidebar is controlled by the toggle in PlayerTopBar

- [ ] **Step 3: Restyle NextEpisodeOverlay.tsx**

Key changes (keep all timer/countdown logic):

1. Container gets `sidebarOpen` prop, position: `fixed bottom-20 z-10` with `style={{ right: sidebarOpen ? 334 : 24, transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s ease' }}`
2. Styling: `glass bg-[rgba(22,18,16,0.9)] border border-sw-border-soft rounded-[14px] p-4 px-5 w-[280px] shadow-[0_12px_40px_rgba(0,0,0,0.6)] cursor-pointer hover:translate-y-[-4px] hover:shadow-[0_16px_48px_rgba(0,0,0,0.7)]`
3. "Up Next" label: `text-[10px] font-medium text-sw-text-muted uppercase tracking-[1.5px]`
4. Title: `font-heading text-sm font-semibold`
5. Play Now button: `btn-primary text-xs py-2 px-4 flex-1 flex items-center justify-center gap-1.5`
6. Cancel button: `btn-secondary text-xs py-2 px-3.5`
7. Timer bar: `h-0.5 bg-sw-border rounded-sm mt-3` with fill `bg-sw-accent`

- [ ] **Step 4: Verify build and visual check**

Run: `npm run build`
Load the player page with a video to verify layout and keyboard shortcuts still work.

- [ ] **Step 5: Commit**

```bash
git add src/player/Player.tsx src/player/components/SeriesSidebar.tsx src/player/components/NextEpisodeOverlay.tsx
git commit -m "Restyle Player: floating glass overlays, capsule buttons, keyboard legend"
```

---

## Task 7: Restyle AddToSeriesModal and SubtitleModal

**Files:**
- Modify: `src/player/components/AddToSeriesModal.tsx`
- Modify: `src/player/components/SubtitleModal.tsx`

- [ ] **Step 1: Restyle AddToSeriesModal.tsx**

Apply the modal pattern from SeriesDetailModal:
1. Overlay: `fixed inset-0 z-50 flex items-center justify-center bg-black/60 glass`
2. Panel: `bg-sw-bg border border-sw-border-soft rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.7)] animate-scale-in` with appropriate max-width
3. Header: `p-5 border-b border-sw-border-soft` with `font-heading` title and `btn-icon` close
4. All inputs: `input` class
5. All buttons: `btn-primary` or `btn-secondary`
6. Replace any inline SVGs with Lucide icons
7. Keep ALL logic — series creation, episode matching, etc.

- [ ] **Step 2: Restyle SubtitleModal.tsx**

Same modal pattern:
1. Modal overlay and panel same as above
2. Tabs: `flex border-b border-sw-border-soft` — each tab `flex-1 py-2.5 text-xs font-medium text-center font-body transition-colors border-b-2 border-transparent` — active: `text-sw-text border-sw-accent`
3. Search input: `input` class with full width
4. Subtitle results: rows with `hover:bg-sw-surface` and download button `btn-secondary text-xs py-1.5 px-3`
5. Replace any inline SVGs with Lucide icons
6. Keep ALL subtitle logic — search, download, upload, offset

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/player/components/AddToSeriesModal.tsx src/player/components/SubtitleModal.tsx
git commit -m "Restyle AddToSeries and Subtitle modals with new design system"
```

---

## Task 8: Restyle Popup page

**Files:**
- Modify: `src/popup/Popup.tsx`

- [ ] **Step 1: Restyle Popup.tsx**

Apply design system (keep all logic):
1. Body: `bg-sw-bg text-sw-text font-body` (popup is 380px wide, set in manifest)
2. Header: `flex items-center justify-between px-4 py-3 border-b border-sw-border` — logo with red square icon + "StreamWatch" in `font-heading font-bold text-sm`
3. Right header: settings + home icon buttons using `btn-icon` class with smaller size (w-8 h-8) and Lucide icons (`Settings`, `Home` from lucide-react)
4. Sign-in button: `btn-primary w-full`
5. Video items: mini cards with `bg-sw-surface border border-sw-border rounded-lg p-3` — title `font-heading text-xs font-semibold truncate`, meta `font-body text-[10px] text-sw-text-muted`
6. Progress bars: `h-1 bg-sw-border rounded-full` with `bg-sw-accent` fill
7. Footer buttons: `btn-secondary text-xs`
8. Replace all inline SVGs with Lucide icons

- [ ] **Step 2: Verify build**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/popup/Popup.tsx
git commit -m "Restyle Popup with new design system"
```

---

## Task 9: Restyle Settings page

**Files:**
- Modify: `src/settings/Settings.tsx`

- [ ] **Step 1: Restyle Settings.tsx**

Apply design system (keep all logic):
1. Body: `bg-sw-bg min-h-screen`
2. Container: `max-w-3xl mx-auto p-8`
3. Page title: `font-heading text-2xl font-bold mb-6`
4. Section cards: `bg-sw-surface border border-sw-border rounded-xl p-6 mb-6`
5. Section titles: `font-heading text-base font-semibold mb-4`
6. Labels: `font-body text-sm text-sw-text-secondary`
7. Replace all `<select>` elements with `CustomDropdown` component (import from `../../components/CustomDropdown`)
8. Inputs: `input` class
9. Buttons: `btn-primary`, `btn-secondary`, or `btn-ghost` as appropriate
10. Toggles/checkboxes: `accent-[#B91C1C]`
11. Danger actions (delete, clear): use `btn-secondary` with `text-red-400 hover:text-red-300 border-red-900/50`
12. Replace all inline SVGs with Lucide icons
13. User profile: avatar with `rounded-full border-2 border-sw-border`

- [ ] **Step 2: Verify build**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/settings/Settings.tsx
git commit -m "Restyle Settings page with new design system"
```

---

## Task 10: Final cleanup and build verification

**Files:**
- Possibly modify: any file with remaining old color classes

- [ ] **Step 1: Search for remaining old color references**

Run:
```bash
grep -r "bg-gray-\|text-gray-\|border-gray-\|bg-sw-dark\|#E50914\|#141414\|sw-light-gray" src/ --include="*.tsx" -l
```

For each file found, update the old Tailwind classes to new tokens:
- `bg-gray-800` → `bg-sw-surface`
- `bg-gray-700` → `bg-sw-elevated`
- `bg-gray-900` → `bg-sw-bg`
- `text-gray-400` → `text-sw-text-secondary`
- `text-gray-500` → `text-sw-text-muted`
- `border-gray-700` → `border-sw-border`
- `#E50914` → `#B91C1C` (or `var(--sw-accent)`)
- `#141414` → `#161210` (or `var(--sw-bg)`)

- [ ] **Step 2: Remove old Tailwind color aliases if no longer used**

In `tailwind.config.js`, if `sw-red`, `sw-dark`, `sw-gray`, `sw-light-gray` are no longer referenced anywhere in `src/`, remove them from the config.

Run:
```bash
grep -r "sw-gray\|sw-light-gray" src/ --include="*.tsx" -l
```
If empty, remove those entries.

- [ ] **Step 3: Full build and check**

Run:
```bash
npm run build
```
Expected: Clean build, no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Clean up old color tokens and finalize UI redesign"
```
