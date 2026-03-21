# Crucible UI Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install shadcn/ui on the existing Next.js 16 frontend, apply the OKLCH color theme and monospace typography, and replace all hand-styled base components across 5 pages with shadcn equivalents.

**Architecture:** Initialize shadcn/ui with Tailwind v4 mode, rewrite `globals.css` with OKLCH tokens, install 12 shadcn components via CLI, then migrate each page's components from hand-styled to shadcn. Motion (framer-motion) is installed with minimal page transitions.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, shadcn/ui, pnpm, Motion (framer-motion), Lucide React icons

**Spec:** `docs/superpowers/specs/2026-03-21-crucible-ui-foundation-design.md`

---

## File Structure

### New Files
```
frontend/
├── components.json                          # shadcn config
├── app/
│   ├── lib/utils.ts                         # cn() utility
│   ├── template.tsx                         # Motion page transition wrapper
│   ├── components/
│   │   ├── ui/                              # shadcn components (12 files, CLI-generated)
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   ├── separator.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── alert.tsx
│   │   │   ├── skeleton.tsx
│   │   │   ├── tooltip.tsx
│   │   │   ├── dialog.tsx
│   │   │   └── sheet.tsx
│   │   └── shared/
│   │       └── SplitPanel.tsx               # Reusable split-panel layout
```

### Modified Files (by task)
- Task 1: `globals.css`, `layout.tsx`, `package.json`
- Task 2: (CLI-generated — shadcn components)
- Task 3: `layout/Header.tsx`
- Task 4: `page.tsx`, `home/PresetCard.tsx`, `home/PresetGrid.tsx`, `home/ResearchForm.tsx`, `home/UploadZone.tsx`
- Task 5: `simulation/[simId]/page.tsx`, `simulation/PressureStrip.tsx`, `simulation/ViewToggle.tsx`, `simulation/WorldTabs.tsx`, `simulation/SlackWorld.tsx`, `simulation/EmailWorld.tsx`, `simulation/TimelineView.tsx`, `simulation/RoundDivider.tsx`, `simulation/GraphPanel.tsx`, `simulation/GraphNodeDetail.tsx`, `simulation/EventInjectBanner.tsx`
- Task 6: `research/[projectId]/page.tsx`, `research/ResearchProgress.tsx`, `research/DossierEditor.tsx`, `research/CompanyProfile.tsx`, `research/ComplianceTags.tsx`, `research/OrgStructure.tsx`, `research/RecentEvents.tsx`, `research/RiskProfile.tsx`, `research/SystemsList.tsx`
- Task 7: `report/[simId]/page.tsx`, `report/ReportHeader.tsx`, `report/ReportTimeline.tsx`, `report/AgentScorecard.tsx`, `report/AgentScoreGrid.tsx`, `report/ExportButton.tsx`
- Task 8: `configure/[presetId]/page.tsx`, `configure/project/[projectId]/page.tsx`, `configure/AgentCards.tsx`, `configure/PressureCards.tsx`, `configure/LaunchBar.tsx`, `configure/EventTimeline.tsx`, `configure/WorldList.tsx`
- Task 9: `template.tsx` (new), `layout.tsx`

---

### Task 1: Initialize shadcn/ui, Theme, and Typography

**Files:**
- Modify: `frontend/app/globals.css`
- Modify: `frontend/app/layout.tsx`
- Modify: `frontend/package.json`
- Create: `frontend/app/lib/utils.ts`
- Create: `frontend/components.json`

- [ ] **Step 1: Initialize shadcn/ui**

Run from `frontend/` directory:

```bash
cd frontend && pnpm dlx shadcn@latest init
```

When prompted, select:
- Style: New York
- Base color: Neutral
- CSS variables: yes
- Tailwind CSS version: v4
- Global CSS file: `app/globals.css`
- Components alias: `@/app/components`
- Utils alias: `@/app/lib/utils`

This creates `components.json` and `app/lib/utils.ts`.

- [ ] **Step 2: Verify components.json aliases**

Read `frontend/components.json` and confirm the aliases point to:
```json
{
  "aliases": {
    "components": "@/app/components",
    "ui": "@/app/components/ui",
    "lib": "@/app/lib",
    "utils": "@/app/lib/utils"
  }
}
```

