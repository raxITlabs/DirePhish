"use client"

import type { ReactNode } from "react"

export default function BottomBar({
  rightLabel,
  rightAction,
  rightIcon,
}: {
  rightLabel?: string
  rightAction?: () => void
  rightIcon?: ReactNode
}) {
  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 flex items-center px-5 py-2 border-t border-border/15 bg-background/60 backdrop-blur-sm">
      <a href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80 shrink-0">
        <span className="font-mono text-sm font-bold text-primary tracking-tighter">
          DirePhish
        </span>
        <span className="text-[7px] font-mono uppercase tracking-wider text-primary/50 border border-primary/30 rounded px-1 py-px leading-none">
          Alpha
        </span>
        <span className="font-mono text-[8px] tracking-widest text-primary/35 hidden sm:inline">
          by raxIT Labs
        </span>
      </a>

      <span
        className="flex-1 mx-4 font-mono text-[10px] text-muted-foreground/20 select-none overflow-hidden whitespace-nowrap text-center"
        aria-hidden="true"
      >
        {"─ · ".repeat(30)}
      </span>

      {rightAction ? (
        <button
          onClick={rightAction}
          className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground/50 hover:text-foreground transition-colors shrink-0"
          aria-label={rightLabel}
        >
          {rightIcon}
          {rightLabel}
        </button>
      ) : (
        <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground/50 shrink-0">
          {rightIcon ?? <span className="text-primary/50" aria-hidden="true">§</span>}
          {rightLabel}
        </span>
      )}
    </div>
  )
}
