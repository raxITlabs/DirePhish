"use client"

import { useRef } from "react"
import { useLogoAlive } from "@/app/lib/ascii/use-logo-alive"

export default function LogoAlive({
  bg = "243,241,237",
  className = "",
}: {
  bg?: string
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useLogoAlive(canvasRef, { bg })

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full ${className}`}
      aria-hidden="true"
      role="presentation"
    />
  )
}