If shadcn set them differently, update to match.

- [ ] **Step 3: Replace globals.css with OKLCH theme**

Replace the entire contents of `frontend/app/globals.css` with:

```css
@import "tailwindcss";

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
  --sidebar-background: oklch(0.985 0.002 90.00);
  --sidebar-foreground: oklch(0.21 0.01 260.00);
  --sidebar-primary: oklch(0.6716 0.1368 48.513);
  --sidebar-primary-foreground: oklch(1.0 0 0);
  --sidebar-accent: oklch(0.95 0.03 48.51);
  --sidebar-accent-foreground: oklch(0.40 0.10 48.51);
  --sidebar-border: oklch(0.90 0.01 90.00);
  --sidebar-ring: oklch(0.6716 0.1368 48.513);

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
  --color-sidebar-background: var(--sidebar-background);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-severity-normal: var(--severity-normal);
  --color-severity-normal-bg: var(--severity-normal-bg);
  --color-severity-normal-border: var(--severity-normal-border);
  --color-severity-high: var(--severity-high);
  --color-severity-high-bg: var(--severity-high-bg);
  --color-severity-high-border: var(--severity-high-border);
  --color-severity-critical: var(--severity-critical);
  --color-severity-critical-bg: var(--severity-critical-bg);
  --color-severity-critical-border: var(--severity-critical-border);
  --radius: 0.75rem;
  --font-sans: var(--font-geist-mono);
  --font-mono: var(--font-jetbrains-mono);
}

body {
  background: var(--background);
  color: var(--foreground);
}

/* Severity text color helpers (used by existing components) */
.text-severity-critical-text { color: var(--severity-critical); }
.text-severity-high-text { color: var(--severity-high); }
.text-severity-normal-text { color: var(--severity-normal); }

/* Pulse animation for live status dots */
@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.animate-pulse-dot { animation: pulse-dot 2s ease-in-out infinite; }

/* Skeleton shimmer */
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

- [ ] **Step 4: Update layout.tsx — fonts**

Replace the `layout.tsx` font setup. Remove `Geist` sans import, keep `Geist_Mono`, add `JetBrains_Mono`:

```tsx
import type { Metadata } from "next";
import { Geist_Mono, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Crucible — Enterprise Simulation",
  description: "Crucible enterprise simulation engine by raxIT Labs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistMono.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Install motion package**

```bash
cd frontend && pnpm add motion lucide-react
```

- [ ] **Step 6: Verify build**

```bash
cd frontend && pnpm build
```

Expected: Build succeeds. The app renders with the new color system and monospace font everywhere.

- [ ] **Step 7: Commit**

```bash
git add frontend/
git commit -m "feat: initialize shadcn/ui with OKLCH theme and monospace typography"
```

---

### Task 2: Install shadcn Components

**Files:**
- Create: `frontend/app/components/ui/*.tsx` (12 files via CLI)

- [ ] **Step 1: Install all 12 components via CLI**

Run each from `frontend/` directory:

```bash
cd frontend && pnpm dlx shadcn@latest add button card badge input label separator tabs alert skeleton tooltip dialog sheet
```

This installs all 12 at once. If shadcn prompts about overwriting `globals.css`, decline (we already set it up).

- [ ] **Step 2: Verify components installed**

```bash
ls frontend/app/components/ui/
```

Expected: 12 `.tsx` files: `button.tsx`, `card.tsx`, `badge.tsx`, `input.tsx`, `label.tsx`, `separator.tsx`, `tabs.tsx`, `alert.tsx`, `skeleton.tsx`, `tooltip.tsx`, `dialog.tsx`, `sheet.tsx`.

- [ ] **Step 3: Verify build**

```bash
cd frontend && pnpm build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/components/ui/ frontend/package.json frontend/pnpm-lock.yaml
git commit -m "feat: install 12 shadcn/ui components"
```

---

### Task 3: Migrate Header Component

**Files:**
- Modify: `frontend/app/components/layout/Header.tsx`

- [ ] **Step 1: Rewrite Header with shadcn components**

```tsx
import Link from "next/link";
import { Separator } from "@/app/components/ui/separator";

export default function Header() {
  return (
    <header className="bg-card">
      <div className="flex items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <span className="text-lg font-bold text-primary">Crucible</span>
          <span className="text-sm text-muted-foreground font-mono">by raxIT Labs</span>
        </Link>
      </div>
      <Separator />
    </header>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/components/layout/Header.tsx
git commit -m "refactor: migrate Header to shadcn Separator"
```

---

### Task 4: Migrate Home Page Components

**Files:**
- Modify: `frontend/app/page.tsx`
- Modify: `frontend/app/components/home/PresetCard.tsx`
- Modify: `frontend/app/components/home/PresetGrid.tsx`
- Modify: `frontend/app/components/home/ResearchForm.tsx`
- Modify: `frontend/app/components/home/UploadZone.tsx`

- [ ] **Step 1: Rewrite PresetCard**

```tsx
import Link from "next/link";
import { Card, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import type { Preset } from "@/app/types";

export default function PresetCard({ preset }: { preset: Preset }) {
  return (
    <Link href={`/configure/${preset.id}`}>
      <Card className="h-full transition-all hover:shadow-md hover:border-primary cursor-pointer">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
              {preset.industry}
            </Badge>
            <span className="text-xs text-muted-foreground">{preset.size}</span>
          </div>
          <h3 className="text-base font-semibold mb-1">{preset.name}</h3>
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{preset.description}</p>
          <div className="flex gap-2 flex-wrap">
            {preset.worldTypes.map((w) => (
              <Badge key={w} variant="outline" className="text-xs font-mono">
                {w}
              </Badge>
            ))}
            <Badge variant="outline" className="text-xs font-mono">
              {preset.pressureCount} pressures
            </Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 2: Rewrite ResearchForm**

Replace `frontend/app/components/home/ResearchForm.tsx`. Key changes:
- Wrap in `<Card>` / `<CardContent>`
- Replace `<input>` with shadcn `<Input>`
- Replace `<label>` with shadcn `<Label>`
- Replace submit `<button>` with shadcn `<Button>`
- Replace error div with `<Alert variant="destructive">`
- Replace file pills with `<Badge variant="outline">`

```tsx
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "@/app/actions/project";
import { Card, CardContent } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Alert, AlertDescription } from "@/app/components/ui/alert";

