"use client"

import { useEffect, useRef } from "react"
import { buildPalette } from "./palette"
import { brightnessGridToHTML } from "./renderer"
import type { PaletteEntry } from "./types"

const FONT_FAMILY = "Georgia, serif"
const FONT_SIZE = 14
const OVERSAMPLE = 2

// 6 kill chain nodes in an S-curve
const NODES = [
  { x: 0.15, y: 0.12 },  // RECON
  { x: 0.35, y: 0.28 },  // WEAPONIZE
  { x: 0.55, y: 0.48 },  // DELIVER
  { x: 0.72, y: 0.63 },  // EXPLOIT
  { x: 0.82, y: 0.78 },  // C2
  { x: 0.62, y: 0.92 },  // EXFILTRATE
]

// Bezier paths connecting consecutive nodes
// Each has 2 control points for a cubic bezier
function buildPaths() {
  const paths = []
  for (let i = 0; i < NODES.length - 1; i++) {
    const from = NODES[i]!
    const to = NODES[i + 1]!
    const dx = to.x - from.x
    const dy = to.y - from.y
    // Offset control points perpendicular to the direct line
    const perpX = -dy * 0.2
    const perpY = dx * 0.2
    paths.push({
      p0: from,
      p1: { x: from.x + dx * 0.33 + perpX, y: from.y + dy * 0.33 + perpY },
      p2: { x: from.x + dx * 0.66 - perpX, y: from.y + dy * 0.66 - perpY },
      p3: to,
    })
  }
  return paths
}

function bezierPoint(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const mt = 1 - t
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3
}

type PathParticle = {
  pathIndex: number
  t: number
  speed: number
}

export function useKillChainField(
  containerRef: React.RefObject<HTMLElement | null>,
  config: {
    cols?: number
    rows?: number
    particleCount?: number
    decay?: number
  } = {}
) {
  const { cols = 100, rows = 50, particleCount = 30, decay = 0.88 } = config
  const rafRef = useRef<number>(0)
  const paletteRef = useRef<PaletteEntry[] | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Check prefers-reduced-motion
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    let running = true

    document.fonts.ready.then(() => {
      if (!running) return

      // Build palette
      if (!paletteRef.current) {
        paletteRef.current = buildPalette(FONT_FAMILY, FONT_SIZE)
      }
      const palette = paletteRef.current
      const paths = buildPaths()

      // Oversampled field
      const fieldW = cols * OVERSAMPLE
      const fieldH = rows * OVERSAMPLE
      const field = new Float32Array(fieldW * fieldH)

      // Initialize particles
      const particles: PathParticle[] = []
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          pathIndex: i % paths.length,
          t: Math.random(),
          speed: 0.0015 + Math.random() * 0.001,
        })
      }

      let frame = 0

      function splatCircle(
        fx: number,
        fy: number,
        radius: number,
        contribution: number
      ) {
        const ix = Math.floor(fx)
        const iy = Math.floor(fy)
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const px = ((ix + dx) % fieldW + fieldW) % fieldW
            const py = ((iy + dy) % fieldH + fieldH) % fieldH
            const d = Math.sqrt(dx * dx + dy * dy)
            if (d <= radius) {
              const c = contribution * (1 - d / radius)
              field[py * fieldW + px] = Math.min(1, field[py * fieldW + px]! + c)
            }
          }
        }
      }

      function renderStaticFrame() {
        // Just render nodes, no particles
        for (const node of NODES) {
          const nx = node.x * fieldW
          const ny = node.y * fieldH
          splatCircle(nx, ny, 6, 0.3)
        }
        // Also draw faint path outlines
        for (const path of paths) {
          for (let t = 0; t <= 1; t += 0.02) {
            const px = bezierPoint(t, path.p0.x, path.p1.x, path.p2.x, path.p3.x) * fieldW
            const py = bezierPoint(t, path.p0.y, path.p1.y, path.p2.y, path.p3.y) * fieldH
            splatCircle(px, py, 1, 0.08)
          }
        }

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

        const html = brightnessGridToHTML(grid, palette, 0.02)
        if (el) el.innerHTML = html
      }

      if (reducedMotion) {
        renderStaticFrame()
        return
      }

      function render() {
        if (!running) return
        frame++

        // Update particles
        for (const p of particles) {
          p.t += p.speed
          if (p.t >= 1) {
            p.t = 0
            p.pathIndex = Math.floor(Math.random() * paths.length)
          }

          const path = paths[p.pathIndex]!
          const px = bezierPoint(p.t, path.p0.x, path.p1.x, path.p2.x, path.p3.x) * fieldW
          const py = bezierPoint(p.t, path.p0.y, path.p1.y, path.p2.y, path.p3.y) * fieldH

          splatCircle(px, py, 2, 0.35)
        }

        // Splat nodes with breathing pulse
        for (const node of NODES) {
          const nx = node.x * fieldW
          const ny = node.y * fieldH
          const pulse = 0.22 + 0.08 * Math.sin(frame * 0.008)
          splatCircle(nx, ny, 5, pulse)
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

        const html = brightnessGridToHTML(grid, palette, 0.02)
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
