"use client"

import { useState, useEffect } from "react"

const RAMP = ["·", ":", ";", "=", "+", "#", "%", "@"] as const
const INTERVAL_MS = 180

export default function AsciiSpinner({ className = "" }: { className?: string }) {
  const [index, setIndex] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReducedMotion(mq.matches)

    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener("change", onChange)

    if (mq.matches) return () => mq.removeEventListener("change", onChange)

    const id = setInterval(() => {
      setIndex((i) => (i + 1) % RAMP.length)
    }, INTERVAL_MS)

    return () => {
      clearInterval(id)
      mq.removeEventListener("change", onChange)
    }
  }, [])

  return (
    <span
      className={`font-mono inline-block w-[1ch] text-center ${className}`}
      role="status"
      aria-label="Loading"
    >
      <span aria-hidden="true">{reducedMotion ? "…" : RAMP[index]}</span>
    </span>
  )
}
