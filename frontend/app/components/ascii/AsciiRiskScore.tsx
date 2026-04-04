"use client"

import { useState, useEffect, useRef } from "react"
import { textToBrightnessGrid } from "@/app/lib/ascii/renderer"

const MONO_RAMP = " .`-_:,;^=+/|)\\!?0oOQ#%@"

function getScoreColor(score: number): string {
  if (score <= 33) return "text-verdigris-400"
  if (score <= 66) return "text-tuscan-sun-400"
  return "text-burnt-peach-400"
}

function getScoreGlow(score: number): string {
  if (score <= 33)
    return "0 0 4px oklch(79.86% 0.108 184.77 / 0.6), 0 0 12px oklch(75.68% 0.122 183.49 / 0.3)"
  if (score <= 66)
    return "0 0 4px oklch(80.64% 0.133 87.58 / 0.6), 0 0 12px oklch(76.18% 0.149 83.92 / 0.3)"
  return "0 0 4px oklch(67.03% 0.162 35.12 / 0.6), 0 0 12px oklch(60.91% 0.198 34.41 / 0.3)"
}

function renderScore(score: number, cols: number, rows: number): string {
  const text = String(score)
  const grid = textToBrightnessGrid(text, "Georgia, serif", 240, cols, rows)
  const lines: string[] = []
  for (const row of grid) {
    let line = ""
    for (const b of row) {
      if (b < 0.03) {
        line += " "
        continue
      }
      const idx = Math.min(MONO_RAMP.length - 1, Math.floor(b * MONO_RAMP.length))
      const char = MONO_RAMP[idx]!
      const escaped =
        char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : char === '"' ? "&quot;" : char
      const wClass = b > 0.6 ? "ascii-w8" : b > 0.3 ? "ascii-w5" : "ascii-w3"
      const opLevel = Math.max(1, Math.min(10, Math.ceil(b * 10)))
      line += `<span class="${wClass} ascii-a${opLevel}">${escaped}</span>`
    }
    lines.push(line)
  }
  return lines.join("\n")
}

export default function AsciiRiskScore({
  cols = 45,
  rows = 16,
}: {
  cols?: number
  rows?: number
}) {
  const [score, setScore] = useState(72)
  const [html, setHtml] = useState("")
  const [ready, setReady] = useState(false)
  const initRef = useRef(false)

  useEffect(() => {
    const doRender = () => {
      const result = renderScore(score, cols, rows)
      setHtml(result)
      setReady(true)
    }

    if (!initRef.current) {
      initRef.current = true
      document.fonts.ready.then(doRender)
    } else {
      doRender()
    }
  }, [score, cols, rows])

  const colorClass = getScoreColor(score)
  const glowStyle = getScoreGlow(score)

  return (
    <div className="space-y-4">
      {ready ? (
        <pre
          className={`${colorClass} leading-none select-none transition-colors duration-300`}
          style={{
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            fontSize: "12px",
            lineHeight: "13px",
            letterSpacing: "1px",
            textShadow: glowStyle,
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <div
          className="font-mono text-sm text-pitch-black-500 animate-pulse"
          style={{ minHeight: `${rows * 13}px` }}
        >
          Loading\u2026
        </div>
      )}

      <div className="flex items-center gap-4">
        <label className="text-xs font-mono text-pitch-black-400">Risk Score</label>
        <input
          type="range"
          min={0}
          max={100}
          value={score}
          onChange={(e) => setScore(Number(e.target.value))}
          className="flex-1 accent-tuscan-sun-500"
        />
        <span
          className={`text-sm font-mono font-bold ${colorClass} tabular-nums min-w-[3ch] text-right`}
        >
          {score}
        </span>
      </div>

      <div className="flex gap-4 text-xs font-mono">
        <span className="text-verdigris-400">0-33 Low</span>
        <span className="text-tuscan-sun-400">34-66 Medium</span>
        <span className="text-burnt-peach-400">67-100 Critical</span>
      </div>
    </div>
  )
}