export default function ResearchForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [context, setContext] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("company_url", url.trim());
    if (context.trim()) formData.append("user_context", context.trim());
    for (const file of files) {
      formData.append("files", file);
    }

    const result = await createProject(formData);
    if ("error" in result) {
      setError(result.error);
      setLoading(false);
      return;
    }
    router.push(`/research/${result.data.projectId}`);
  }, [url, context, files, router]);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      /\.(pdf|md|txt)$/i.test(f.name)
    );
    setFiles((prev) => [...prev, ...dropped]);
  }, []);

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="company-url">Company URL *</Label>
          <Input
            id="company-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://company.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="context">
            Additional Context <span className="text-muted-foreground">(optional)</span>
          </Label>
          <textarea
            id="context"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="E.g., 'We just had a ransomware scare', 'Focus on GDPR compliance'..."
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
          />
        </div>

        <div className="space-y-2">
          <Label>
            Documents <span className="text-muted-foreground">(optional — PDF, MD, TXT)</span>
          </Label>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            className="border-2 border-dashed border-border rounded-md p-4 text-center text-sm text-muted-foreground"
          >
            {files.length === 0 ? (
              <p>Drop files here or{" "}
                <label className="text-primary cursor-pointer hover:underline">
                  browse
                  <input
                    type="file"
                    accept=".pdf,.md,.txt"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const selected = Array.from(e.target.files || []);
                      setFiles((prev) => [...prev, ...selected]);
                    }}
                  />
                </label>
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <Badge key={i} variant="outline" className="gap-1">
                    {f.name}
                    <button
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-foreground ml-1"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          onClick={handleSubmit}
          disabled={!url.trim() || loading}
          className="w-full"
        >
          {loading ? "Starting Research..." : "Start Research"}
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Rewrite UploadZone**

Replace `frontend/app/components/home/UploadZone.tsx`. Key changes:
- Replace hand-styled dashed border with Card + dashed variant styling
- Replace link text with Button variant="link"

