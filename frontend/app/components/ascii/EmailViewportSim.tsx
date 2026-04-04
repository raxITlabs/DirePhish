"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import { prepareWithSegments, layoutWithLines } from "@chenglou/pretext"
import type { PreparedTextWithSegments } from "@chenglou/pretext"

const SAMPLE_EMAIL = `Subject: Urgent: Your account access will be suspended

Dear Michael,

Our security team has detected unusual login activity on your corporate account. To prevent unauthorized access, we require immediate verification of your credentials.

Please click the link below to verify your identity within 24 hours, or your account will be temporarily suspended:

https://secure-login.acme-corp.net/verify?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9&user=mthompson&redirect=https://portal.acme-corp.com/dashboard

If you did not initiate this request, please contact the IT helpdesk at helpdesk@acme-corp.com or call extension 4421.

This is an automated message from ACME Corp Information Security.
Do not reply to this email.

Best regards,
IT Security Team
ACME Corporation
1200 Technology Drive, Suite 400
San Francisco, CA 94107`

const FONT = "13px ui-monospace, monospace"
const LINE_HEIGHT = 20

const PRESETS = [
  { label: "Mobile", width: 320 },
  { label: "Tablet", width: 768 },
  { label: "Desktop", width: 1100 },
] as const

// Detect if a line contains a URL
function hasURL(text: string): boolean {
  return /https?:\/\/\S+/.test(text)
}

// Detect if a URL was split across this line (starts mid-URL or ends mid-URL)
function isURLFragment(text: string, prevLine: string, nextLine: string): boolean {
  const trimmed = text.trim()
  // Line starts with what looks like a URL continuation (no space before http-like content)
  if (/^[a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+$/.test(trimmed) && hasURL(prevLine)) return true
  // Line has URL that continues on next line
  if (hasURL(text) && /^[a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;=%]/.test(nextLine.trim())) return true
  return false
}

export default function EmailViewportSim() {
  const [width, setWidth] = useState(600)
  const [ready, setReady] = useState(false)
  const preparedRef = useRef<PreparedTextWithSegments | null>(null)

  useEffect(() => {
    document.fonts.ready.then(() => {
      preparedRef.current = prepareWithSegments(SAMPLE_EMAIL, FONT)
      setReady(true)
    })
  }, [])

  const result = useMemo(() => {
    if (!ready || !preparedRef.current) return null
    try {
      return layoutWithLines(preparedRef.current, width, LINE_HEIGHT)
    } catch {
      return null
    }
  }, [width, ready])

  const lines = result?.lines ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Presets */}
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => setWidth(p.width)}
            className={`px-2.5 py-1 text-xs font-mono rounded border transition-colors ${
              width === p.width
                ? "border-tuscan-sun-500 bg-tuscan-sun-500/10 text-tuscan-sun-400"
                : "border-pitch-black-700 bg-pitch-black-900 text-pitch-black-400 hover:text-pitch-black-300"
            }`}
          >
            {p.label} {p.width}px
          </button>
        ))}

        {/* Width display */}
        <span className="text-xs font-mono text-tuscan-sun-400 tabular-nums ml-auto">
          {width}px &middot; {lines.length} lines
        </span>
      </div>

      {/* Slider */}
      <input
        type="range"
        min={280}
        max={1200}
        value={width}
        onChange={(e) => setWidth(Number(e.target.value))}
        className="w-full accent-tuscan-sun-500"
      />

      {/* Email preview */}
      <div
        className="relative border border-pitch-black-700 rounded-lg overflow-hidden bg-pitch-black-900/80"
        style={{ maxHeight: 420, overflowY: "auto" }}
      >
        {/* Simulated viewport width indicator */}
        <div
          className="border-r border-dashed border-tuscan-sun-500/30 absolute top-0 bottom-0 pointer-events-none"
          style={{ left: Math.min(width, 1100) }}
        />

        <div className="p-4" style={{ maxWidth: width }}>
          {!ready ? (
            <p className="text-xs font-mono text-pitch-black-500 animate-pulse">
              Measuring text layout...
            </p>
          ) : (
            <div
              className="font-mono text-xs leading-5"
              style={{ fontFamily: "ui-monospace, monospace", fontSize: "13px" }}
            >
              {lines.map((line, i) => {
                const text = line.text
                const prevText = lines[i - 1]?.text ?? ""
                const nextText = lines[i + 1]?.text ?? ""
                const urlLine = hasURL(text)
                const urlFragment = isURLFragment(text, prevText, nextText)
                const isOverflow = line.width > width * 0.98

                return (
                  <div
                    key={i}
                    className={`
                      ${urlLine ? "text-royal-azure-400" : "text-pitch-black-200"}
                      ${urlFragment ? "bg-burnt-peach-500/10 border-l-2 border-burnt-peach-500" : ""}
                      ${isOverflow ? "bg-burnt-peach-500/5" : ""}
                    `}
                    style={{ minHeight: LINE_HEIGHT }}
                  >
                    {text || "\u00A0"}
                    {urlFragment && (
                      <span className="text-burnt-peach-400 text-[10px] ml-2">
                        URL WRAP
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-[10px] font-mono text-pitch-black-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-royal-azure-400" /> URL line
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-burnt-peach-500" /> URL wrap (phishing tell)
        </span>
      </div>
    </div>
  )
}
