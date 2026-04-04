"use client"

import { useState, useEffect, useRef } from "react"
import { textToBrightnessGrid } from "@/app/lib/ascii/renderer"

const MONO_RAMP = " .`-_:,;^=+/|)\\!?0oOQ#%@"

export default function AsciiWatermark({
  text = "DP",
  cols = 22,
  rows = 8,
  opacity = 0.04,
}: {
  text?: string
  cols?: number
  rows?: number
  opacity?: number
}) {
  const [ascii, setAscii] = useState("")
  const initRef = useRef(false)

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    document.fonts.ready.then(() => {
      const grid = textToBrightnessGrid(text, "Georgia, serif", 120, cols, rows)
      const lines: string[] = []

      for (const row of grid) {
        let line = ""
        for (const b of row) {
          if (b < 0.03) {
            line += " "
            continue
          }
          const idx = Math.min(MONO_RAMP.length - 1, Math.floor(b * MONO_RAMP.length))
          line += MONO_RAMP[idx]!
        }
        lines.push(line)
      }

      setAscii(lines.join("\n"))
    })
  }, [text, cols, rows])

  if (!ascii) return null

  return (
    <pre
      className="select-none text-center leading-none text-sidebar-foreground"
      style={{
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        fontSize: "10px",
        lineHeight: "11px",
        letterSpacing: "1px",
        opacity,
      }}
      aria-hidden="true"
      role="presentation"
    >
      {ascii}
    </pre>
  )
}
