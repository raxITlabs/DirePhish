"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import { prepareWithSegments, layoutNextLine } from "@chenglou/pretext"
import type { LayoutCursor } from "@chenglou/pretext"
import { videoFrameToHTML } from "@/app/lib/ascii/renderer"

const SOURCE_TEXTS = {
  hacker: `The Conscience of a Hacker. We explore, and you call us criminals. We seek after knowledge, and you call us criminals. We exist without skin color, without nationality, without religious bias, and you call us criminals. You build atomic bombs, you wage wars, you murder, cheat, and lie to us and try to make us believe it's for our own good, yet we're the criminals. Yes, I am a criminal. My crime is that of curiosity. My crime is that of judging people by what they say and think, not what they look like. My crime is that of outsmarting you, something that you will never forgive me for. I am a hacker, and this is my manifesto. `,
  direphish: `DirePhish. Swarm-predict what goes wrong next. Predictive incident response simulation. AI agents rehearse your war room before the breach happens. Predict what breaks next. Ransomware hitting finance systems. Cloud credentials leaked on GitHub. Supply chain compromise via vendor. Spear phishing targeting the C-suite. Zero-day exploit in production. Insider threat data exfiltration. DNS hijacking campaign. Watering hole attack on developer tools. Business email compromise. Session hijacking via stolen cookies. `,
  matrix: `Wake up Neo. The Matrix has you. Follow the white rabbit. Knock knock. I know what you have been doing. I know why you hardly sleep, why you live alone, and why night after night you sit at your computer. You are looking for him. I know because I was once looking for the same thing. And when he found me he told me I was not really looking for him. I was looking for an answer. It is the question that drives us Neo. The answer is out there and it is looking for you and it will find you if you want it to. `,
}

type SourceKey = keyof typeof SOURCE_TEXTS

const FONT = "14px Georgia, serif"

function buildCharGrid(
  text: string,
  cols: number,
  rows: number,
  cellWidth: number
): string[][] {
  const prepared = prepareWithSegments(text, FONT)
  const maxWidth = cols * cellWidth
  const grid: string[][] = []

  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }

  for (let row = 0; row < rows; row++) {
    const line = layoutNextLine(prepared, cursor, maxWidth)
    const rowChars: string[] = []

    if (line) {
      const chars = [...line.text]
      for (let col = 0; col < cols; col++) {
        const charIdx = Math.min(Math.floor((col / cols) * chars.length), chars.length - 1)
        rowChars.push(chars[charIdx] ?? " ")
      }
      cursor = line.end
    } else {
      // Wrap around
      cursor = { segmentIndex: 0, graphemeIndex: 0 }
      const fallbackLine = layoutNextLine(prepared, cursor, maxWidth)
      if (fallbackLine) {
        const chars = [...fallbackLine.text]
        for (let col = 0; col < cols; col++) {
          const charIdx = Math.min(Math.floor((col / cols) * chars.length), chars.length - 1)
          rowChars.push(chars[charIdx] ?? " ")
        }
        cursor = fallbackLine.end
      } else {
        for (let col = 0; col < cols; col++) rowChars.push(" ")
      }
    }

    grid.push(rowChars)
  }

  return grid
}

// Animated canvas pattern: rotating radial + moving bars (works without a video file)
function drawPattern(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number
) {
  ctx.fillStyle = "#000"
  ctx.fillRect(0, 0, w, h)

  // Radial gradient that rotates
  const cx = w * (0.5 + 0.2 * Math.sin(t * 0.5))
  const cy = h * (0.5 + 0.2 * Math.cos(t * 0.7))
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.6)
  grad.addColorStop(0, "rgba(255,255,255,0.9)")
  grad.addColorStop(0.4, "rgba(255,255,255,0.3)")
  grad.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  // Second light
  const cx2 = w * (0.5 + 0.3 * Math.cos(t * 0.3))
  const cy2 = h * (0.5 + 0.25 * Math.sin(t * 0.6))
  const grad2 = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, Math.max(w, h) * 0.4)
  grad2.addColorStop(0, "rgba(255,255,255,0.7)")
  grad2.addColorStop(0.5, "rgba(255,255,255,0.1)")
  grad2.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = grad2
  ctx.fillRect(0, 0, w, h)

  // Diagonal sweep
  const sweepX = (t * 30) % (w * 2) - w * 0.5
  ctx.fillStyle = "rgba(255,255,255,0.15)"
  ctx.beginPath()
  ctx.moveTo(sweepX, 0)
  ctx.lineTo(sweepX + w * 0.3, 0)
  ctx.lineTo(sweepX + w * 0.1, h)
  ctx.lineTo(sweepX - w * 0.2, h)
  ctx.fill()
}

