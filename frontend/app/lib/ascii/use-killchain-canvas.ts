"use client"

import { useEffect, useRef } from "react"

const NODES = [
  { x: 0.15, y: 0.12 },
  { x: 0.35, y: 0.28 },
  { x: 0.55, y: 0.48 },
  { x: 0.72, y: 0.63 },
  { x: 0.82, y: 0.78 },
  { x: 0.62, y: 0.92 },
]

function bez(t: number, p0: number, p1: number, p2: number, p3: number) {
  const mt = 1 - t
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3
}

function buildPaths() {
  return NODES.slice(0, -1).map((from, i) => {
    const to = NODES[i + 1]!
    const dx = to.x - from.x, dy = to.y - from.y
    const px = -dy * 0.2, py = dx * 0.2
    return {
      p0: from, p3: to,
      p1: { x: from.x + dx * 0.33 + px, y: from.y + dy * 0.33 + py },
      p2: { x: from.x + dx * 0.66 - px, y: from.y + dy * 0.66 - py },
    }
  })
}

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*+=-~:;.,"
const WEIGHTS = ["300", "normal", "bold"]

type PathParticle = {
  pathIdx: number
  t: number
  speed: number
  charIdx: number
  weight: number
}

export function useKillChainCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  config: {
    particleCount?: number
    color?: string
    bgAlpha?: number
    bg?: string
  } = {}
) {
  const { particleCount = 35, color = "rgba(61,53,41,", bgAlpha = 0.08, bg = "243,241,237" } = config
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    let running = true
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = canvas.clientWidth
    let H = canvas.clientHeight

    function resize() {
      W = canvas!.clientWidth
      H = canvas!.clientHeight
      canvas!.width = W * dpr
      canvas!.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    ctx.fillStyle = `rgb(${bg})`
    ctx.fillRect(0, 0, W, H)

    const paths = buildPaths()

    const particles: PathParticle[] = []
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        pathIdx: i % paths.length,
        t: Math.random(),
        speed: 0.08 + Math.random() * 0.12,
        charIdx: Math.floor(Math.random() * CHARS.length),
        weight: Math.floor(Math.random() * WEIGHTS.length),
      })
    }

    let lastTime = performance.now()
    let time = 0

    function frame(now: number) {
      if (!running) return
      const dt = Math.min((now - lastTime) / 1000, 0.05)
      lastTime = now
      time += dt

      // Trail decay
      ctx.fillStyle = `rgba(${bg},${bgAlpha})`
      ctx.fillRect(0, 0, W, H)

      ctx.textAlign = "center"
      ctx.textBaseline = "middle"

      // Draw faint path traces
      ctx.globalAlpha = 0.04
      ctx.font = `300 13px Georgia, serif`
      for (const path of paths) {
        for (let t = 0; t <= 1; t += 0.04) {
          const x = bez(t, path.p0.x, path.p1.x, path.p2.x, path.p3.x) * W
          const y = bez(t, path.p0.y, path.p1.y, path.p2.y, path.p3.y) * H
          const ch = CHARS[Math.floor(t * 20) % CHARS.length]!
          ctx.fillStyle = `${color}0.3)`
          ctx.fillText(ch, x, y)
        }
      }

      // Draw pulsing nodes
      for (let ni = 0; ni < NODES.length; ni++) {
        const node = NODES[ni]!
        const pulse = 0.15 + 0.08 * Math.sin(time * 2 + ni * 1.2)
        const x = node.x * W
        const y = node.y * H
        ctx.globalAlpha = pulse
        ctx.font = `bold 16px Georgia, serif`
        ctx.fillStyle = `${color}${pulse + 0.3})`

        // Draw a cluster of characters at each node
        for (let d = -1; d <= 1; d++) {
          for (let e = -1; e <= 1; e++) {
            const ch = CHARS[(ni * 7 + d * 3 + e) % CHARS.length]!
            ctx.fillText(ch, x + d * 12, y + e * 12)
          }
        }
      }

      // Update and draw particles
      for (const p of particles) {
        p.t += p.speed * dt
        if (p.t >= 1) {
          p.t = 0
          p.pathIdx = Math.floor(Math.random() * paths.length)
        }

        const path = paths[p.pathIdx]!
        const x = bez(p.t, path.p0.x, path.p1.x, path.p2.x, path.p3.x) * W
        const y = bez(p.t, path.p0.y, path.p1.y, path.p2.y, path.p3.y) * H

        if (Math.random() < dt * 3) {
          p.charIdx = Math.floor(Math.random() * CHARS.length)
        }

        const char = CHARS[p.charIdx]!
        const weight = WEIGHTS[p.weight]!
        const brightness = 0.4 + 0.6 * (1 - p.t) // brighter at start of path

        ctx.font = `${weight} 14px Georgia, serif`
        ctx.globalAlpha = brightness * 0.8
        ctx.fillStyle = `${color}${brightness})`
        ctx.fillText(char, x, y)

        // Bright head
        ctx.globalAlpha = brightness
        ctx.fillStyle = `${color}1)`
        ctx.fillText(char, x, y)
      }

      ctx.globalAlpha = 1
      rafRef.current = requestAnimationFrame(frame)
    }

    rafRef.current = requestAnimationFrame(frame)
    return () => { running = false; cancelAnimationFrame(rafRef.current) }
  }, [canvasRef, particleCount, color, bgAlpha])
}
