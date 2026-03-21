# Crucible UI Foundation Design Spec

**Goal:** Install shadcn/ui, apply the OKLCH color theme and monospace typography, and replace all hand-styled base components across the 5 existing pages. This is the design system foundation — page-specific redesigns come in later sub-projects.

**Sub-project:** 1 of 3 (Foundation → Page Redesigns → Cross-cutting Features)

---

## Design Decisions

- **Light mode only** — no dark theme, no `next-themes`
- **Fonts:** Geist Mono for all UI text (headings, body, labels) — drop the `Geist` sans import entirely. JetBrains Mono for code/data values (IDs, round counts, technical output).
- **Colors:** OKLCH system (warm orange primary, teal secondary)
- **Radius:** 0.75rem
- **Install method:** `pnpm dlx shadcn@latest add` via CLI (project uses pnpm)
- **Motion:** Install `motion` (formerly Framer Motion) but only wire up basic transitions in foundation pass — rich animations come in sub-project 3

---

## Color Tokens (OKLCH)

All colors use OKLCH for perceptual uniformity. These replace the current hex-based CSS variables.

```css
:root {
  --background: oklch(0.985 0.002 90.00);
  --foreground: oklch(0.21 0.01 260.00);
  --card: oklch(1.0 0 0);
  --card-foreground: oklch(0.21 0.01 260.00);
  --popover: oklch(1.0 0 0);
  --popover-foreground: oklch(0.21 0.01 260.00);
  --primary: oklch(0.6716 0.1368 48.513);
  --primary-foreground: oklch(1.0 0 0);
  --secondary: oklch(0.536 0.0398 196.028);
  --secondary-foreground: oklch(1.0 0 0);
  --muted: oklch(0.95 0.01 90.00);
  --muted-foreground: oklch(0.50 0.02 260.00);
  --accent: oklch(0.95 0.03 48.51);
  --accent-foreground: oklch(0.40 0.10 48.51);
  --destructive: oklch(0.55 0.20 27.00);
  --destructive-foreground: oklch(1.0 0 0);
  --border: oklch(0.90 0.01 90.00);
  --input: oklch(0.90 0.01 90.00);
  --ring: oklch(0.6716 0.1368 48.513);
  --radius: 0.75rem;

  /* Severity (simulation-specific) */
  --severity-normal: oklch(0.65 0.15 145.00);
  --severity-normal-bg: oklch(0.97 0.02 145.00);
  --severity-normal-border: oklch(0.85 0.05 145.00);
  --severity-high: oklch(0.70 0.15 80.00);
  --severity-high-bg: oklch(0.97 0.02 80.00);
  --severity-high-border: oklch(0.85 0.05 80.00);
  --severity-critical: oklch(0.55 0.20 27.00);
  --severity-critical-bg: oklch(0.97 0.02 27.00);
  --severity-critical-border: oklch(0.85 0.05 27.00);

  /* Shadows */
  --shadow-sm: 0 1px 2px oklch(0 0 0 / 0.04);
  --shadow-md: 0 4px 6px oklch(0 0 0 / 0.06);
  --shadow-lg: 0 10px 15px oklch(0 0 0 / 0.08);
}
```

---

## Typography

| Role | Font | Weight | Size | Use |
|------|------|--------|------|-----|
| Heading (h1) | Geist Mono | 700 | 28px | Page titles |
| Heading (h2) | Geist Mono | 600 | 18px | Section headings |
| Body | Geist Mono | 400 | 14px | Paragraphs, descriptions |
| Label | Geist Mono | 500 | 11px uppercase | Section labels, panel headers |
| Code/Data | JetBrains Mono | 400 | 13px | IDs, round counts, technical values |
| Small | Geist Mono | 400 | 12px | Messages, secondary content |

Font loading: `layout.tsx` currently imports both `Geist` (sans) and `Geist_Mono`. Remove the `Geist` sans import — all UI text uses Geist Mono. Add `JetBrains_Mono` from `next/font/google` with variable `--font-jetbrains-mono`.

---

## Tailwind v4 + shadcn Integration

The project uses Tailwind v4 with CSS-based config (`@import "tailwindcss"` + `@theme inline`). No `tailwind.config.ts` is needed.