export default function VideoAscii({
  cols = 80,
  rows = 30,
}: {
  cols?: number
  rows?: number
}) {
  const containerRef = useRef<HTMLPreElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number>(0)
  const [source, setSource] = useState<"pattern" | "webcam">("pattern")
  const [textKey, setTextKey] = useState<SourceKey>("hacker")
  const [webcamError, setWebcamError] = useState<string | null>(null)
  const charGridRef = useRef<string[][]>([])

  // Build char grid when text changes
  useEffect(() => {
    document.fonts.ready.then(() => {
      charGridRef.current = buildCharGrid(SOURCE_TEXTS[textKey], cols, rows, 8)
    })
  }, [textKey, cols, rows])

  // Animation loop
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = "[ animation paused — prefers-reduced-motion ]"
      return
    }

    let running = true

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas")
    }
    const canvas = canvasRef.current
    canvas.width = cols
    canvas.height = rows
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!

    let startTime = 0

    function render(timestamp: number) {
      if (!running) return
      if (!startTime) startTime = timestamp
      const t = (timestamp - startTime) / 1000

      const grid = charGridRef.current
      if (grid.length === 0) {
        rafRef.current = requestAnimationFrame(render)
        return
      }

      if (source === "webcam" && videoRef.current && videoRef.current.readyState >= 2) {
        ctx.drawImage(videoRef.current, 0, 0, cols, rows)
      } else {
        drawPattern(ctx, cols, rows, t)
      }

      const imageData = ctx.getImageData(0, 0, cols, rows)
      const data = imageData.data
      const brightness: number[] = []
      for (let i = 0; i < cols * rows; i++) {
        const r = data[i * 4]!
        const g = data[i * 4 + 1]!
        const b = data[i * 4 + 2]!
        brightness.push((r * 0.299 + g * 0.587 + b * 0.114) / 255)
      }

      const html = videoFrameToHTML(brightness, cols, rows, grid)
      el!.innerHTML = html

      rafRef.current = requestAnimationFrame(render)
    }

    document.fonts.ready.then(() => {
      if (running) rafRef.current = requestAnimationFrame(render)
    })

    return () => {
      running = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [source, cols, rows, textKey])

  const toggleSource = useCallback(async () => {
    if (source === "pattern") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240 },
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
        }
        setSource("webcam")
        setWebcamError(null)
      } catch {
        setWebcamError("Webcam access denied")
      }
    } else {
      if (videoRef.current) {
        const stream = videoRef.current.srcObject as MediaStream | null
        if (stream) stream.getTracks().forEach((t) => t.stop())
        videoRef.current.srcObject = null
      }
      setSource("pattern")
    }
  }, [source])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={toggleSource}
          className="px-3 py-1 text-xs font-mono rounded border border-pitch-black-700 bg-pitch-black-900 text-tuscan-sun-400 hover:bg-pitch-black-800 transition-colors"
        >
          {source === "pattern" ? "Switch to Webcam" : "Switch to Pattern"}
        </button>

        <div className="flex gap-1">
          {(Object.keys(SOURCE_TEXTS) as SourceKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setTextKey(key)}
              className={`px-2 py-1 text-xs font-mono rounded border transition-colors ${
                textKey === key
                  ? "border-tuscan-sun-500 bg-tuscan-sun-500/10 text-tuscan-sun-400"
                  : "border-pitch-black-700 bg-pitch-black-900 text-pitch-black-400 hover:text-pitch-black-300"
              }`}
            >
              {key}
            </button>
          ))}
        </div>

        {webcamError && (
          <span className="text-xs font-mono text-burnt-peach-400">{webcamError}</span>
        )}
      </div>

      <video ref={videoRef} className="hidden" muted playsInline />

      <pre
        ref={containerRef}
        className="text-tuscan-sun-400 phosphor-glow leading-none select-none"
        style={{
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          fontSize: "11px",
          lineHeight: "12px",
          letterSpacing: "0px",
          minHeight: `${rows * 12}px`,
          willChange: "contents",
        }}
      >
        <span className="text-pitch-black-500 animate-pulse">
          Initializing text field\u2026
        </span>
      </pre>
    </div>
  )
}