```tsx
"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadCustomConfig } from "@/app/actions/presets";

export default function UploadZone() {
  const router = useRouter();
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".json")) return;
      const text = await file.text();
      const result = await uploadCustomConfig(text);
      if ("error" in result) return;
      router.push(`/configure/${result.data.configId}`);
    },
    [router]
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      }}
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        dragOver ? "border-primary bg-accent" : "border-border"
      }`}
    >
      <p className="text-muted-foreground mb-2">Drop a JSON config file here</p>
      <label className="inline-block cursor-pointer text-primary hover:underline">
        or browse
        <input
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </label>
      <p className="text-xs text-muted-foreground mt-2">
        Seed document upload — coming soon
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Update home page.tsx**

Replace error banner with `<Alert>`, update section heading styles to use `text-muted-foreground` classes:

```tsx
import Header from "@/app/components/layout/Header";
import PresetGrid from "@/app/components/home/PresetGrid";
import UploadZone from "@/app/components/home/UploadZone";
import ResearchForm from "@/app/components/home/ResearchForm";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { getPresets } from "@/app/actions/presets";

export default async function Home() {
  const result = await getPresets();
  const presets = "data" in result ? result.data : [];
  const error = "error" in result ? result.error : null;

  return (
    <>
      <Header />
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10">
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-2">Crucible</h1>
          <p className="text-muted-foreground">
            Enterprise simulation engine. Pick a preset or upload a config to get started.
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Research Your Company</h2>
          <ResearchForm />
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Presets</h2>
          <PresetGrid presets={presets} />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Custom Config</h2>
          <UploadZone />
        </section>
      </main>
    </>
  );
}
```

- [ ] **Step 5: Verify build**

```bash
cd frontend && pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add frontend/app/page.tsx frontend/app/components/home/
git commit -m "refactor: migrate home page components to shadcn/ui"
```

---

### Task 5: Migrate Simulation Page Components

**Files:**
- Modify: `frontend/app/simulation/[simId]/page.tsx`
- Modify: `frontend/app/components/simulation/PressureStrip.tsx`
- Modify: `frontend/app/components/simulation/ViewToggle.tsx`
- Modify: `frontend/app/components/simulation/WorldTabs.tsx`
- Modify: `frontend/app/components/simulation/SlackWorld.tsx`
- Modify: `frontend/app/components/simulation/EmailWorld.tsx`
- Modify: `frontend/app/components/simulation/TimelineView.tsx`
- Modify: `frontend/app/components/simulation/RoundDivider.tsx`
- Modify: `frontend/app/components/simulation/GraphPanel.tsx`
- Modify: `frontend/app/components/simulation/GraphNodeDetail.tsx`
- Modify: `frontend/app/components/simulation/EventInjectBanner.tsx`
- Create: `frontend/app/components/shared/SplitPanel.tsx`

- [ ] **Step 1: Create SplitPanel shared component**

This reusable component is used by both simulation and research pages.

```tsx
// frontend/app/components/shared/SplitPanel.tsx
"use client";

import { Card } from "@/app/components/ui/card";

export type ViewMode = "split" | "graph" | "focus";

interface SplitPanelProps {
  viewMode: ViewMode;
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  leftHeader?: React.ReactNode;
  rightHeader?: React.ReactNode;
}

export default function SplitPanel({
  viewMode,
  leftPanel,
  rightPanel,
  leftHeader,
  rightHeader,
}: SplitPanelProps) {
  const leftWidth = viewMode === "graph" ? "100%" : viewMode === "split" ? "50%" : "0%";
  const rightWidth = viewMode === "focus" ? "100%" : viewMode === "split" ? "50%" : "0%";

  return (
    <div className="flex-1 flex min-h-0 px-4 pb-4 gap-3">
      <div
        className="min-h-0 transition-all duration-300"
        style={{ width: leftWidth, opacity: viewMode === "focus" ? 0 : 1 }}
      >
        <Card className="h-full overflow-hidden flex flex-col">
          {leftHeader && (
            <div className="px-4 py-2 border-b border-border shrink-0 flex items-center justify-between">
              {leftHeader}
            </div>
          )}
          <div className="flex-1 min-h-0">{leftPanel}</div>
        </Card>
      </div>
      <div
        className="min-h-0 transition-all duration-300"
        style={{ width: rightWidth, opacity: viewMode === "graph" ? 0 : 1 }}
      >
        <Card className="h-full overflow-hidden flex flex-col">
          {rightHeader && (
            <div className="px-4 py-2 border-b border-border shrink-0 flex items-center justify-between">
              {rightHeader}
            </div>
          )}
          <div className="flex-1 min-h-0">{rightPanel}</div>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite PressureStrip with Badge**

Replace the hand-styled severity cards with `Badge` components:

```tsx
import { Badge } from "@/app/components/ui/badge";
import type { ActivePressureState } from "@/app/types";

