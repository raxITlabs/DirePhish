"use client"

import { useEffect, useRef } from "react"
import { buildPalette } from "./palette"
import { brightnessGridToHTML } from "./renderer"
import type { PaletteEntry } from "./types"

const FONT_FAMILY = "Georgia, serif"
const FONT_SIZE = 14
const OVERSAMPLE = 2

// Bezier path defining the hook shape (normalized 0-1 coordinates)
// Points along: line → shaft → J-curve → barb
function sampleHookPath(count: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = []

  // Helper for cubic bezier
  function bez(t: number, p0: number, p1: number, p2: number, p3: number) {
    const mt = 1 - t
    return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3
  }

  const segments = [
    // Fishing line (top)
    { type: "line" as const, x0: 0.72, y0: 0.0, x1: 0.72, y1: 0.10 },
    // Shaft
    { type: "line" as const, x0: 0.72, y0: 0.10, x1: 0.72, y1: 0.42 },
    // J-curve
    {
      type: "bezier" as const,
      x0: 0.72, y0: 0.42,
      cx1: 0.72, cy1: 0.62,
      cx2: 0.62, cy2: 0.78,
      x3: 0.40, y3: 0.78,
    },
    // Barb rise
    {
      type: "bezier" as const,
      x0: 0.40, y0: 0.78,
      cx1: 0.25, cy1: 0.78,
      cx2: 0.22, cy2: 0.65,
      x3: 0.30, y3: 0.52,
    },
    // Barb notch
    {
      type: "bezier" as const,
      x0: 0.30, y0: 0.52,
      cx1: 0.27, cy1: 0.56,
      cx2: 0.24, cy2: 0.58,
      x3: 0.22, y3: 0.62,
    },
  ]

  const perSegment = Math.ceil(count / segments.length)
  for (const seg of segments) {
    for (let i = 0; i < perSegment; i++) {
      const t = i / perSegment
      if (seg.type === "line") {
        points.push({
          x: seg.x0 + (seg.x1 - seg.x0) * t,
          y: seg.y0 + (seg.y1 - seg.y0) * t,
        })
      } else {
        points.push({
          x: bez(t, seg.x0, seg.cx1, seg.cx2, seg.x3),
          y: bez(t, seg.y0, seg.cy1, seg.cy2, seg.y3),
        })
      }
    }
  }
  return points
}

type HookParticle = {
  pathIndex: number // index into hookPath
  speed: number
  brightness: number
}

export function useHookField(
  containerRef: React.RefObject<HTMLElement | null>,
  config: {
    cols?: number
    rows?: number
    particleCount?: number
    decay?: number
  } = {}
) {
  const { cols = 50, rows = 28, particleCount = 80, decay = 0.85 } = config
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

      // Sample the hook path
      const hookPath = sampleHookPath(200)

      // Initialize particles distributed along the path
      const particles: HookParticle[] = []
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          pathIndex: Math.floor(Math.random() * hookPath.length),
          speed: 0.3 + Math.random() * 0.7,
          brightness: 0.3 + Math.random() * 0.5,
        })
      }

      // Also create a faint static "skeleton" of the hook shape
      function splatHookSkeleton() {
        for (const pt of hookPath) {
          const fx = pt.x * fieldW
          const fy = pt.y * fieldH
          const ix = Math.floor(fx)
          const iy = Math.floor(fy)
          const radius = 1
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const px = ((ix + dx) % fieldW + fieldW) % fieldW
              const py = ((iy + dy) % fieldH + fieldH) % fieldH
              const d = Math.sqrt(dx * dx + dy * dy)
              if (d <= radius) {
                field[py * fieldW + px] = Math.min(
                  1,
                  field[py * fieldW + px]! + 0.04 * (1 - d / radius)
                )
              }
            }
          }
        }
      }

      let frame = 0

      function render() {
        if (!running) return
        frame++

        // Faint hook skeleton every frame (persistent shape)
        splatHookSkeleton()

        // Move particles along the hook path
        for (const p of particles) {
          p.pathIndex = (p.pathIndex + p.speed) % hookPath.length
          const idx = Math.floor(p.pathIndex)
          const pt = hookPath[idx]!

          // Splat brightness at particle position
          const fx = pt.x * fieldW
          const fy = pt.y * fieldH
          const ix = Math.floor(fx)
          const iy = Math.floor(fy)
          const radius = 3
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const px = ((ix + dx) % fieldW + fieldW) % fieldW
              const py = ((iy + dy) % fieldH + fieldH) % fieldH
              const d = Math.sqrt(dx * dx + dy * dy)
              if (d <= radius) {
                const contribution = p.brightness * (1 - d / radius)
                field[py * fieldW + px] = Math.min(
                  1,
                  field[py * fieldW + px]! + contribution
                )
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
  }, [containerRef, cols, rows, particleCount, decay])
}
