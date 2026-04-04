"use client"

import { useEffect, useRef } from "react"
import { buildPalette } from "./palette"
import { brightnessGridToHTML, textToBrightnessGrid } from "./renderer"
import type { PaletteEntry } from "./types"

const FONT_FAMILY = "Georgia, serif"
const FONT_SIZE = 14
const OVERSAMPLE = 2

const FRAGMENTS = [
  "URGENT: Verify your account",
  "Password expires in 24h",
  "Action required: unusual login",
  "Suspicious activity detected",
  "Account security alert",
  "Invoice #38291 attached",
  "Wire transfer confirmation",
  "CEO has shared a document",
  "IT Dept: System maintenance",
  "secure-login.company-auth.ru",
  "portal.acme-verify.net/login",
  "Dear valued customer",
  "Click here to confirm",
  "Do not share this link",
  "Time-sensitive request",
  "RE: Pending verification",
  "Your account has been locked",
  "Security token expired",
  "Final notice: action needed",
  "Password reset requested",
  "Shared doc: Q4_Financials",
]

type RainDrop = {
  col: number      // which column (0 to numCols-1)
  y: number        // current y position in field coordinates
  speed: number    // pixels per frame
  fragIndex: number
  brightness: number
  length: number   // how many rows the text occupies
}

export function useEmailRainField(
  containerRef: React.RefObject<HTMLElement | null>,
  config: {
    cols?: number
    rows?: number
    dropCount?: number
    decay?: number
  } = {}
) {
  const { cols = 50, rows = 28, dropCount = 40, decay = 0.82 } = config
  const rafRef = useRef<number>(0)
  const paletteRef = useRef<PaletteEntry[] | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = "[ animation paused — prefers-reduced-motion ]"
      return
    }

    let running = true

    document.fonts.ready.then(() => {
      if (!running) return

      if (!paletteRef.current) {
        paletteRef.current = buildPalette(FONT_FAMILY, FONT_SIZE)
      }
      const palette = paletteRef.current

      const fieldW = cols * OVERSAMPLE
      const fieldH = rows * OVERSAMPLE
      const field = new Float32Array(fieldW * fieldH)

      // Pre-render each fragment as a small brightness grid
      const fragGrids: number[][][] = FRAGMENTS.map((text) => {
        const fragCols = Math.min(cols, Math.ceil(text.length * 1.2))
        const fragRows = 2
        return textToBrightnessGrid(text, "Georgia, serif", 24, fragCols, fragRows)
      })

      // Number of text columns (streams)
      const numStreams = Math.ceil(cols / 12)

      // Initialize drops
      const drops: RainDrop[] = []
      for (let i = 0; i < dropCount; i++) {
        const fragIdx = Math.floor(Math.random() * FRAGMENTS.length)
        drops.push({
          col: Math.floor(Math.random() * numStreams),
          y: -(Math.random() * fieldH * 2), // start above the field
          speed: 0.2 + Math.random() * 0.5,
          fragIndex: fragIdx,
          brightness: 0.3 + Math.random() * 0.7,
          length: fragGrids[fragIdx]![0]?.length ?? 10,
        })
      }

      function render() {
        if (!running) return

        // Move drops downward and splat their text brightness
        for (const drop of drops) {
          drop.y += drop.speed

          // Reset when off bottom
          if (drop.y > fieldH + 10) {
            drop.y = -(Math.random() * fieldH)
            drop.fragIndex = Math.floor(Math.random() * FRAGMENTS.length)
            drop.col = Math.floor(Math.random() * numStreams)
            drop.brightness = 0.3 + Math.random() * 0.7
            drop.length = fragGrids[drop.fragIndex]![0]?.length ?? 10
          }

          // Splat the fragment's brightness pattern into the field
          const fragGrid = fragGrids[drop.fragIndex]!
          const startX = Math.floor((drop.col / numStreams) * fieldW)
          const startY = Math.floor(drop.y)

          for (let fr = 0; fr < fragGrid.length; fr++) {
            const row = fragGrid[fr]!
            for (let fc = 0; fc < row.length; fc++) {
              const b = row[fc]!
              if (b < 0.05) continue

              const fx = startX + fc
              const fy = startY + fr
              if (fy < 0 || fy >= fieldH || fx < 0 || fx >= fieldW) continue

              const contribution = b * drop.brightness * 0.6
              field[fy * fieldW + fx] = Math.min(
                1,
                field[fy * fieldW + fx]! + contribution
              )
            }
          }

          // Add a bright "head" at the leading edge
          const headY = Math.floor(drop.y)
          const headX = startX + Math.floor(drop.length / 2)
          if (headY >= 0 && headY < fieldH && headX >= 0 && headX < fieldW) {
            const radius = 2
            for (let dy = -radius; dy <= radius; dy++) {
              for (let dx = -radius; dx <= radius; dx++) {
                const px = headX + dx
                const py = headY + dy
                if (px < 0 || px >= fieldW || py < 0 || py >= fieldH) continue
                const d = Math.sqrt(dx * dx + dy * dy)
                if (d <= radius) {
                  field[py * fieldW + px] = Math.min(
                    1,
                    field[py * fieldW + px]! + 0.5 * (1 - d / radius)
                  )
                }
              }
            }
          }
        }

        // Downsample
        const grid: number[][] = []
        for (let r = 0; r < rows; r++) {
          const line: number[] = []
          for (let c = 0; c < cols; c++) {
            let sum = 0
            for (let sy = 0; sy < OVERSAMPLE; sy++) {
              for (let sx = 0; sx < OVERSAMPLE; sx++) {
                sum += field[(r * OVERSAMPLE + sy) * fieldW + (c * OVERSAMPLE + sx)]!
              }
            }
            line.push(sum / (OVERSAMPLE * OVERSAMPLE))
          }
          grid.push(line)
        }

        // Decay
        for (let i = 0; i < field.length; i++) {
          field[i]! *= decay
        }

        const html = brightnessGridToHTML(grid, palette, 0.03)
        if (el) el.innerHTML = html

        rafRef.current = requestAnimationFrame(render)
      }

      rafRef.current = requestAnimationFrame(render)
    })

    return () => {
      running = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [containerRef, cols, rows, dropCount, decay])
}