function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  const s = Math.floor(((hours - h) * 60 - m) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function severityClasses(severity: string) {
  if (severity === "critical")
    return "border-severity-critical-border bg-severity-critical-bg text-severity-critical";
  if (severity === "high")
    return "border-severity-high-border bg-severity-high-bg text-severity-high";
  return "border-severity-normal-border bg-severity-normal-bg text-severity-normal";
}

export default function PressureStrip({ pressures }: { pressures: ActivePressureState[] }) {
  if (pressures.length === 0) return null;

  return (
    <div className="flex gap-2 mb-3">
      {pressures.map((p, i) => (
        <div key={i} className={`flex-1 border rounded-lg px-3 py-2 ${severityClasses(p.severity)}`}>
          <div className="text-[10px] font-semibold uppercase tracking-wide">{p.name}</div>
          <div className="text-lg font-bold font-mono mt-0.5">
            {p.remainingHours != null ? formatHours(p.remainingHours) : ""}
            {p.value != null ? `${p.value}${p.unit || ""}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}
```

Note: PressureStrip keeps its card-like layout since these are pressure meters, not simple badges. The severity classes now reference the new OKLCH tokens.

- [ ] **Step 3: Rewrite ViewToggle with Button group**

```tsx
"use client";

import { Button } from "@/app/components/ui/button";

export type ViewMode = "split" | "graph" | "focus";

interface Props {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}

export default function ViewToggle({ mode, onChange }: Props) {
  return (
    <div className="flex gap-1 rounded-lg border border-border p-0.5">
      {(["graph", "split", "focus"] as const).map((m) => (
        <Button
          key={m}
          variant={mode === m ? "default" : "ghost"}
          size="sm"
          onClick={() => onChange(m)}
          className="h-7 px-3 text-xs capitalize"
        >
          {m}
        </Button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Rewrite WorldTabs with shadcn Tabs**

```tsx
"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import type { AgentAction, ScheduledEvent } from "@/app/types";
import SlackWorld from "./SlackWorld";
import EmailWorld from "./EmailWorld";
import TimelineView from "./TimelineView";

interface Props {
  actions: AgentAction[];
  scheduledEvents: ScheduledEvent[];
}

export default function WorldTabs({ actions, scheduledEvents }: Props) {
  return (
    <Tabs defaultValue="slack" className="flex flex-col h-full">
      <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent px-2">
        <TabsTrigger value="slack">Slack</TabsTrigger>
        <TabsTrigger value="email">Email</TabsTrigger>
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
      </TabsList>
      <TabsContent value="slack" className="flex-1 min-h-0 overflow-y-auto mt-0">
        <SlackWorld actions={actions} scheduledEvents={scheduledEvents} />
      </TabsContent>
      <TabsContent value="email" className="flex-1 min-h-0 overflow-y-auto mt-0">
        <EmailWorld actions={actions} />
      </TabsContent>
      <TabsContent value="timeline" className="flex-1 min-h-0 overflow-y-auto mt-0">
        <TimelineView actions={actions} scheduledEvents={scheduledEvents} />
      </TabsContent>
    </Tabs>
  );
}
```

- [ ] **Step 5: Update simulation page.tsx**

Replace the hand-styled status bar, buttons, badges, and error banner. Replace the inline split-panel layout with `SplitPanel` component. Key changes:
- Import `Button`, `Badge`, `Alert`, `SplitPanel`
- Replace `<button>` stop/report with `<Button variant="destructive" size="sm">` and `<Button size="sm">`
- Replace status pill with `<Badge>`
- Replace error div with `<Alert variant="destructive">`
- Replace inline panel divs with `<SplitPanel viewMode={viewMode} leftPanel={...} rightPanel={...} />`
- Also update the `ViewToggle` import to use the rewritten component (same path, but now it exports `ViewMode` type)

Read the current file, make these replacements. The `ViewMode` type now comes from `@/app/components/shared/SplitPanel` or keep it in `ViewToggle.tsx`. Since both simulation and research pages need it, import from `ViewToggle` as before.

- [ ] **Step 6: Update remaining simulation sub-components**

For each of these files, read the current code, then replace hand-styled classes with shadcn equivalents:
- `SlackWorld.tsx` — wrap message containers in `<Card>`, replace role pills with `<Badge variant="outline">`
- `EmailWorld.tsx` — wrap email containers in `<Card>`, replace role pills with `<Badge variant="outline">`
- `TimelineView.tsx` — wrap timeline entries in `<Card>`, use `<Badge>` for round labels, `<Separator>` between entries
- `RoundDivider.tsx` — replace with `<Separator>` + round label
- `GraphPanel.tsx` — wrap the D3 container in `<Card>` (don't modify D3 internals), replace refresh `<button>` with `<Button variant="ghost" size="sm">`
- `GraphNodeDetail.tsx` — use `<Card>`, `<Badge>`, `<Tooltip>` for details
- `EventInjectBanner.tsx` — replace with `<Alert>`

- [ ] **Step 7: Verify build**

```bash
cd frontend && pnpm build
```

- [ ] **Step 8: Commit**

```bash
git add frontend/app/simulation/ frontend/app/components/simulation/ frontend/app/components/shared/
git commit -m "refactor: migrate simulation page to shadcn/ui components"
```

---

### Task 6: Migrate Research Page Components

**Files:**
- Modify: `frontend/app/research/[projectId]/page.tsx`
- Modify: `frontend/app/components/research/ResearchProgress.tsx`
- Modify: `frontend/app/components/research/DossierEditor.tsx`
- Modify: `frontend/app/components/research/CompanyProfile.tsx`
- Modify: `frontend/app/components/research/ComplianceTags.tsx`
- Modify: `frontend/app/components/research/OrgStructure.tsx`
- Modify: `frontend/app/components/research/RecentEvents.tsx`
- Modify: `frontend/app/components/research/RiskProfile.tsx`
- Modify: `frontend/app/components/research/SystemsList.tsx`

- [ ] **Step 1: Update research page.tsx**

Key changes:
- Replace error banner with `<Alert variant="destructive">`
- Replace "Loading..." text with `<Skeleton>` components
- Replace inline split-panel with `<SplitPanel>` component
- Replace status bar hand-styled elements with `Button`, `Badge`
- Import `ViewMode` from `ViewToggle`

- [ ] **Step 2: Rewrite ResearchProgress with Skeleton**

Replace the loading/progress states. When `progress` is active, show a progress bar with percentage. When error, show `<Alert variant="destructive">`. Replace any "Loading..." text with `<Skeleton>` blocks.

- [ ] **Step 3: Update DossierEditor**

Replace the tab system with shadcn `<Tabs>` (if it uses manual tab state). Replace card containers with `<Card>`. Replace any inputs with `<Input>`.

- [ ] **Step 4: Update dossier sub-components**

For each file, read current code, then:
- `CompanyProfile.tsx` — wrap in `<Card>` with `<CardHeader>` / `<CardContent>`
- `ComplianceTags.tsx` — replace tag pills with `<Badge>`
- `OrgStructure.tsx` — wrap in `<Card>`
- `RecentEvents.tsx` — wrap in `<Card>`, event badges with `<Badge>`
- `RiskProfile.tsx` — wrap in `<Card>`, severity indicators with `<Badge>`
- `SystemsList.tsx` — wrap in `<Card>`

- [ ] **Step 5: Verify build**

```bash
cd frontend && pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add frontend/app/research/ frontend/app/components/research/
git commit -m "refactor: migrate research page to shadcn/ui components"
```

---

### Task 7: Migrate Report Page Components

**Files:**
- Modify: `frontend/app/report/[simId]/page.tsx`
- Modify: `frontend/app/components/report/ReportHeader.tsx`
- Modify: `frontend/app/components/report/ReportTimeline.tsx`
- Modify: `frontend/app/components/report/AgentScorecard.tsx`
- Modify: `frontend/app/components/report/AgentScoreGrid.tsx`
- Modify: `frontend/app/components/report/ExportButton.tsx`

- [ ] **Step 1: Update report page.tsx**

Key changes:
- Replace error banner with `<Alert variant="destructive">`
- Replace "Generating report..." loading state with `<Skeleton>` blocks (heading skeleton + 4 paragraph skeletons)
- Replace "Report generation failed" with `<Alert>` + `<Button>` retry
- Replace section heading styles with consistent `text-lg font-semibold`
- Replace export button wrapper

- [ ] **Step 2: Update report sub-components**

For each file, read current code, then:
- `ReportHeader.tsx` — wrap in `<Card>` with structured header
- `ReportTimeline.tsx` — wrap entries in `<Card>`, use `<Badge>` for round labels, `<Separator>` between entries
- `AgentScorecard.tsx` — wrap in `<Card>`, use `<Badge>` for score ratings
- `AgentScoreGrid.tsx` — grid layout using Card components
- `ExportButton.tsx` — replace with `<Button variant="outline">`

- [ ] **Step 3: Verify build**

```bash
cd frontend && pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/report/ frontend/app/components/report/
git commit -m "refactor: migrate report page to shadcn/ui components"
```

---

### Task 8: Migrate Configure Pages

**Files:**
- Modify: `frontend/app/configure/[presetId]/page.tsx`
- Modify: `frontend/app/configure/project/[projectId]/page.tsx`
- Modify: `frontend/app/components/configure/AgentCards.tsx`
- Modify: `frontend/app/components/configure/PressureCards.tsx`
- Modify: `frontend/app/components/configure/LaunchBar.tsx`
- Modify: `frontend/app/components/configure/EventTimeline.tsx`
- Modify: `frontend/app/components/configure/WorldList.tsx`

- [ ] **Step 1: Update configure preset page**

Key changes:
- Replace error banner with `<Alert variant="destructive">`
- Update section heading styles
- Settings section can use a simple `<Card>` wrapper

- [ ] **Step 2: Update configure project page**

Same pattern as preset page — read current code, apply same replacements.

- [ ] **Step 3: Update configure sub-components**

For each file, read current code, then:
- `AgentCards.tsx` — wrap each agent in `<Card>`, role/skill badges with `<Badge>`
- `PressureCards.tsx` — wrap each pressure in `<Card>`, severity badges with `<Badge>`
- `LaunchBar.tsx` — replace launch `<button>` with `<Button>`, fixed bottom bar styling kept
- `EventTimeline.tsx` — wrap in `<Card>`, use `<Separator>` between events, round badges with `<Badge>`
- `WorldList.tsx` — wrap each world in `<Card>`

- [ ] **Step 4: Verify build**

```bash
cd frontend && pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/app/configure/ frontend/app/components/configure/
git commit -m "refactor: migrate configure pages to shadcn/ui components"
```

---

### Task 9: Add Motion Page Transitions

**Files:**
- Create: `frontend/app/template.tsx`

- [ ] **Step 1: Create template.tsx with fade transition**

Next.js App Router `template.tsx` re-mounts on every navigation (unlike `layout.tsx` which persists). This is the right place for page transitions.

```tsx
"use client";

import { motion } from "motion/react";

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 2: Verify build and transitions**

```bash
cd frontend && pnpm build
```

Expected: Build succeeds. When navigating between pages, content fades in.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/template.tsx
git commit -m "feat: add Motion page fade transitions via template.tsx"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Full build check**

```bash
cd frontend && pnpm build
```

Expected: Build succeeds with no TypeScript errors and no warnings.

- [ ] **Step 2: Visual smoke test**

Start the dev server and visually verify all 5 pages:

```bash
cd frontend && pnpm dev
```

Check:
1. Home page — OKLCH colors, monospace font, Card presets, Input form, Alert errors
2. Research page — Skeleton loading, SplitPanel, DossierEditor with Tabs
3. Simulation page — Badge status, PressureStrip, Tabs world view, Button stop/report
4. Report page — Skeleton generating state, Card sections, Badge scores
5. Configure page — Card agents/pressures, Badge roles, Button launch

- [ ] **Step 3: Commit any fixes**

If any visual issues found, fix and commit:

```bash
git add -A && git commit -m "fix: visual polish from foundation smoke test"
```
