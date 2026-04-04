import type { PaletteEntry } from "./types"
import { findBestMatch } from "./palette"

// Render text string to an offscreen canvas and return a brightness grid
export function textToBrightnessGrid(
  text: string,
  font: string,
  fontSize: number,
  cols: number,
  rows: number
): number[][] {
  // First, measure the text to size the canvas tightly
  const measure = document.createElement("canvas").getContext("2d")!
  measure.font = `bold ${fontSize}px ${font}`
  const metrics = measure.measureText(text)
  const textW = Math.ceil(metrics.width)
  const textH = Math.ceil(fontSize * 1.3)

  // Size canvas to the grid output dimensions (1 pixel per cell for clean sampling)
  // but render the text at full resolution, then scale down
  const renderCanvas = document.createElement("canvas")
  renderCanvas.width = textW
  renderCanvas.height = textH
  const rctx = renderCanvas.getContext("2d")!

  rctx.fillStyle = "#000"
  rctx.fillRect(0, 0, textW, textH)
  rctx.fillStyle = "#fff"
  rctx.font = `bold ${fontSize}px ${font}`
  rctx.textBaseline = "top"
  rctx.textAlign = "left"
  rctx.fillText(text, 0, fontSize * 0.1)

  // Now downsample into cols x rows grid
  return canvasToBrightnessGrid(rctx, textW, textH, cols, rows)
}

// Sample a canvas context into a brightness grid (averages a block per cell)
export function canvasToBrightnessGrid(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  cols: number,
  rows: number
): number[][] {
  const imageData = ctx.getImageData(0, 0, canvasW, canvasH)
  const data = imageData.data
  const cellW = canvasW / cols
  const cellH = canvasH / rows
  const grid: number[][] = []

  for (let row = 0; row < rows; row++) {
    const line: number[] = []
    for (let col = 0; col < cols; col++) {
      const x0 = Math.floor(col * cellW)
      const y0 = Math.floor(row * cellH)
      const x1 = Math.min(Math.floor((col + 1) * cellW), canvasW)
      const y1 = Math.min(Math.floor((row + 1) * cellH), canvasH)

      // Average brightness over the entire cell block
      let sum = 0
      let count = 0
      // Sample up to 4 points within the cell for performance
      const sx = Math.max(1, Math.floor((x1 - x0) / 2))
      const sy = Math.max(1, Math.floor((y1 - y0) / 2))
      for (let py = y0; py < y1; py += sy) {
        for (let px = x0; px < x1; px += sx) {
          const idx = (py * canvasW + px) * 4
          const r = data[idx] ?? 0
          const g = data[idx + 1] ?? 0
          const b = data[idx + 2] ?? 0
          sum += r * 0.299 + g * 0.587 + b * 0.114
          count++
        }
      }
      line.push(count > 0 ? sum / (count * 255) : 0)
    }
    grid.push(line)
  }
  return grid
}

// Map brightness grid to HTML string with weight/opacity CSS classes
export function brightnessGridToHTML(
  grid: number[][],
  palette: PaletteEntry[],
  threshold: number = 0.05
): string {
  const lines: string[] = []

  for (const row of grid) {
    let line = ""
    for (const brightness of row) {
      if (brightness < threshold) {
        line += " "
        continue
      }
      const entry = findBestMatch(palette, brightness)
      const opacityLevel = Math.max(1, Math.min(10, Math.ceil(brightness * 10)))
      const weightClass = `ascii-w${entry.weight === 300 ? 3 : entry.weight === 500 ? 5 : 8}`
      const italicClass = entry.italic ? " ascii-it" : ""
      line += `<span class="${weightClass} ascii-a${opacityLevel}${italicClass}">${escapeHTML(entry.char)}</span>`
    }
    lines.push(line)
  }

  return lines.join("\n")
}

// Map a flat brightness array (from video frame) to HTML, using source text chars
export function videoFrameToHTML(
  brightnessData: number[],
  cols: number,
  rows: number,
  charGrid: string[][],
  threshold: number = 0.08
): string {
  const lines: string[] = []

  for (let row = 0; row < rows; row++) {
    let line = ""
    for (let col = 0; col < cols; col++) {
      const brightness = brightnessData[row * cols + col] ?? 0
      const char = charGrid[row]?.[col] ?? " "

      if (brightness < threshold || char === " ") {
        line += " "
        continue
      }

      const opacityLevel = Math.max(1, Math.min(10, Math.ceil(brightness * 10)))
      // Use heavier weight for brighter areas
      const weightClass =
        brightness > 0.7 ? "ascii-w8" : brightness > 0.35 ? "ascii-w5" : "ascii-w3"
      line += `<span class="${weightClass} ascii-a${opacityLevel}">${escapeHTML(char)}</span>`
    }
    lines.push(line)
  }

  return lines.join("\n")
}

function escapeHTML(char: string): string {
  switch (char) {
    case "&":
      return "&amp;"
    case "<":
      return "&lt;"
    case ">":
      return "&gt;"
    case '"':
      return "&quot;"
    default:
      return char
  }
}
