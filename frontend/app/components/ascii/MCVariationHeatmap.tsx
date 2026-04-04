"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { prepareWithSegments, layoutWithLines } from "@chenglou/pretext"

const FONT = "12px ui-monospace, monospace"
const LINE_HEIGHT = 16
const WIDTH = 600

// Sample MC variations — simulated attack path descriptions with divergence
const VARIATIONS = [
  "Attacker performs OSINT recon via LinkedIn, identifies CFO Michael Thompson. Crafts spear-phishing email impersonating IT security, deploys credential harvesting page at secure-login.acme-corp.net. CFO clicks link within 4 hours, enters credentials. Attacker uses harvested creds to access Exchange, pivots to finance share drive, exfiltrates 2.3GB of M&A documents over DNS tunnel. Estimated loss: $4.2M.",
  "Attacker performs OSINT recon via LinkedIn, identifies CFO Michael Thompson. Crafts spear-phishing email impersonating HR benefits portal, deploys credential harvesting page at benefits-acme.com. CFO clicks link within 2 hours, enters credentials. Attacker uses harvested creds to access VPN, pivots to financial database, exfiltrates customer PII via encrypted HTTPS. Estimated loss: $6.1M.",
  "Attacker performs OSINT recon via LinkedIn, identifies CFO Michael Thompson. Crafts spear-phishing email impersonating board member, deploys malware attachment disguised as board minutes PDF. CFO opens attachment within 6 hours, RAT established. Attacker escalates privileges via cached domain admin token, pivots to backup server, deploys ransomware. Estimated loss: $8.7M.",
  "Attacker performs OSINT recon via LinkedIn, identifies CFO Michael Thompson. Crafts spear-phishing email impersonating IT security, deploys credential harvesting page at secure-login.acme-corp.net. CFO clicks link within 3 hours, enters credentials. Attacker uses harvested creds to access email, forwards wire transfer instructions to accounting. Estimated loss: $1.8M.",
  "Attacker performs OSINT recon via LinkedIn, identifies CFO Michael Thompson. Crafts spear-phishing email impersonating vendor invoice system, deploys credential harvesting page at invoice-portal-acme.net. CFO delegates to assistant who clicks within 8 hours, enters credentials. Attacker uses harvested creds to access procurement system, creates fraudulent purchase orders. Estimated loss: $3.4M.",
  "Attacker performs OSINT recon via LinkedIn, identifies CFO Michael Thompson. Crafts spear-phishing email impersonating IT security, deploys credential harvesting page at secure-login.acme-corp.net. CFO ignores email. Attacker escalates to vishing call impersonating helpdesk, CFO provides credentials over phone. Attacker uses harvested creds to access Exchange, pivots to finance share, exfiltrates quarterly earnings. Estimated loss: $5.5M.",
]

type VariationLine = {
  text: string
  width: number
}

type ProcessedVariation = {
  lines: VariationLine[]
  height: number
}

