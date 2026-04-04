"use client"

import { useEffect, useRef } from "react"

// Hook shape as bezier path segments (normalized 0-1)
function sampleHookPath(count: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = []
  function bez(t: number, p0: number, p1: number, p2: number, p3: number) {
    const mt = 1 - t
    return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3
  }

  const segments = [
    { type: "line" as const, x0: 0.72, y0: 0.0, x1: 0.72, y1: 0.10 },
    { type: "line" as const, x0: 0.72, y0: 0.10, x1: 0.72, y1: 0.42 },
    { type: "bezier" as const, x0: 0.72, y0: 0.42, cx1: 0.72, cy1: 0.62, cx2: 0.62, cy2: 0.78, x3: 0.40, y3: 0.78 },
    { type: "bezier" as const, x0: 0.40, y0: 0.78, cx1: 0.25, cy1: 0.78, cx2: 0.22, cy2: 0.65, x3: 0.30, y3: 0.52 },
    { type: "bezier" as const, x0: 0.30, y0: 0.52, cx1: 0.27, cy1: 0.56, cx2: 0.24, cy2: 0.58, x3: 0.22, y3: 0.62 },
  ]

  const perSeg = Math.ceil(count / segments.length)
  for (const seg of segments) {
    for (let i = 0; i < perSeg; i++) {
      const t = i / perSeg
      if (seg.type === "line") {
        points.push({ x: seg.x0 + (seg.x1 - seg.x0) * t, y: seg.y0 + (seg.y1 - seg.y0) * t })
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

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*+=-~:;.,!?"
const WEIGHTS = ["300", "normal", "bold"]

type Particle = {
  pathPos: number
  speed: number
  brightness: number
  charIdx: number
  weight: number
}

export function useHookCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  config: {
    particleCount?: number
    color?: string
    bgAlpha?: number
    bg?: string // "r,g,b" for trail decay background
  } = {}
) {
  const { particleCount = 80, color = "rgba(73,109,205,", bgAlpha = 0.08, bg = "243,241,237" } = config
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
    // Fill initial background so canvas isn't transparent
    ctx.fillStyle = `rgb(${bg})`
    ctx.fillRect(0, 0, W, H)

    const hookPath = sampleHookPath(300)

    // Init particles along the path
    const particles: Particle[] = []
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        pathPos: Math.random() * hookPath.length,
        speed: 0.3 + Math.random() * 0.8,
        brightness: 0.2 + Math.random() * 0.8,
        charIdx: Math.floor(Math.random() * CHARS.length),
        weight: Math.floor(Math.random() * WEIGHTS.length),
      })
    }

    let lastTime = performance.now()

    function frame(now: number) {
      if (!running) return
      const dt = Math.min((now - lastTime) / 1000, 0.05)
      lastTime = now

      // Trail decay — semi-transparent background fill
      ctx.fillStyle = `rgba(${bg},${bgAlpha})`
      ctx.fillRect(0, 0, W, H)

      ctx.textAlign = "center"
      ctx.textBaseline = "middle"

      // Draw faint static hook skeleton
      ctx.globalAlpha = 0.06
      for (let i = 0; i < hookPath.length; i += 2) {
        const pt = hookPath[i]!
        const x = pt.x * W
        const y = pt.y * H
        const ch = CHARS[(i * 7) % CHARS.length]!
        ctx.font = `300 14px Georgia, serif`
        ctx.fillStyle = `${color}0.4)`
        ctx.fillText(ch, x, y)
      }

      // Update and draw particles
      for (const p of particles) {
        p.pathPos = (p.pathPos + p.speed * dt * 30) % hookPath.length
        const idx = Math.min(Math.floor(p.pathPos), hookPath.length - 1)
        const pt = hookPath[idx]
        if (!pt) continue
        const x = pt.x * W
        const y = pt.y * H
        const char = CHARS[p.charIdx]!

        // Rotate char occasionally
        if (Math.random() < dt * 2) {
          p.charIdx = Math.floor(Math.random() * CHARS.length)
        }

        const weight = WEIGHTS[p.weight]!
        ctx.font = `${weight} 14px Georgia, serif`
        ctx.globalAlpha = p.brightness
        ctx.fillStyle = `${color}${p.brightness})`
        ctx.fillText(char, x, y)

        // Bright leading head
        ctx.globalAlpha = Math.min(1, p.brightness * 1.5)
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
