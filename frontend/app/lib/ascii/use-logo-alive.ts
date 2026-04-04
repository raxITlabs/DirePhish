"use client"

import { useEffect, useRef } from "react"

// ─── Logo paths (normalized 0-1) ─────────────────────────────
// Characters are REPELLED from these paths, creating negative space

const ORIGIN = { x: 0.10, y: 0.48 }
const FORK = { x: 0.42, y: 0.42 }

const PATHS = [
  // Shared: origin → fork
  { p0: ORIGIN, p1: { x: 0.22, y: 0.46 }, p2: { x: 0.33, y: 0.44 }, p3: FORK },
  // Red: fork → spear tip (up-right)
  { p0: FORK, p1: { x: 0.52, y: 0.34 }, p2: { x: 0.68, y: 0.20 }, p3: { x: 0.90, y: 0.13 } },
  // Teal: fork → endpoint (down-right)
  { p0: FORK, p1: { x: 0.50, y: 0.54 }, p2: { x: 0.64, y: 0.70 }, p3: { x: 0.85, y: 0.80 } },
]

function bez(t: number, a: number, b: number, c: number, d: number) {
  const m = 1 - t
  return m * m * m * a + 3 * m * m * t * b + 3 * m * t * t * c + t * t * t * d
}

// Distance from point to nearest point on any logo path
function distToLogo(px: number, py: number, W: number, H: number): number {
  let minDist = Infinity
  for (const path of PATHS) {
    // Sample 30 points per path segment
    for (let i = 0; i <= 30; i++) {
      const t = i / 30
      const lx = bez(t, path.p0.x, path.p1.x, path.p2.x, path.p3.x) * W
      const ly = bez(t, path.p0.y, path.p1.y, path.p2.y, path.p3.y) * H
      const dx = px - lx, dy = py - ly
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < minDist) minDist = d
    }
  }
  // Also check origin dot and endpoints
  const od = Math.sqrt((px - ORIGIN.x * W) ** 2 + (py - ORIGIN.y * H) ** 2)
  if (od < minDist) minDist = od
  return minDist
}

// Normal (repulsion direction) from nearest logo point
function logoRepulsion(px: number, py: number, W: number, H: number): { nx: number; ny: number; dist: number } {
  let minDist = Infinity
  let nearX = 0, nearY = 0
  for (const path of PATHS) {
    for (let i = 0; i <= 25; i++) {
      const t = i / 25
      const lx = bez(t, path.p0.x, path.p1.x, path.p2.x, path.p3.x) * W
      const ly = bez(t, path.p0.y, path.p1.y, path.p2.y, path.p3.y) * H
      const dx = px - lx, dy = py - ly
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < minDist) { minDist = d; nearX = lx; nearY = ly }
    }
  }
  // Origin dot
  const olx = ORIGIN.x * W, oly = ORIGIN.y * H
  const od = Math.sqrt((px - olx) ** 2 + (py - oly) ** 2)
  if (od < minDist) { minDist = od; nearX = olx; nearY = oly }

  if (minDist < 1) return { nx: 0, ny: -1, dist: minDist }
  return { nx: (px - nearX) / minDist, ny: (py - nearY) / minDist, dist: minDist }
}

// ─── Words that define the app ───────────────────────────────

const WORDS = [
  "phishing", "breach", "ransomware", "credential", "exfiltration",
  "lateral", "movement", "exploit", "zero-day", "payload",
  "C2", "callback", "spyware", "trojan", "botnet",
  "social", "engineering", "supply", "chain", "privilege",
  "escalation", "injection", "backdoor", "keylogger", "rootkit",
  "DDoS", "malware", "brute", "force", "spear-phish",
  "vishing", "smishing", "whaling", "pretexting", "baiting",
  "simulation", "prediction", "detection", "containment", "response",
  "mitigation", "war-game", "risk-score", "kill-chain", "FAIR",
  "incident", "dossier", "recon", "weaponize", "deliver",
  "OSINT", "DNS", "enum", "harvest", "pivot",
  "MFA", "SIEM", "EDR", "XDR", "SOC",
  "alert", "quarantine", "sandbox", "encrypt", "patch",
  "monitor", "harden", "isolate", "triage", "escalate",
]

// ─── Particle ────────────────────────────────────────────────

type Particle = {
  word: string
  font: string
  homeX: number; homeY: number  // grid position
  x: number; y: number
  vx: number; vy: number
  alpha: number
  rotation: number
}

// ─── Hook ────────────────────────────────────────────────────

