import {
  prepareWithSegments,
  layoutWithLines,
  type PreparedTextWithSegments,
} from "@chenglou/pretext"

// Cache prepared texts to avoid re-measurement
const cache = new Map<string, PreparedTextWithSegments>()

function getPrepared(text: string, font: string): PreparedTextWithSegments {
  const key = `${font}::${text}`
  let prepared = cache.get(key)
  if (!prepared) {
    prepared = prepareWithSegments(text, font)
    cache.set(key, prepared)
    // Limit cache size
    if (cache.size > 500) {
      const firstKey = cache.keys().next().value
      if (firstKey) cache.delete(firstKey)
    }
  }
  return prepared
}

/** Measure single-line text width in pixels. */
export function measureTextWidth(text: string, font: string): number {
  const prepared = getPrepared(text, font)
  return prepared.widths.reduce((sum, w) => sum + w, 0)
}

/** Compute text height at a given container width. */
export function measureTextHeight(
  text: string,
  font: string,
  maxWidth: number,
  lineHeight: number,
): number {
  const prepared = getPrepared(text, font)
  const result = layoutWithLines(prepared, maxWidth, lineHeight)
  return result.height
}

/**
 * Truncate text to fit within maxWidth, adding an ellipsis if needed.
 * Uses pretext segment widths for accurate per-grapheme measurement.
 */
export function computeTruncation(
  text: string,
  maxWidth: number,
  font: string,
): string {
  const fullWidth = measureTextWidth(text, font)
  if (fullWidth <= maxWidth) return text

  const ellipsisWidth = measureTextWidth("\u2026", font)
  const targetWidth = maxWidth - ellipsisWidth

  const prepared = getPrepared(text, font)

  let width = 0
  for (let i = 0; i < prepared.segments.length; i++) {
    width += prepared.widths[i]!
    if (width > targetWidth) {
      return prepared.segments.slice(0, i).join("") + "\u2026"
    }
  }
  return text
}
