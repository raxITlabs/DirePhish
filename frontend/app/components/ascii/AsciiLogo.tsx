"use client"

import { useState, useEffect, useRef } from "react"
import { textToBrightnessGrid } from "@/app/lib/ascii/renderer"

// Monospace brightness ramp — from darkest to brightest
const MONO_RAMP = " .`-_:,;^=+/|)\\!?0oOQ#%@"

export default function AsciiLogo({
  text = "DIREPHISH",
  cols = 80,
  rows = 14,
}: {
  text?: string
  cols?: number
  rows?: number
}) {
  const [html, setHtml] = useState("")
  const [ready, setReady] = useState(false)
  const initRef = useRef(false)

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    document.fonts.ready.then(() => {
      // Use a large bold font for the source text
      const grid = textToBrightnessGrid(text, "Georgia, serif", 180, cols, rows)

      // Map to monospace characters with weight classes for extra visual depth
      const lines: string[] = []
      for (const row of grid) {
        let line = ""
        for (const b of row) {
          if (b < 0.03) {
            line += " "
            continue
          }
          // Pick character from ramp
          const idx = Math.min(MONO_RAMP.length - 1, Math.floor(b * MONO_RAMP.length))
          const char = MONO_RAMP[idx]!
          const escaped = char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : char === '"' ? "&quot;" : char
          // Weight class based on brightness
          const wClass = b > 0.6 ? "ascii-w8" : b > 0.3 ? "ascii-w5" : "ascii-w3"
          const opLevel = Math.max(1, Math.min(10, Math.ceil(b * 10)))
          line += `<span class="${wClass} ascii-a${opLevel}">${escaped}</span>`
        }
        lines.push(line)
      }

      setHtml(lines.join("\n"))
      setReady(true)
    })
  }, [text, cols, rows])

  if (!ready) {
    return (
      <div
        className="font-mono text-sm text-tuscan-sun-700 animate-pulse"
        style={{ minHeight: `${rows * 1.1}em` }}
      >
        Initializing\u2026
      </div>
    )
  }

  return (
    <pre
      className="text-tuscan-sun-400 phosphor-glow leading-none select-none overflow-x-auto"
      style={{
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        fontSize: "12px",
        lineHeight: "13px",
        letterSpacing: "1px",
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
