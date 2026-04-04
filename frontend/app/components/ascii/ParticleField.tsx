"use client"

import { useRef } from "react"
import { useParticleField } from "@/app/lib/ascii/use-particle-field"

export default function ParticleField({
  cols = 50,
  rows = 28,
  particleCount = 120,
}: {
  cols?: number
  rows?: number
  particleCount?: number
}) {
  const containerRef = useRef<HTMLPreElement>(null)

  useParticleField(containerRef, { cols, rows, particleCount })

  return (
    <pre
      ref={containerRef}
      className="font-serif text-tuscan-sun-400 phosphor-glow leading-none select-none"
      style={{
        fontSize: "14px",
        lineHeight: "14px",
        letterSpacing: "0px",
        minHeight: `${rows * 14}px`,
        willChange: "contents",
      }}
    />
  )
}
