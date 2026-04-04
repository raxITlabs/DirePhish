"use client"

import { useState, useEffect, useRef } from "react"
import { buildPalette } from "./palette"
import { textToBrightnessGrid, brightnessGridToHTML } from "./renderer"
import type { PaletteEntry } from "./types"

const DEFAULT_FONT = "Georgia, serif"
const DEFAULT_FONT_SIZE = 14

export function useAsciiArt(
  text: string,
  options: {
    cols?: number
    rows?: number
    fontSize?: number
    fontFamily?: string
    sourceFontSize?: number
  }
) {
  const {
    cols = 60,
    rows = 15,
    fontSize = DEFAULT_FONT_SIZE,
    fontFamily = DEFAULT_FONT,
    sourceFontSize = 120,
  } = options

  const [html, setHtml] = useState("")
  const [ready, setReady] = useState(false)
  const paletteRef = useRef<PaletteEntry[] | null>(null)

  useEffect(() => {
    let cancelled = false

    document.fonts.ready.then(() => {
      if (cancelled) return

      // Build palette once
      if (!paletteRef.current) {
        paletteRef.current = buildPalette(fontFamily, fontSize)
      }

      // Render text to brightness grid
      const grid = textToBrightnessGrid(text, fontFamily, sourceFontSize, cols, rows)

      // Map to HTML
      const result = brightnessGridToHTML(grid, paletteRef.current)
      setHtml(result)
      setReady(true)
    })

    return () => {
      cancelled = true
    }
  }, [text, cols, rows, fontSize, fontFamily, sourceFontSize])

  return { html, ready }
}
