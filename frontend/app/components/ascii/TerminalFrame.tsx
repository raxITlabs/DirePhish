"use client"

import type { ReactNode } from "react"

export default function TerminalFrame({
  title,
  children,
  scanlines = true,
}: {
  title: string
  children: ReactNode
  scanlines?: boolean
}) {
  return (
    <div className="relative rounded-lg overflow-hidden border border-pitch-black-800 bg-pitch-black-950 shadow-lg">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-pitch-black-900 border-b border-pitch-black-800">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-burnt-peach-500" />
          <span className="w-2.5 h-2.5 rounded-full bg-tuscan-sun-500" />
          <span className="w-2.5 h-2.5 rounded-full bg-verdigris-500" />
        </div>
        <span className="text-xs font-mono text-pitch-black-400 tracking-wider ml-2">
          {title}
        </span>
        <span className="ml-auto text-xs font-mono text-pitch-black-600 animate-pulse">
          _
        </span>
      </div>

      {/* Content */}
      <div className="relative p-4 overflow-auto">
        {children}

        {/* Scanline overlay */}
        {scanlines && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)",
            }}
          />
        )}
      </div>
    </div>
  )
}
