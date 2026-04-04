"use client"

import { useEffect, useRef } from "react"

const FRAGMENTS = [
  "URGENT: Verify your account",
  "Password expires in 24h",
  "Action required: unusual login",
  "Suspicious activity detected",
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
  "DocuSign: Awaiting signature",
]

const WEIGHTS = ["300", "normal", "bold"]

type RainDrop = {
  x: number
  y: number
  speed: number
  fragIdx: number
  charOffset: number
  brightness: number
  weight: number
}

export function useEmailRainCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  config: {
    dropCount?: number
    color?: string
    bgAlpha?: number
    bg?: string
  } = {}
) {
  const { dropCount = 50, color = "rgba(160,130,60,", bgAlpha = 0.06, bg = "243,241,237" } = config
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

    // Create rain drops — each is a fragment falling vertically
    const drops: RainDrop[] = []
    const numCols = Math.ceil(W / 45)

    for (let i = 0; i < dropCount; i++) {
      const col = i % numCols
      drops.push({
        x: (col / numCols) * W + (Math.random() - 0.5) * 30,
        y: -(Math.random() * H * 2),
        speed: 20 + Math.random() * 40,
        fragIdx: Math.floor(Math.random() * FRAGMENTS.length),
        charOffset: 0,
        brightness: 0.3 + Math.random() * 0.7,
        weight: Math.floor(Math.random() * WEIGHTS.length),
      })
    }

    let lastTime = performance.now()

    function frame(now: number) {
      if (!running) return
      const dt = Math.min((now - lastTime) / 1000, 0.05)
      lastTime = now

      // Trail decay
      ctx.fillStyle = `rgba(${bg},${bgAlpha})`
      ctx.fillRect(0, 0, W, H)

      ctx.textAlign = "left"
      ctx.textBaseline = "top"

      for (const drop of drops) {
        drop.y += drop.speed * dt

        // Reset when off bottom
        if (drop.y > H + 50) {
          drop.y = -(Math.random() * H * 0.5 + 50)
          drop.fragIdx = Math.floor(Math.random() * FRAGMENTS.length)
          drop.x = Math.random() * W
          drop.brightness = 0.3 + Math.random() * 0.7
          drop.speed = 20 + Math.random() * 40
        }

        const text = FRAGMENTS[drop.fragIdx]!
        const weight = WEIGHTS[drop.weight]!

        // Draw each character vertically
        for (let ci = 0; ci < text.length; ci++) {
          const char = text[ci]!
          const cy = drop.y - ci * 14 // stack vertically upward from head
          if (cy < -20 || cy > H + 20) continue

          // Brightness fades toward tail
          const tailFade = Math.max(0, 1 - ci / text.length)
          const alpha = drop.brightness * tailFade

          // Head character is brightest
          const isHead = ci === 0

          ctx.font = `${isHead ? "bold" : weight} ${isHead ? 15 : 13}px Georgia, serif`
          ctx.globalAlpha = isHead ? Math.min(1, alpha * 1.5) : alpha * 0.7
          ctx.fillStyle = `${color}${isHead ? "1" : String(alpha)})`
          ctx.fillText(char, drop.x, cy)
        }
      }

      ctx.globalAlpha = 1
      rafRef.current = requestAnimationFrame(frame)
    }

    rafRef.current = requestAnimationFrame(frame)
    return () => { running = false; cancelAnimationFrame(rafRef.current) }
  }, [canvasRef, dropCount, color, bgAlpha])
}
