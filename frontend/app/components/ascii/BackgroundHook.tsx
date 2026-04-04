"use client"

import { useRef } from "react"
import { useHookCanvas } from "@/app/lib/ascii/use-hook-canvas"

export default function BackgroundHook({
  colorClass = "text-royal-azure-500",
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

  // Map common color classes to rgba base strings
  const colorMap: Record<string, string> = {
    "text-royal-azure-400": "rgba(100,140,220,",
    "text-royal-azure-500": "rgba(73,109,205,",
    "text-pitch-black-500": "rgba(100,90,80,",
    "text-pitch-black-700": "rgba(61,53,41,",
    "text-tuscan-sun-400": "rgba(196,163,90,",
    "text-tuscan-sun-500": "rgba(180,145,60,",
  }

  const resolvedColor = color ?? colorMap[colorClass] ?? "rgba(73,109,205,"

  useHookCanvas(canvasRef, { color: resolvedColor })

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
