"use client"

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react"

// ─────────────────────────────────────────────────────────
// § SECTION HEADER
// ─────────────────────────────────────────────────────────

export function AsciiSectionHeader({
  children,
  sigil = "§",
  as: Tag = "h3",
  className = "",
}: {
  children: ReactNode
  sigil?: string
  as?: "h2" | "h3" | "h4"
  className?: string
}) {
  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-primary font-mono text-xs select-none" aria-hidden="true">
          {sigil}
        </span>
        <Tag className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
          {children}
        </Tag>
      </div>
      <div
        className="font-mono text-muted-foreground/40 text-[10px] leading-none select-none overflow-hidden whitespace-nowrap"
        aria-hidden="true"
      >
        {"·".repeat(80)}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// ● STATUS INDICATORS
// ─────────────────────────────────────────────────────────

const STATUS_MAP = {
  complete: { char: "✓", color: "text-verdigris-600", label: "Complete" },
  running: { char: "●", color: "text-primary", label: "Running" },
  failed: { char: "✗", color: "text-destructive", label: "Failed" },
  pending: { char: "○", color: "text-muted-foreground", label: "Pending" },
} as const

type StatusType = keyof typeof STATUS_MAP

const SPIN_CHARS = ["·", ":", ";", "=", "+", "#", "%", "@"] as const

export function AsciiStatus({
  status,
  label,
  showLabel = true,
}: {
  status: StatusType
  label?: string
  showLabel?: boolean
}) {
  const config = STATUS_MAP[status]
  const [spinIdx, setSpinIdx] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    if (status !== "running") return
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReducedMotion(mq.matches)
    if (mq.matches) return

    const id = setInterval(() => setSpinIdx((i) => (i + 1) % SPIN_CHARS.length), 180)
    return () => clearInterval(id)
  }, [status])

  const displayChar =
    status === "running"
      ? reducedMotion
        ? "●"
        : SPIN_CHARS[spinIdx]
      : config.char

  const displayLabel = label ?? config.label
  const srText = `${displayLabel}: ${config.label}`

  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-xs"
      role="status"
      aria-label={srText}
    >
      <span
        className={`${config.color} ${status === "running" && !reducedMotion ? "animate-pulse-dot" : ""}`}
        aria-hidden="true"
      >
        {displayChar}
      </span>
      {showLabel && (
        <span className="text-foreground">{displayLabel}</span>
      )}
    </span>
  )
}

// ─────────────────────────────────────────────────────────
// » METRIC LABEL
// ─────────────────────────────────────────────────────────