**globals.css integration:** Replace the current `@theme inline` block with one that maps all shadcn tokens:

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius: 0.75rem;
  --font-sans: var(--font-geist-mono);
  --font-mono: var(--font-jetbrains-mono);
}
```

**shadcn/ui init:** When running `pnpm dlx shadcn@latest init`, select Tailwind v4 mode. This configures `components.json` to use CSS variables directly (no `tailwind.config.ts` extension). The `cn()` utility from `tailwind-merge` + `clsx` works with Tailwind v4 classes unchanged.

**postcss.config.mjs:** Leave as-is — Tailwind v4 already configured via `@tailwindcss/postcss`.

---

## shadcn Components — Foundation Pass

Install these 12 components:

### Core (used on every page)
- **button** — replaces all hand-styled `<button>` elements. Variants: default (primary), secondary, outline, ghost, destructive. Sizes: default, sm.
- **card** — replaces all `.bg-card.border.rounded-lg` patterns. Used for preset cards, agent cards, pressure cards, score cards, dossier sections, panel containers.
- **badge** — replaces all status pills and severity tags. Variants: default, secondary, outline, destructive. Custom variants for severity (success/warning/critical with dot indicators).
- **input** — replaces all `<input>` elements (research form, upload zone).
- **label** — pairs with input.
- **separator** — replaces `border-b border-border` dividers.

### Layout (used across multiple pages)
- **tabs** — replaces WorldTabs (Slack/Email/Timeline), dossier editor sections.
- **alert** — replaces all error/warning/success banners.
- **skeleton** — replaces "Loading..." text states on every page.
- **tooltip** — for graph node details, truncated text, icon-only buttons.

### Overlay (needed for foundation interactions)
- **dialog** — for confirmation dialogs (stop simulation, destructive actions).
- **sheet** — for mobile navigation, graph node detail panel on smaller screens.

---

## Component Replacement Map

Each existing hand-styled pattern maps to a shadcn component:

### Buttons (all pages)
```
BEFORE: <button className="px-3 py-1 text-xs rounded-md bg-red-500 text-white hover:bg-red-600">
AFTER:  <Button variant="destructive" size="sm">Stop</Button>

BEFORE: <button className="px-3 py-1 text-xs rounded-md bg-accent text-white hover:opacity-90">
AFTER:  <Button size="sm">View Report</Button>
```

### Cards (home, configure, report)
```
BEFORE: <div className="border border-border rounded-lg bg-card p-4">
AFTER:  <Card><CardContent className="p-4">...</CardContent></Card>
```

### Status Badges (simulation, report)
```
BEFORE: <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor}`}>
AFTER:  <Badge variant={statusVariant}><span className="pulse-dot" /> {status}</Badge>
```

### Tabs (simulation, research)
```
BEFORE: Custom WorldTabs with manual tab state
AFTER:  <Tabs defaultValue="slack"><TabsList><TabsTrigger>...</TabsTrigger></TabsList><TabsContent>...</TabsContent></Tabs>
```

### Alerts (all pages)
```
BEFORE: <div className="p-4 rounded-lg bg-severity-critical-bg border ...">
AFTER:  <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
```

### Loading States (all pages)
```
BEFORE: <p className="text-sm text-text-secondary">Loading...</p>
AFTER:  <div className="space-y-3"><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>
```

---

## Layout Changes

### Header (`components/layout/Header.tsx`)
- Keep minimal: logo left, subtitle right
- Replace hand-styled border with shadcn Separator
- Add subtle hover transition on logo link

### Page Shells
- Keep existing `max-w-5xl mx-auto` for content pages (home, report)
- Keep `h-screen flex flex-col` for full-bleed pages (simulation, research)
- Replace all `border-b border-border bg-card` status bars with consistent component

### Panel Pattern (simulation, research)
- Extract a reusable `SplitPanel` component that wraps the graph + content layout
- Both simulation and research pages use identical split-panel with ViewToggle
- Panels use `<Card>` with custom panel header

---

## Motion (foundation pass — minimal)

Install `motion` package. In the foundation pass, add only:

1. **Page transitions** — wrap page content in `<motion.div>` with fade-in (`opacity: 0 → 1`, 200ms). Note: Next.js App Router layouts persist across routes, so `<AnimatePresence>` requires a `template.tsx` wrapper that re-mounts on navigation. Use `motion.div` with `key={pathname}` inside a client `template.tsx`.
2. **Card hover** — subtle scale(1.01) + shadow elevation on hover (150ms)
3. **Badge pulse** — CSS animation for "Running" status dot (already exists, keep it)
4. **Skeleton shimmer** — CSS animation (already designed)

Rich animations (staggered lists, graph animations, pressure escalation, etc.) come in sub-project 3.

---

## Files Changed

### New Files

shadcn components go in `frontend/app/components/ui/` to match existing component structure. Configure `components.json` aliases: `"components": "@/app/components"`, `"ui": "@/app/components/ui"`, `"lib": "@/app/lib"`.

- `frontend/app/components/ui/button.tsx`
- `frontend/app/components/ui/card.tsx`
- `frontend/app/components/ui/badge.tsx`
- `frontend/app/components/ui/input.tsx`
- `frontend/app/components/ui/label.tsx`
- `frontend/app/components/ui/separator.tsx`
- `frontend/app/components/ui/tabs.tsx`
- `frontend/app/components/ui/alert.tsx`
- `frontend/app/components/ui/skeleton.tsx`
- `frontend/app/components/ui/tooltip.tsx`
- `frontend/app/components/ui/dialog.tsx`
- `frontend/app/components/ui/sheet.tsx`
- `frontend/app/lib/utils.ts` — shadcn `cn()` utility (alongside existing `api.ts`)
- `frontend/app/components/shared/SplitPanel.tsx` — reusable split-panel layout (extracted from simulation + research pages)
- `frontend/components.json` — shadcn config

