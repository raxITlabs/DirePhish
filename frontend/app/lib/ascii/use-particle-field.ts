"use client"

import { useEffect, useRef } from "react"
import { buildPalette } from "./palette"
import { brightnessGridToHTML } from "./renderer"
import type { Particle, Attractor, PaletteEntry } from "./types"

const FONT_FAMILY = "Georgia, serif"
const FONT_SIZE = 14
const OVERSAMPLE = 2

export function useParticleField(
  containerRef: React.RefObject<HTMLElement | null>,
  config: {
    cols?: number
    rows?: number
    particleCount?: number
    decay?: number
  } = {}
) {
  const { cols = 50, rows = 28, particleCount = 120, decay = 0.82 } = config
  const rafRef = useRef<number>(0)
  const paletteRef = useRef<PaletteEntry[] | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Check prefers-reduced-motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = "[ animation paused — prefers-reduced-motion ]"
      return
    }

    let running = true

    document.fonts.ready.then(() => {
      if (!running) return

      // Build palette
      if (!paletteRef.current) {
        paletteRef.current = buildPalette(FONT_FAMILY, FONT_SIZE)
      }
      const palette = paletteRef.current

      // Field: oversampled brightness accumulator
      const fieldW = cols * OVERSAMPLE
      const fieldH = rows * OVERSAMPLE
      const field = new Float32Array(fieldW * fieldH)

      // Initialize particles
      const particles: Particle[] = []
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * fieldW,
          y: Math.random() * fieldH,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
        })
      }

      // Attractors with sinusoidal orbits
      const attractors: Attractor[] = [
        { x: 0, y: 0, strength: 0.22 },
        { x: 0, y: 0, strength: 0.05 },
      ]

      let frame = 0

      function render() {
        if (!running) return
        frame++
        const t = frame * 0.015

        // Update attractor positions
        attractors[0]!.x = fieldW * (0.5 + 0.3 * Math.sin(t * 0.7))
        attractors[0]!.y = fieldH * (0.5 + 0.3 * Math.cos(t * 0.5))
        attractors[1]!.x = fieldW * (0.5 + 0.25 * Math.cos(t * 1.1))
        attractors[1]!.y = fieldH * (0.5 + 0.25 * Math.sin(t * 0.9))

        // Update particles
        for (const p of particles) {
          // Find nearest attractor
          let nearestDist = Infinity
          let ax = 0,
            ay = 0,
            aStr = 0
          for (const a of attractors) {
            const dx = a.x - p.x
            const dy = a.y - p.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < nearestDist) {
              nearestDist = dist
              ax = dx
              ay = dy
              aStr = a.strength
            }
          }

          // Apply force
          const dist = Math.max(nearestDist, 1)
          p.vx += (ax / dist) * aStr
          p.vy += (ay / dist) * aStr

          // Decay velocity
          p.vx *= 0.97
          p.vy *= 0.97

          // Brownian jitter
          p.vx += (Math.random() - 0.5) * 0.3
          p.vy += (Math.random() - 0.5) * 0.3

          // Move
          p.x += p.vx
          p.y += p.vy

          // Toroidal wrap
          p.x = ((p.x % fieldW) + fieldW) % fieldW
          p.y = ((p.y % fieldH) + fieldH) % fieldH

          // Splat brightness
          const ix = Math.floor(p.x)
          const iy = Math.floor(p.y)
          const radius = 2
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const fx = ((ix + dx) % fieldW + fieldW) % fieldW
              const fy = ((iy + dy) % fieldH + fieldH) % fieldH
              const d = Math.sqrt(dx * dx + dy * dy)
              if (d <= radius) {
                const contribution = 0.4 * (1 - d / radius)
                field[fy * fieldW + fx] = Math.min(
                  1,
                  field[fy * fieldW + fx]! + contribution
                )
              }
            }
          }
        }

        // Also splat attractors (brighter)
        for (const a of attractors) {
          const ix = Math.floor(a.x)
          const iy = Math.floor(a.y)
          const radius = 4
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const fx = ((ix + dx) % fieldW + fieldW) % fieldW
              const fy = ((iy + dy) % fieldH + fieldH) % fieldH
              const d = Math.sqrt(dx * dx + dy * dy)
              if (d <= radius) {
                const contribution = 0.8 * (1 - d / radius)
                field[fy * fieldW + fx] = Math.min(
                  1,
                  field[fy * fieldW + fx]! + contribution
                )
              }
            }
          }
        }

        // Sample field to character grid (downsample from oversampled)
        const grid: number[][] = []
        for (let r = 0; r < rows; r++) {
          const line: number[] = []
          for (let c = 0; c < cols; c++) {
            // Average 2x2 oversample block
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

        // Decay field
        for (let i = 0; i < field.length; i++) {
          field[i]! *= decay
        }

        // Render to HTML and write to DOM
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
