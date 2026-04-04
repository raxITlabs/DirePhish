"use client"

import { useRef } from "react"
import { useEmailRainCanvas } from "@/app/lib/ascii/use-emailrain-canvas"

export default function EmailRain({
  colorClass = "text-tuscan-sun-500",
  color,
  className = "",
}: {
  colorClass?: string
  color?: string
  glow?: boolean
  cols?: number
  rows?: number
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const colorMap: Record<string, string> = {
    "text-royal-azure-400": "rgba(100,140,220,",
    "text-royal-azure-500": "rgba(73,109,205,",
    "text-pitch-black-500": "rgba(100,90,80,",
    "text-pitch-black-700": "rgba(61,53,41,",
    "text-tuscan-sun-400": "rgba(196,163,90,",
    "text-tuscan-sun-500": "rgba(180,145,60,",
    "text-tuscan-sun-600": "rgba(150,120,50,",
  }

  const resolvedColor = color ?? colorMap[colorClass] ?? "rgba(180,145,60,"

  useEmailRainCanvas(canvasRef, { color: resolvedColor })

  return (
    <div className={`pointer-events-none select-none ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ minHeight: "392px" }}
        aria-hidden="true"
        role="presentation"
      />
    </div>
  )
}
