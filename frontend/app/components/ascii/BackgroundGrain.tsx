"use client"

import { useEffect, useRef } from "react"

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*+=-~:;.,!?"
const TILE_SIZE = 256
const FONT_SIZE = 11
const LINE_HEIGHT = 14

export default function BackgroundGrain({ opacity = 0.025 }: { opacity?: number }) {
  const canvasUrlRef = useRef<string | null>(null)
  const divRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (canvasUrlRef.current) return

    // Respect reduced motion — skip grain entirely
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const canvas = document.createElement("canvas")
    canvas.width = TILE_SIZE
    canvas.height = TILE_SIZE
    const ctx = canvas.getContext("2d")!

    ctx.globalAlpha = opacity
    ctx.font = `300 ${FONT_SIZE}px ui-monospace, "Geist Mono", monospace`
    ctx.fillStyle = "#3d3529"
    ctx.textBaseline = "top"

    for (let y = 0; y < TILE_SIZE; y += LINE_HEIGHT) {
      for (let x = 0; x < TILE_SIZE; x += FONT_SIZE * 0.7) {
        if (Math.random() < 0.4) continue
        const char = CHARSET[Math.floor(Math.random() * CHARSET.length)]!
        ctx.fillText(char, x + (Math.random() - 0.5) * 2, y)
      }
    }

    canvasUrlRef.current = canvas.toDataURL("image/png")

    if (divRef.current) {
      divRef.current.style.backgroundImage = `url(${canvasUrlRef.current})`
    }
  }, [opacity])

  return (
    <div
      ref={divRef}
      className="pointer-events-none fixed inset-0"
      style={{
        zIndex: 0,
        backgroundRepeat: "repeat",
        backgroundSize: `${TILE_SIZE}px ${TILE_SIZE}px`,
      }}
      aria-hidden="true"
      role="presentation"
    />
  )
}
