"use client"

import { useEffect, useRef } from "react"
import { prepareWithSegments, layoutNextLine } from "@chenglou/pretext"
import type { PreparedTextWithSegments, LayoutCursor } from "@chenglou/pretext"
import { videoFrameToHTML } from "./renderer"

const DEFAULT_FONT = "14px Georgia, serif"

// Build a character grid from source text using pretext's layout engine
function buildCharGrid(
  text: string,
  font: string,
  cols: number,
  rows: number,
  cellWidth: number
): string[][] {
  const prepared = prepareWithSegments(text, font)
  const maxWidth = cols * cellWidth
  const grid: string[][] = []

  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }

  for (let row = 0; row < rows; row++) {
    const line = layoutNextLine(prepared, cursor, maxWidth)
    const rowChars: string[] = []

    if (line) {
      // Extract characters from the line text
      const chars = [...line.text]
      const charWidthApprox = maxWidth / cols

      // Distribute characters across columns based on width
      let currentX = 0
      let charIdx = 0
      for (let col = 0; col < cols; col++) {
        const colCenter = (col + 0.5) * charWidthApprox
        // Advance to the character that covers this column
        while (charIdx < chars.length - 1 && currentX + charWidthApprox < colCenter) {
          currentX += charWidthApprox
          charIdx++
        }
        rowChars.push(chars[charIdx] ?? " ")
        if (charIdx < chars.length - 1) charIdx++
      }
      cursor = line.end
    } else {
      // No more text — wrap around
      cursor = { segmentIndex: 0, graphemeIndex: 0 }
      for (let col = 0; col < cols; col++) rowChars.push(" ")
    }

    grid.push(rowChars)
  }

  return grid
}

export function useVideoAscii(
  containerRef: React.RefObject<HTMLElement | null>,
  videoRef: React.RefObject<HTMLVideoElement | null>,
  sourceText: string,
  options: {
    cols?: number
    rows?: number
    font?: string
    cellWidth?: number
  } = {}
) {
  const { cols = 80, rows = 40, font = DEFAULT_FONT, cellWidth = 8 } = options
  const rafRef = useRef<number>(0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const el = containerRef.current
    const video = videoRef.current
    if (!el || !video) return

    // Check prefers-reduced-motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = "[ animation paused — prefers-reduced-motion ]"
      return
    }

    let running = true

    // Create offscreen canvas for sampling video frames
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas")
    }
    const canvas = canvasRef.current
    canvas.width = cols
    canvas.height = rows
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!

    // Build character grid from source text using pretext
    let charGrid: string[][] = []

    document.fonts.ready.then(() => {
      if (!running) return
      charGrid = buildCharGrid(sourceText, font, cols, rows, cellWidth)
    })

    function render() {
      if (!running) return

      if (video!.readyState >= 2 && charGrid.length > 0) {
        // Draw current video frame to tiny canvas
        ctx.drawImage(video!, 0, 0, cols, rows)
        const imageData = ctx.getImageData(0, 0, cols, rows)
        const data = imageData.data

        // Extract brightness per cell
        const brightness: number[] = []
        for (let i = 0; i < cols * rows; i++) {
          const r = data[i * 4]!
          const g = data[i * 4 + 1]!
          const b = data[i * 4 + 2]!
          brightness.push((r * 0.299 + g * 0.587 + b * 0.114) / 255)
        }

        // Render: video brightness sculpts the text
        const html = videoFrameToHTML(brightness, cols, rows, charGrid)
        el!.innerHTML = html
      }

      rafRef.current = requestAnimationFrame(render)
    }

    // Start when video is ready
    const onCanPlay = () => {
      rafRef.current = requestAnimationFrame(render)
    }

    if (video.readyState >= 2) {
      onCanPlay()
    } else {
      video.addEventListener("canplay", onCanPlay, { once: true })
    }

    return () => {
      running = false
      cancelAnimationFrame(rafRef.current)
      video.removeEventListener("canplay", onCanPlay)
    }
  }, [containerRef, videoRef, sourceText, cols, rows, font, cellWidth])
}