export default function MCVariationHeatmap() {
  const [processed, setProcessed] = useState<ProcessedVariation[]>([])
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<"overlay" | "list">("overlay")
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    document.fonts.ready.then(() => {
      const results: ProcessedVariation[] = []
      for (const text of VARIATIONS) {
        const prepared = prepareWithSegments(text, FONT)
        const result = layoutWithLines(prepared, WIDTH, LINE_HEIGHT)
        results.push({
          lines: result.lines.map((l) => ({ text: l.text, width: l.width })),
          height: result.height,
        })
      }
      setProcessed(results)
    })
  }, [])

  // Render the heatmap overlay to canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || processed.length === 0) return

    const maxLines = Math.max(...processed.map((p) => p.lines.length))
    const canvasH = maxLines * LINE_HEIGHT + 8
    // Match canvas resolution to display size for crisp text
    const dpr = window.devicePixelRatio || 1
    const displayW = canvas.offsetWidth || WIDTH + 40
    canvas.width = displayW * dpr
    canvas.height = canvasH * dpr

    const ctx = canvas.getContext("2d")!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    ctx.scale(dpr, dpr)
    ctx.font = FONT
    ctx.textBaseline = "top"

    for (let vi = 0; vi < processed.length; vi++) {
      const variation = processed[vi]!
      const isHovered = hoveredIdx === vi
      const isOtherHovered = hoveredIdx !== null && hoveredIdx !== vi

      // Set alpha: if one is hovered, dim the others
      if (isHovered) {
        ctx.globalAlpha = 0.95
      } else if (isOtherHovered) {
        ctx.globalAlpha = 0.04
      } else {
        ctx.globalAlpha = 1.0 / processed.length + 0.05
      }

      // Color per variation
      const hue = (vi * 47 + 35) % 360
      ctx.fillStyle = `hsl(${hue}, 50%, 65%)`

      for (let li = 0; li < variation.lines.length; li++) {
        const line = variation.lines[li]!
        ctx.fillText(line.text, 4, li * LINE_HEIGHT + 4)
      }
    }

    ctx.globalAlpha = 1.0
  }, [processed, hoveredIdx])

  useEffect(() => {
    renderCanvas()
  }, [renderCanvas])

  if (processed.length === 0) {
    return (
      <p className="text-xs font-mono text-pitch-black-500 animate-pulse">
        Processing {VARIATIONS.length} variations\u2026
      </p>
    )
  }

  const maxLines = Math.max(...processed.map((p) => p.lines.length))

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setViewMode("overlay")}
          className={`px-2.5 py-1 text-xs font-mono rounded border transition-colors ${
            viewMode === "overlay"
              ? "border-tuscan-sun-500 bg-tuscan-sun-500/10 text-tuscan-sun-400"
              : "border-pitch-black-700 bg-pitch-black-900 text-pitch-black-400"
          }`}
        >
          Overlay
        </button>
        <button
          onClick={() => setViewMode("list")}
          className={`px-2.5 py-1 text-xs font-mono rounded border transition-colors ${
            viewMode === "list"
              ? "border-tuscan-sun-500 bg-tuscan-sun-500/10 text-tuscan-sun-400"
              : "border-pitch-black-700 bg-pitch-black-900 text-pitch-black-400"
          }`}
        >
          List
        </button>

        <span className="text-[10px] font-mono text-pitch-black-500 ml-auto">
          {VARIATIONS.length} variations &middot; {maxLines} max lines &middot;
          {hoveredIdx !== null ? ` Variation #${hoveredIdx + 1}` : " Hover to isolate"}
        </span>
      </div>

      {viewMode === "overlay" ? (
        <div className="relative">
          {/* Canvas heatmap */}
          <canvas
            ref={canvasRef}
            className="rounded-lg bg-pitch-black-950"
            style={{
              width: "100%",
              height: maxLines * LINE_HEIGHT + 8,
              imageRendering: "crisp-edges",
            }}
          />

          {/* Hover zones — invisible strips per variation */}
          <div className="absolute inset-0 flex">
            {processed.map((_, vi) => (
              <div
                key={vi}
                className="flex-1 cursor-pointer"
                onMouseEnter={() => setHoveredIdx(vi)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            ))}
          </div>

          {/* Consensus/divergence annotation */}
          <div className="mt-2 flex gap-3 text-[10px] font-mono text-pitch-black-500">
            <span>Dense/crisp = consensus across simulations</span>
            <span>&middot;</span>
            <span>Diffused/scattered = divergence point</span>
          </div>
        </div>
      ) : (
        /* List view */
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {processed.map((v, vi) => (
            <div
              key={vi}
              className="rounded-lg border border-pitch-black-800 bg-pitch-black-900/50 p-3"
              onMouseEnter={() => setHoveredIdx(vi)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: `hsl(${(vi * 47 + 35) % 360}, 50%, 65%)` }}
                />
                <span className="text-[10px] font-mono text-pitch-black-400">
                  Variation #{vi + 1} &middot; {v.lines.length} lines
                </span>
              </div>
              <p className="text-xs font-mono text-pitch-black-300 leading-relaxed">
                {VARIATIONS[vi]}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
