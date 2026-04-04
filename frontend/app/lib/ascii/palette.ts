import { prepareWithSegments } from "@chenglou/pretext"
import type { PaletteEntry } from "./types"

const CHARSET =
  " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~"
const WEIGHTS = [300, 500, 800]
const STYLES = [false, true] as const

let cachedPalette: PaletteEntry[] | null = null
let cachedKey = ""

// Measure a single character's pixel width via pretext
function measureCharWidth(char: string, font: string): number {
  const prepared = prepareWithSegments(char, font)
  return prepared.widths.length > 0 ? prepared.widths[0]! : 0
}

// Estimate character brightness by rendering to a small canvas (matches pretext demo: 28x28)
function estimateBrightness(char: string, font: string): number {
  const size = 28
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")!
  ctx.clearRect(0, 0, size, size)
  ctx.font = font
  ctx.textBaseline = "middle"
  ctx.textAlign = "center"
  ctx.fillText(char, size / 2, size / 2)

  const data = ctx.getImageData(0, 0, size, size).data
  let sum = 0
  // Read alpha channel (index 3) — matches pretext reference demo
  for (let i = 3; i < data.length; i += 4) {
    sum += data[i]!
  }
  return sum / (255 * size * size)
}

export function buildPalette(fontFamily: string, fontSize: number): PaletteEntry[] {
  const key = `${fontFamily}:${fontSize}`
  if (cachedPalette && cachedKey === key) return cachedPalette

  const entries: PaletteEntry[] = []

  for (const italic of STYLES) {
    for (const weight of WEIGHTS) {
      const font = `${italic ? "italic " : ""}${weight} ${fontSize}px ${fontFamily}`
      for (const char of CHARSET) {
        const width = measureCharWidth(char, font)
        const brightness = estimateBrightness(char, font)
        entries.push({ char, weight, italic, width, brightness, font })
      }
    }
  }

  // Sort by brightness for binary search
  entries.sort((a, b) => a.brightness - b.brightness)

  // Normalize brightness to 0-1 range
  const minB = entries[0]?.brightness ?? 0
  const maxB = entries[entries.length - 1]?.brightness ?? 1
  const range = maxB - minB || 1
  for (const entry of entries) {
    entry.brightness = (entry.brightness - minB) / range
  }

  cachedPalette = entries
  cachedKey = key
  return entries
}

// Binary search for closest brightness match, then refine with width scoring
export function findBestMatch(
  palette: PaletteEntry[],
  targetBrightness: number,
  targetWidth?: number
): PaletteEntry {
  // Binary search for coarse brightness match
  let lo = 0
  let hi = palette.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (palette[mid]!.brightness < targetBrightness) lo = mid + 1
    else hi = mid
  }

  // Search neighborhood for best combined score
  const searchRadius = 15
  const start = Math.max(0, lo - searchRadius)
  const end = Math.min(palette.length - 1, lo + searchRadius)

  let bestScore = Infinity
  let bestEntry = palette[lo]!

  for (let i = start; i <= end; i++) {
    const entry = palette[i]!
    const brightnessError = Math.abs(entry.brightness - targetBrightness) * 2.5
    const widthError = targetWidth
      ? Math.abs(entry.width - targetWidth) / Math.max(targetWidth, 1)
      : 0
    const score = brightnessError + widthError
    if (score < bestScore) {
      bestScore = score
      bestEntry = entry
    }
  }

  return bestEntry
}