export function useLogoAlive(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  config: { particleCount?: number; bg?: string } = {}
) {
  const { bg = "243,241,237" } = config
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    let running = true
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = canvas.clientWidth, H = canvas.clientHeight

    const mouse = { x: -999, y: -999, down: false }
    const shockwaves: { x: number; y: number; t: number; radius: number }[] = []

    function onMove(e: MouseEvent) {
      const r = canvas!.getBoundingClientRect()
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top
    }
    function onDown() { mouse.down = true }
    function onUp() {
      if (mouse.down) shockwaves.push({ x: mouse.x, y: mouse.y, t: 1.2, radius: 0 })
      mouse.down = false
    }
    function onLeave() { mouse.x = -999; mouse.y = -999; mouse.down = false }
    canvas.addEventListener("mousemove", onMove)
    canvas.addEventListener("mousedown", onDown)
    canvas.addEventListener("mouseup", onUp)
    canvas.addEventListener("mouseleave", onLeave)

    function resize() {
      W = canvas!.clientWidth; H = canvas!.clientHeight
      canvas!.width = W * dpr; canvas!.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    // ─── Create word grid filling the viewport ───

    // Build dense flowing text — whole readable words, packed into lines
    const FONT_SIZE = 12
    const LINE_HEIGHT = 17
    const FONT = `300 ${FONT_SIZE}px Georgia, serif`
    ctx.font = FONT
    const spaceW = ctx.measureText(" ").width

    const particles: Particle[] = []
    const lineCount = Math.ceil(H / LINE_HEIGHT) + 2
    let wordIdx = 0

    for (let row = 0; row < lineCount; row++) {
      const y = row * LINE_HEIGHT
      let x = 0

      while (x < W + 100) {
        const word = WORDS[wordIdx % WORDS.length]!
        wordIdx++
        const wordW = ctx.measureText(word).width

        particles.push({
          word,
          font: FONT,
          homeX: x,
          homeY: y,
          x,
          y,
          vx: 0,
          vy: 0,
          alpha: 0.20,
          rotation: 0,
        })

        x += wordW + spaceW
      }
    }

    // ─── Precompute: binary mask — inside logo = hidden ─────

    const PATH_CLEAR = 22  // half-width of the logo stroke
    const ALPHA = 0.18

    // For each particle, precompute: is it inside the logo? What color?
    const meta: { inside: boolean; alpha: number; r: number; g: number; b: number }[] = []

    const redPath = PATHS[1]!, tealPath = PATHS[2]!
    for (const p of particles) {
      const d = distToLogo(p.homeX, p.homeY, W, H)
      const inside = d < PATH_CLEAR

      // Color tint near path edges
      let r = 130, g = 120, b = 110
      if (!inside) {
        let rdMin = Infinity, tdMin = Infinity
        for (let ti = 0; ti <= 12; ti++) {
          const t = ti / 12
          const rx = bez(t, redPath.p0.x, redPath.p1.x, redPath.p2.x, redPath.p3.x) * W
          const ry = bez(t, redPath.p0.y, redPath.p1.y, redPath.p2.y, redPath.p3.y) * H
          const rd = Math.sqrt((p.homeX - rx) ** 2 + (p.homeY - ry) ** 2)
          if (rd < rdMin) rdMin = rd
          const txp = bez(t, tealPath.p0.x, tealPath.p1.x, tealPath.p2.x, tealPath.p3.x) * W
          const typ = bez(t, tealPath.p0.y, tealPath.p1.y, tealPath.p2.y, tealPath.p3.y) * H
          const td = Math.sqrt((p.homeX - txp) ** 2 + (p.homeY - typ) ** 2)
          if (td < tdMin) tdMin = td
        }
        const colorZone = PATH_CLEAR * 4
        if (rdMin < colorZone) {
          const blend = 1 - rdMin / colorZone
          r = Math.floor(130 + 80 * blend); g = Math.floor(120 - 40 * blend); b = Math.floor(110 - 40 * blend)
        } else if (tdMin < colorZone) {
          const blend = 1 - tdMin / colorZone
          r = Math.floor(130 - 40 * blend); g = Math.floor(120 + 50 * blend); b = Math.floor(110 + 45 * blend)
        }
      }

      meta.push({ inside, alpha: ALPHA, r, g, b })
    }

    // ─── State ───────────────────────────────────

    let lastTime = performance.now()
    let time = 0
    let needsRedraw = true // only redraw when something moves

    // ─── Frame ───────────────────────────────────

    function frame(now: number) {
      if (!running) return
      const dt = Math.min((now - lastTime) / 1000, 0.05)
      lastTime = now
      time += dt

      // Update shockwaves
      for (let i = shockwaves.length - 1; i >= 0; i--) {
        shockwaves[i]!.radius += dt * 450
        shockwaves[i]!.t -= dt * 0.7
        if (shockwaves[i]!.t <= 0) { shockwaves.splice(i, 1); needsRedraw = true }
      }
      if (shockwaves.length > 0) needsRedraw = true

      // Check if any particle is displaced — if so we need physics
      let anyDisplaced = false
      for (const p of particles) {
        const d = Math.abs(p.x - p.homeX) + Math.abs(p.y - p.homeY)
        if (d > 0.5 || Math.abs(p.vx) > 0.5 || Math.abs(p.vy) > 0.5) { anyDisplaced = true; break }
      }

      const mouseNear = mouse.x > 0
      if (!mouseNear && !anyDisplaced && !needsRedraw && shockwaves.length === 0) {
        rafRef.current = requestAnimationFrame(frame)
        return
      }
      needsRedraw = false

      // Clear
      ctx.fillStyle = `rgb(${bg})`
      ctx.fillRect(0, 0, W, H)

      ctx.textAlign = "left"
      ctx.textBaseline = "top"

      const mouseR = mouse.down ? 200 : 130

      ctx.font = FONT

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!
        const m = meta[i]!

        // Skip characters inside the logo — they're the cutout
        if (m.inside) continue

        // ── Mouse/shockwave forces (only near cursor) ──

        const mdx = p.x - mouse.x, mdy = p.y - mouse.y
        const mDist = Math.sqrt(mdx * mdx + mdy * mdy)

        if (mDist < mouseR && mDist > 1 && mouseNear) {
          const prox = 1 - mDist / mouseR
          const force = mouse.down ? prox * prox * 600 : prox * prox * 350
          p.vx += (mdx / mDist) * force * dt
          p.vy += (mdy / mDist) * force * dt
          p.rotation += (mdx > 0 ? 1 : -1) * prox * 3 * dt
          needsRedraw = true
        }

        for (const sw of shockwaves) {
          const sdx = p.x - sw.x, sdy = p.y - sw.y
          const sd = Math.sqrt(sdx * sdx + sdy * sdy)
          const ringDist = Math.abs(sd - sw.radius)
          if (ringDist < 70 && sd > 1) {
            const push = (1 - ringDist / 70) * sw.t * 250
            p.vx += (sdx / sd) * push * dt
            p.vy += (sdy / sd) * push * dt
            p.rotation += (Math.random() - 0.5) * 2 * sw.t * dt
          }
        }

        // ── Spring back to home (only if displaced) ──

        const dx = p.homeX - p.x, dy = p.homeY - p.y
        const dist = Math.abs(dx) + Math.abs(dy)
        if (dist > 0.3 || Math.abs(p.vx) > 0.3 || Math.abs(p.vy) > 0.3) {
          p.vx += dx * 6; p.vy += dy * 6
          p.vx *= 0.88; p.vy *= 0.88
          p.x += p.vx * dt; p.y += p.vy * dt
          p.rotation *= 0.92
          needsRedraw = true
        } else {
          p.x = p.homeX; p.y = p.homeY
          p.vx = 0; p.vy = 0; p.rotation = 0
        }

        // ── Draw ──

        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
        const alpha = speed > 20 ? Math.min(0.5, m.alpha + (speed - 20) * 0.003) : m.alpha

        if (Math.abs(p.rotation) > 0.01) {
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(p.rotation)
          ctx.globalAlpha = alpha
          ctx.fillStyle = `rgb(${m.r},${m.g},${m.b})`
          ctx.fillText(p.word, 0, 0)
          ctx.restore()
        } else {
          ctx.globalAlpha = alpha
          ctx.fillStyle = `rgb(${m.r},${m.g},${m.b})`
          ctx.fillText(p.word, p.x, p.y)
        }
      }

      ctx.globalAlpha = 1
      rafRef.current = requestAnimationFrame(frame)
    }

    rafRef.current = requestAnimationFrame(frame)
    return () => {
      running = false
      cancelAnimationFrame(rafRef.current)
      canvas.removeEventListener("mousemove", onMove)
      canvas.removeEventListener("mousedown", onDown)
      canvas.removeEventListener("mouseup", onUp)
      canvas.removeEventListener("mouseleave", onLeave)
    }
  }, [canvasRef, bg])
}