### Modified Files
- `frontend/app/globals.css` — replace hex variables with OKLCH tokens, add shadcn base styles
- `frontend/app/layout.tsx` — add JetBrains Mono font, update CSS variable classes
- `frontend/package.json` — add shadcn deps (class-variance-authority, clsx, tailwind-merge, lucide-react, motion)
- `frontend/app/page.tsx` — replace hand-styled components with shadcn
- `frontend/app/simulation/[simId]/page.tsx` — replace buttons, badges, alerts, tabs
- `frontend/app/report/[simId]/page.tsx` — replace buttons, alerts, loading states
- `frontend/app/research/[projectId]/page.tsx` — replace inputs, alerts, loading states
- `frontend/app/configure/[presetId]/page.tsx` — replace cards, buttons
- `frontend/app/configure/project/[projectId]/page.tsx` — replace cards, buttons
- `frontend/app/components/layout/Header.tsx` — update styling
- `frontend/app/components/home/PresetCard.tsx` — use Card component
- `frontend/app/components/home/PresetGrid.tsx` — use Card grid
- `frontend/app/components/home/ResearchForm.tsx` — use Input, Label, Button
- `frontend/app/components/home/UploadZone.tsx` — use Card, Button
- `frontend/app/components/simulation/WorldTabs.tsx` — use Tabs
- `frontend/app/components/simulation/PressureStrip.tsx` — use Badge
- `frontend/app/components/simulation/ViewToggle.tsx` — use Button group
- `frontend/app/components/simulation/GraphPanel.tsx` — use Card, Button, Tooltip
- `frontend/app/components/simulation/EventInjectBanner.tsx` — use Alert
- `frontend/app/components/simulation/SlackWorld.tsx` — use Card for message containers
- `frontend/app/components/simulation/EmailWorld.tsx` — use Card for email containers
- `frontend/app/components/simulation/TimelineView.tsx` — use Card, Badge, Separator
- `frontend/app/components/simulation/RoundDivider.tsx` — use Separator
- `frontend/app/components/simulation/GraphNodeDetail.tsx` — use Card, Badge, Tooltip
- `frontend/app/components/report/ReportHeader.tsx` — use Card
- `frontend/app/components/report/ReportTimeline.tsx` — use Card, Badge, Separator
- `frontend/app/components/report/AgentScorecard.tsx` — use Card, Badge
- `frontend/app/components/report/AgentScoreGrid.tsx` — use Card grid
- `frontend/app/components/report/ExportButton.tsx` — use Button
- `frontend/app/components/research/ResearchProgress.tsx` — use Skeleton, Alert
- `frontend/app/components/research/DossierEditor.tsx` — use Card, Tabs, Input
- `frontend/app/components/research/CompanyProfile.tsx` — use Card
- `frontend/app/components/research/ComplianceTags.tsx` — use Badge
- `frontend/app/components/research/OrgStructure.tsx` — use Card
- `frontend/app/components/research/RecentEvents.tsx` — use Card, Badge
- `frontend/app/components/research/RiskProfile.tsx` — use Card, Badge
- `frontend/app/components/research/SystemsList.tsx` — use Card
- `frontend/app/components/configure/AgentCards.tsx` — use Card, Badge
- `frontend/app/components/configure/PressureCards.tsx` — use Card, Badge
- `frontend/app/components/configure/LaunchBar.tsx` — use Button
- `frontend/app/components/configure/EventTimeline.tsx` — use Card, Separator
- `frontend/app/components/configure/WorldList.tsx` — use Card

### Deleted Files
None — all existing components are modified in place.

---

## What This Does NOT Cover

These are deferred to later sub-projects:

- **Page-specific redesigns** (sub-project 2) — richer report with 40+ elements, enhanced graph with edge labels/self-loops, simulation history carousel, research progress redesign
- **Cross-cutting features** (sub-project 3) — Motion animations (staggered lists, pressure escalation, graph transitions), simulation history, report workflow timeline, real-time tool call timeline
- **New API endpoints** — the foundation pass uses existing endpoints only
- **Dark mode** — not planned
- **D3 graph components** — `GraphPanel.tsx` uses D3 force-directed graph directly. The foundation pass wraps it in a `Card` container but does not modify D3 internals. Graph enhancements (edge labels, self-loops, rich interactions) come in sub-project 2.

---

## Success Criteria

1. All 5 pages render with the new OKLCH color system
2. All hand-styled buttons, cards, badges, inputs, tabs, alerts replaced with shadcn components
3. Loading states use Skeleton instead of text
4. Typography uses Geist Mono (UI) + JetBrains Mono (code/data)
5. No visual regressions — all existing functionality preserved
6. `pnpm build` succeeds with no TypeScript errors
7. Motion package installed, basic page transitions working