export function AsciiMetric({
  label,
  value,
  sigil = "»",
  valueColor = "text-foreground",
}: {
  label: string
  value: string
  sigil?: string
  valueColor?: string
}) {
  return (
    <div className="font-mono text-xs flex items-baseline gap-1">
      <span className="text-primary select-none" aria-hidden="true">
        {sigil}
      </span>
      <span className="text-muted-foreground whitespace-nowrap">{label}</span>
      <span
        className="text-muted-foreground/30 select-none flex-1 overflow-hidden whitespace-nowrap leading-none"
        aria-hidden="true"
        style={{ letterSpacing: "2px" }}
      >
        {"·".repeat(60)}
      </span>
      <span className={`font-semibold tabular-nums whitespace-nowrap ${valueColor}`}>
        {value}
      </span>
      {/* Screen reader gets a clean reading */}
      <span className="sr-only">{label}: {value}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// █ PROGRESS BAR
// ─────────────────────────────────────────────────────────

export function AsciiProgressBar({
  value,
  max = 100,
  width = 20,
  showPercent = true,
  color = "text-primary",
  label,
}: {
  value: number
  max?: number
  width?: number
  showPercent?: boolean
  color?: string
  label?: string
}) {
  const pct = Math.min(1, Math.max(0, value / max))
  const filled = Math.round(pct * width)
  const half = pct * width - filled > 0.3 ? 1 : 0
  const empty = width - filled - half

  const bar =
    "█".repeat(filled) +
    (half ? "▓" : "") +
    "▒".repeat(Math.min(1, empty)) +
    "░".repeat(Math.max(0, empty - 1))

  const pctValue = Math.round(pct * 100)

  return (
    <span
      className="font-mono text-xs inline-flex items-baseline gap-2"
      role="progressbar"
      aria-valuenow={pctValue}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? `${pctValue}% complete`}
    >
      <span className={color} aria-hidden="true">{bar}</span>
      {showPercent && (
        <span className="text-muted-foreground tabular-nums min-w-[3ch] text-right">
          {pctValue}%
        </span>
      )}
    </span>
  )
}

// ─────────────────────────────────────────────────────────
// ┌ CARD CORNERS
// ─────────────────────────────────────────────────────────

const cornerClass = "absolute font-mono text-[10px] text-muted-foreground/30 select-none leading-none"

export function AsciiCard({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`relative p-0.5 ${className}`}>
      <span className={`${cornerClass} -top-1 -left-0.5`} aria-hidden="true">┌</span>
      <span className={`${cornerClass} -top-1 -right-0.5`} aria-hidden="true">┐</span>
      <span className={`${cornerClass} -bottom-1 -left-0.5`} aria-hidden="true">└</span>
      <span className={`${cornerClass} -bottom-1 -right-0.5`} aria-hidden="true">┘</span>
      <div className="bg-card border border-border/20 rounded-lg px-4 py-3">
        {children}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// ─ DIVIDERS
// ─────────────────────────────────────────────────────────

export function AsciiDivider({
  variant = "dots",
  label,
}: {
  variant?: "solid" | "dots" | "dashed" | "labeled"
  label?: string
}) {
  const patterns = {
    solid: "─".repeat(80),
    dots: "─ · ".repeat(20),
    dashed: "╌ ".repeat(40),
    labeled: "",
  }

  if (variant === "labeled" && label) {
    return (
      <div
        className="font-mono text-[10px] text-muted-foreground/40 select-none overflow-hidden whitespace-nowrap text-center py-1"
        role="separator"
        aria-label={label}
      >
        {"────────────── "}
        <span className="text-primary/70">{label}</span>
        {" ──────────────"}
      </div>
    )
  }

  return (
    <div
      className="font-mono text-[10px] text-muted-foreground/40 select-none overflow-hidden whitespace-nowrap py-1"
      role="separator"
      aria-hidden="true"
    >
      {patterns[variant]}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// ╌ LOADING SKELETON
// ─────────────────────────────────────────────────────────

export function AsciiSkeleton({
  lines = 3,
  widths = [100, 85, 60],
  label = "Loading content\u2026",
}: {
  lines?: number
  widths?: number[]
  label?: string
}) {
  return (
    <div className="space-y-1.5 animate-pulse" role="status" aria-label={label}>
      {Array.from({ length: lines }).map((_, i) => {
        const w = widths[i % widths.length] ?? 80
        const charCount = Math.floor(w * 0.5)
        return (
          <div
            key={i}
            className="font-mono text-xs text-muted-foreground/20 select-none overflow-hidden whitespace-nowrap"
            style={{ width: `${w}%` }}
            aria-hidden="true"
          >
            {"╌".repeat(charCount)}
          </div>
        )
      })}
      <span className="sr-only">{label}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// ├ TREE HIERARCHY
// ─────────────────────────────────────────────────────────

type TreeNode = {
  label: string
  status?: StatusType
  children?: TreeNode[]
}

export function AsciiTree({
  nodes,
  ariaLabel = "Tree hierarchy",
}: {
  nodes: TreeNode[]
  ariaLabel?: string
}) {
  function renderNode(node: TreeNode, prefix: string, isLast: boolean): ReactNode {
    const connector = isLast ? "└─" : "├─"
    const childPrefix = prefix + (isLast ? "   " : "│  ")

    return (
      <li key={node.label} role="treeitem" aria-expanded={node.children ? true : undefined}>
        <div className="font-mono text-xs flex items-center gap-1 py-px">
          <span className="text-muted-foreground/50 select-none whitespace-pre" aria-hidden="true">
            {prefix}{connector}
          </span>
          <span className="text-foreground">{node.label}</span>
          {node.status && (
            <span className="ml-1">
              <AsciiStatus status={node.status} showLabel={false} />
            </span>
          )}
        </div>
        {node.children && node.children.length > 0 && (
          <ul role="group">
            {node.children.map((child, i) =>
              renderNode(child, childPrefix, i === node.children!.length - 1)
            )}
          </ul>
        )}
      </li>
    )
  }

  return (
    <ul role="tree" aria-label={ariaLabel}>
      {nodes.map((node, i) => renderNode(node, "", i === nodes.length - 1))}
    </ul>
  )
}

// ─────────────────────────────────────────────────────────
// ▼ ACCORDION
// ─────────────────────────────────────────────────────────

export function AsciiAccordion({
  title,
  children,
  defaultOpen = false,
  count,
}: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  count?: number
}) {
  const [open, setOpen] = useState(defaultOpen)
  const contentRef = useRef<HTMLDivElement>(null)

  return (
    <div className="border border-border/20 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 font-mono text-xs text-foreground hover:bg-muted/30 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none rounded-t-lg"
        aria-expanded={open}
      >
        <span className="text-primary select-none" aria-hidden="true">
          {open ? "▼" : "▶"}
        </span>
        <span className="font-semibold uppercase tracking-wider">{title}</span>
        {count !== undefined && (
          <span className="text-muted-foreground ml-auto tabular-nums">[{count}]</span>
        )}
      </button>
      {open && (
        <div ref={contentRef} className="px-3 pb-3 border-t border-border/10">
          {children}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// [ ] BADGE
// ─────────────────────────────────────────────────────────

const BADGE_VARIANTS = {
  default: "text-primary",
  secondary: "text-secondary",
  destructive: "text-destructive",
  success: "text-verdigris-600",
  muted: "text-muted-foreground",
} as const

type BadgeVariant = keyof typeof BADGE_VARIANTS

export function AsciiBadge({
  children,
  variant = "default",
  bracket = "square",
}: {
  children: ReactNode
  variant?: BadgeVariant
  bracket?: "square" | "angle" | "paren" | "none"
}) {
  const color = BADGE_VARIANTS[variant]
  const [open, close] = {
    square: ["[", "]"],
    angle: ["<", ">"],
    paren: ["(", ")"],
    none: ["", ""],
  }[bracket]

  return (
    <span className={`font-mono text-xs inline-flex items-baseline ${color}`}>
      <span className="text-muted-foreground/50 select-none" aria-hidden="true">{open}</span>
      <span className="px-0.5">{children}</span>
      <span className="text-muted-foreground/50 select-none" aria-hidden="true">{close}</span>
    </span>
  )
}

// ─────────────────────────────────────────────────────────
// │ TIMELINE
// ─────────────────────────────────────────────────────────

type TimelineEvent = {
  time?: string
  label: string
  description?: string
  status?: StatusType
}

export function AsciiTimeline({
  events,
  ariaLabel = "Timeline",
}: {
  events: TimelineEvent[]
  ariaLabel?: string
}) {
  return (
    <ol className="space-y-0" role="list" aria-label={ariaLabel}>
      {events.map((event, i) => {
        const isLast = i === events.length - 1
        return (
          <li key={i} className="flex gap-2 font-mono text-xs">
            {/* Timeline rail */}
            <div className="flex flex-col items-center select-none" aria-hidden="true">
              <span className={`${event.status ? STATUS_MAP[event.status].color : "text-primary"}`}>
                {event.status ? STATUS_MAP[event.status].char : "●"}
              </span>
              {!isLast && (
                <span className="text-muted-foreground/30 leading-none">{"│\n".repeat(2)}│</span>
              )}
            </div>
            {/* Content */}
            <div className="pb-3 min-w-0">
              <div className="flex items-baseline gap-2">
                {event.time && (
                  <span className="text-muted-foreground tabular-nums whitespace-nowrap">{event.time}</span>
                )}
                <span className="text-foreground font-medium">{event.label}</span>
              </div>
              {event.description && (
                <p className="text-muted-foreground mt-0.5 leading-relaxed">{event.description}</p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ─────────────────────────────────────────────────────────
// ┌» METRIC CARD
// ─────────────────────────────────────────────────────────

export function AsciiMetricCard({
  label,
  value,
  sublabel,
  icon,
  valueColor = "text-foreground",
}: {
  label: string
  value: string
  sublabel?: string
  icon?: string
  valueColor?: string
}) {
  return (
    <AsciiCard>
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
          {icon && <span aria-hidden="true">{icon}</span>}
          <span>{label}</span>
        </div>
        <div className={`font-mono text-xl font-bold tabular-nums ${valueColor}`}>
          {value}
        </div>
        {sublabel && (
          <div className="font-mono text-[10px] text-muted-foreground">{sublabel}</div>
        )}
      </div>
    </AsciiCard>
  )
}

// ─────────────────────────────────────────────────────────
// ┌─┬─┐ TABLE
// ─────────────────────────────────────────────────────────

type TableColumn = {
  key: string
  header: string
  align?: "left" | "right" | "center"
}

type TableRow = Record<string, string | number | ReactNode>

export function AsciiTable({
  columns,
  rows,
  ariaLabel = "Data table",
}: {
  columns: TableColumn[]
  rows: TableRow[]
  ariaLabel?: string
}) {
  return (
    <div className="overflow-x-auto" role="table" aria-label={ariaLabel}>
      <div className="font-mono text-xs min-w-fit">
        {/* Header */}
        <div className="flex border-b border-muted-foreground/20 pb-1 mb-1" role="row">
          {columns.map((col) => (
            <div
              key={col.key}
              className={`flex-1 px-2 font-semibold text-foreground uppercase tracking-wider text-[10px] ${
                col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
              }`}
              role="columnheader"
            >
              {col.header}
            </div>
          ))}
        </div>
        {/* Rows */}
        {rows.map((row, ri) => (
          <div
            key={ri}
            className="flex border-b border-muted-foreground/10 py-1 hover:bg-muted/20 transition-colors"
            role="row"
          >
            {columns.map((col) => (
              <div
                key={col.key}
                className={`flex-1 px-2 text-foreground ${
                  col.align === "right" ? "text-right tabular-nums" : col.align === "center" ? "text-center" : "text-left"
                }`}
                role="cell"
              >
                {row[col.key] ?? "—"}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// ⚠ ALERT
// ─────────────────────────────────────────────────────────

const ALERT_VARIANTS = {
  info: { sigil: "ℹ", color: "text-primary", border: "border-l-primary" },
  warning: { sigil: "⚠", color: "text-tuscan-sun-600", border: "border-l-tuscan-sun-500" },
  error: { sigil: "✗", color: "text-destructive", border: "border-l-destructive" },
  success: { sigil: "✓", color: "text-verdigris-600", border: "border-l-verdigris-500" },
} as const

type AlertVariant = keyof typeof ALERT_VARIANTS

export function AsciiAlert({
  variant = "info",
  title,
  children,
}: {
  variant?: AlertVariant
  title?: string
  children: ReactNode
}) {
  const config = ALERT_VARIANTS[variant]

  return (
    <div
      className={`border border-border/20 ${config.border} border-l-2 rounded-lg px-3 py-2 font-mono text-xs`}
      role="alert"
    >
      <div className="flex items-start gap-2">
        <span className={`${config.color} select-none mt-px`} aria-hidden="true">
          {config.sigil}
        </span>
        <div className="min-w-0">
          {title && (
            <div className="font-semibold text-foreground mb-0.5">{title}</div>
          )}
          <div className="text-foreground leading-relaxed">{children}</div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// [ | ] TAB BAR
// ─────────────────────────────────────────────────────────

export function AsciiTabBar({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: { key: string; label: string }[]
  activeTab: string
  onTabChange: (key: string) => void
}) {
  return (
    <div className="font-mono text-xs flex items-center overflow-x-auto" role="tablist">
      {tabs.map((tab, i) => {
        const isActive = tab.key === activeTab
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.key)}
            className={`px-3 py-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
              isActive
                ? "text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground"
            } ${i > 0 ? "border-l border-muted-foreground/20" : ""}`}
          >
            {isActive && <span className="mr-1 select-none" aria-hidden="true">▸</span>}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// ┌ ─ ┐ EMPTY STATE
// ─────────────────────────────────────────────────────────

export function AsciiEmptyState({
  title,
  description,
  sigil = "○",
  action,
}: {
  title: string
  description?: string
  sigil?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <span className="text-muted-foreground/30 font-mono text-2xl mb-3 select-none" aria-hidden="true">
        {sigil}
      </span>
      <p className="font-mono text-sm text-foreground">{title}</p>
      {description && (
        <p className="font-mono text-xs text-muted-foreground mt-1">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
