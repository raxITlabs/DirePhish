"use client"

import { useState } from "react"
import TerminalFrame from "@/app/components/ascii/TerminalFrame"
import AsciiLogo from "@/app/components/ascii/AsciiLogo"
import VideoAscii from "@/app/components/ascii/VideoAscii"
import ParticleField from "@/app/components/ascii/ParticleField"
import AsciiRiskScore from "@/app/components/ascii/AsciiRiskScore"
import BackgroundGrain from "@/app/components/ascii/BackgroundGrain"
import AsciiSpinner from "@/app/components/ascii/AsciiSpinner"
import BackgroundHook from "@/app/components/ascii/BackgroundHook"
import KillChainBackground from "@/app/components/ascii/KillChainBackground"
import EmailRain from "@/app/components/ascii/EmailRain"
import LogoAlive from "@/app/components/ascii/LogoAlive"
import AsciiWatermark from "@/app/components/ascii/AsciiWatermark"
import EmailViewportSim from "@/app/components/ascii/EmailViewportSim"
import MCVariationHeatmap from "@/app/components/ascii/MCVariationHeatmap"
import {
  AsciiSectionHeader,
  AsciiStatus,
  AsciiMetric,
  AsciiProgressBar,
  AsciiCard,
  AsciiDivider,
  AsciiSkeleton,
  AsciiTree,
  AsciiAccordion,
  AsciiBadge,
  AsciiTimeline,
  AsciiMetricCard,
  AsciiTable,
  AsciiAlert,
  AsciiTabBar,
  AsciiEmptyState,
} from "@/app/components/ascii/DesignSystem"

function TabBarDemo() {
  const [activeTab, setActiveTab] = useState("executive")
  return (
    <div className="space-y-3 max-w-lg">
      <div className="border border-border/20 rounded-lg overflow-hidden">
        <AsciiTabBar
          tabs={[
            { key: "executive", label: "Executive" },
            { key: "technical", label: "Technical" },
            { key: "board", label: "Board" },
            { key: "ciso", label: "CISO" },
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        <div className="px-3 py-3 border-t border-border/10">
          <p className="font-mono text-xs text-foreground">
            Active view: <AsciiBadge>{activeTab}</AsciiBadge>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function AsciiTestPage() {
  const [fakeLoading, setFakeLoading] = useState(false)

  const simulateLoading = () => {
    setFakeLoading(true)
    setTimeout(() => setFakeLoading(false), 3000)
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      {/* Background grain — visible on the page behind everything */}
      <BackgroundGrain opacity={0.025} />

      {/* Page header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Variable Typographic ASCII Art
        </h1>
        <p className="text-sm text-muted-foreground font-mono">
          Powered by{" "}
          <a
            href="https://github.com/chenglou/pretext"
            target="_blank"
            rel="noopener noreferrer"
            className="text-royal-azure-400 hover:underline"
          >
            @chenglou/pretext
          </a>{" "}
          — text measurement without DOM reflow
        </p>
      </div>

      {/* ── Design System: Hybrid Accents ── */}
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            Design System — Hybrid Accents
          </h2>
          <p className="text-xs text-muted-foreground font-mono">
            ASCII character accents as a cohesive design language.
            Drop these components anywhere in the app.
          </p>
        </div>

        {/* Section Headers */}
        <div className="space-y-4">
          <AsciiSectionHeader>Kill Chain Analysis</AsciiSectionHeader>
          <AsciiSectionHeader sigil="›">Risk Assessment</AsciiSectionHeader>
          <AsciiSectionHeader sigil="▸">Monte Carlo Results</AsciiSectionHeader>
        </div>

        <AsciiDivider variant="labeled" label="§" />

        {/* Status Indicators */}
        <div className="space-y-3">
          <AsciiSectionHeader sigil="●">Status Indicators</AsciiSectionHeader>
          <div className="flex flex-wrap gap-6">
            <AsciiStatus status="complete" label="Recon" />
            <AsciiStatus status="complete" label="Weaponize" />
            <AsciiStatus status="running" label="Deliver" />
            <AsciiStatus status="pending" label="Exploit" />
            <AsciiStatus status="failed" label="C2 Channel" />
          </div>
        </div>

        <AsciiDivider variant="dots" />

        {/* Metric Labels */}
        <div className="space-y-3">
          <AsciiSectionHeader sigil="»">Metrics &amp; Values</AsciiSectionHeader>
          <div className="max-w-sm space-y-1">
            <AsciiMetric label="annual loss expectancy" value="$4.2M" valueColor="text-destructive" />
            <AsciiMetric label="confidence" value="87%" valueColor="text-primary" />
            <AsciiMetric label="attack vectors" value="12" />
            <AsciiMetric label="mean time to breach" value="4h 22m" valueColor="text-verdigris-500" />
            <AsciiMetric label="monte carlo runs" value="500" />
          </div>
        </div>

        <AsciiDivider variant="dots" />

        {/* Progress Bars */}
        <div className="space-y-3">
          <AsciiSectionHeader sigil="█">Progress &amp; Confidence</AsciiSectionHeader>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-muted-foreground w-24">Kill chain</span>
              <AsciiProgressBar value={75} width={24} color="text-verdigris-500" />
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-muted-foreground w-24">Confidence</span>
              <AsciiProgressBar value={87} width={24} color="text-primary" />
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-muted-foreground w-24">Risk score</span>
              <AsciiProgressBar value={92} width={24} color="text-destructive" />
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-muted-foreground w-24">Simulation</span>
              <AsciiProgressBar value={33} width={24} color="text-primary" />
            </div>
          </div>
        </div>

        <AsciiDivider variant="dots" />

        {/* Cards with Corner Marks */}
        <div className="space-y-3">
          <AsciiSectionHeader sigil="┌">Card Corner Marks</AsciiSectionHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-2">
            <AsciiCard>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold">Spear-phishing via LinkedIn</span>
                  <AsciiStatus status="complete" showLabel={false} />
                </div>
                <AsciiMetric label="targets" value="3" sigil="›" />
                <AsciiMetric label="success rate" value="67%" sigil="›" valueColor="text-primary" />
                <AsciiProgressBar value={67} width={16} color="text-primary" />
              </div>
            </AsciiCard>
            <AsciiCard>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold">Credential Harvesting</span>
                  <AsciiStatus status="running" showLabel={false} />
                </div>
                <AsciiMetric label="pages deployed" value="2" sigil="›" />
                <AsciiMetric label="clicks" value="1" sigil="›" valueColor="text-destructive" />
                <AsciiProgressBar value={40} width={16} color="text-primary" />
              </div>
            </AsciiCard>
          </div>
        </div>

        <AsciiDivider variant="dots" />

        {/* Divider Variants */}
        <div className="space-y-3">
          <AsciiSectionHeader sigil="─">Divider Variants</AsciiSectionHeader>
          <div className="space-y-4 py-2">
            <div>
              <span className="font-mono text-[10px] text-muted-foreground">solid:</span>
              <AsciiDivider variant="solid" />
            </div>
            <div>
              <span className="font-mono text-[10px] text-muted-foreground">dots:</span>
              <AsciiDivider variant="dots" />
            </div>
            <div>
              <span className="font-mono text-[10px] text-muted-foreground">dashed:</span>
              <AsciiDivider variant="dashed" />
            </div>
            <div>
              <span className="font-mono text-[10px] text-muted-foreground">labeled:</span>
              <AsciiDivider variant="labeled" label="FINDINGS" />
            </div>
          </div>
        </div>

        <AsciiDivider variant="dots" />

        {/* Loading Skeletons */}
        <div className="space-y-3">
          <AsciiSectionHeader sigil="╌">Loading Skeletons</AsciiSectionHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <span className="font-mono text-[10px] text-muted-foreground mb-2 block">Text content loading:</span>
              <AsciiSkeleton lines={4} widths={[100, 95, 88, 55]} />
            </div>
            <div>
              <span className="font-mono text-[10px] text-muted-foreground mb-2 block">Metric card loading:</span>
              <AsciiSkeleton lines={3} widths={[60, 40, 80]} />
            </div>
          </div>
        </div>

        <AsciiDivider variant="dots" />

        {/* Tree Hierarchy */}
        <div className="space-y-3">
          <AsciiSectionHeader sigil="├">Tree Hierarchy</AsciiSectionHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AsciiTree
              nodes={[
                {
                  label: "Reconnaissance",
                  status: "complete",
                  children: [
                    { label: "LinkedIn OSINT", status: "complete" },
                    { label: "DNS enumeration", status: "complete" },
                    { label: "Email harvesting", status: "complete" },
                  ],
                },
                {
                  label: "Weaponization",
                  status: "complete",
                  children: [
                    { label: "Phishing template", status: "complete" },
                    { label: "Credential harvester", status: "complete" },
                  ],
                },
                {
                  label: "Delivery",
                  status: "running",
                  children: [
                    { label: "Email to CFO", status: "running" },
                    { label: "Email to CTO", status: "pending" },
                  ],
                },
                {
                  label: "Exploitation",
                  status: "pending",
                  children: [
                    { label: "Credential theft", status: "pending" },
                    { label: "Lateral movement", status: "pending" },
                  ],
                },
              ]}
            />
            <AsciiTree
              nodes={[
                {
                  label: "FAIR Loss Model",
                  children: [
                    {
                      label: "Loss Event Frequency",
                      children: [
                        { label: "Threat Event Frequency" },
                        { label: "Vulnerability" },
                      ],
                    },
                    {
                      label: "Loss Magnitude",
                      children: [
                        { label: "Primary Loss", status: "complete" },
                        { label: "Secondary Loss", status: "running" },
                      ],
                    },
                  ],
                },
              ]}
            />
          </div>
        </div>
      </div>

      <AsciiDivider variant="labeled" label="EXTENDED COMPONENTS" />

      {/* ── Extended Design System ── */}
      <div className="space-y-6">
        {/* Accordion */}
        <div className="space-y-3">
          <AsciiSectionHeader sigil="▼">Accordion</AsciiSectionHeader>
          <div className="space-y-2 max-w-lg">
            <AsciiAccordion title="Reconnaissance" count={3} defaultOpen>
              <div className="pt-2 space-y-1">
                <AsciiMetric label="LinkedIn profiles scraped" value="47" />
                <AsciiMetric label="emails harvested" value="12" />
                <AsciiMetric label="subdomains found" value="8" />
              </div>
            </AsciiAccordion>
            <AsciiAccordion title="Weaponization" count={2}>
              <div className="pt-2 space-y-1">
                <AsciiMetric label="phishing templates" value="2" />
                <AsciiMetric label="credential pages" value="1" />
              </div>
            </AsciiAccordion>
            <AsciiAccordion title="Delivery" count={0}>
              <div className="pt-2">
                <AsciiEmptyState title="No delivery attempts yet" sigil="○" />
              </div>
            </AsciiAccordion>
          </div>
        </div>

        <AsciiDivider variant="dots" />

        {/* Badges */}
        <div className="space-y-3">
          <AsciiSectionHeader sigil="[ ]">Badges</AsciiSectionHeader>
          <div className="flex flex-wrap gap-3">
            <AsciiBadge>default</AsciiBadge>
            <AsciiBadge variant="secondary">secondary</AsciiBadge>
            <AsciiBadge variant="destructive">critical</AsciiBadge>
            <AsciiBadge variant="success">success</AsciiBadge>
            <AsciiBadge variant="muted">muted</AsciiBadge>
          </div>
          <div className="flex flex-wrap gap-3">
            <AsciiBadge bracket="angle">angle</AsciiBadge>
            <AsciiBadge bracket="paren">paren</AsciiBadge>
            <AsciiBadge bracket="none" variant="destructive">no bracket</AsciiBadge>
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            Inline usage: Spear-phishing <AsciiBadge variant="destructive">HIGH</AsciiBadge> via LinkedIn <AsciiBadge variant="success">BLOCKED</AsciiBadge>
          </p>
        </div>

        <AsciiDivider variant="dots" />

        {/* Timeline */}
        <div className="space-y-3">
          <AsciiSectionHeader sigil="│">Timeline</AsciiSectionHeader>
          <div className="max-w-lg">
            <AsciiTimeline
              events={[
                { time: "00:00", label: "Simulation started", description: "Attacker agent initialized with LinkedIn OSINT data", status: "complete" },
                { time: "00:14", label: "Recon complete", description: "47 profiles, 12 emails, 3 high-value targets identified", status: "complete" },
                { time: "01:22", label: "Phishing email sent", description: "Spear-phishing email to CFO impersonating IT security", status: "complete" },
                { time: "01:58", label: "Credential harvested", description: "CFO entered credentials on fake login page", status: "failed" },
                { time: "02:15", label: "Lateral movement", description: "Attempting to pivot to finance share drive", status: "running" },
                { time: "—", label: "Data exfiltration", status: "pending" },
              ]}
            />
          </div>
        </div>

        <AsciiDivider variant="dots" />

        {/* Metric Cards */}
        <div className="space-y-3">
          <AsciiSectionHeader sigil="┌»">Metric Cards</AsciiSectionHeader>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <AsciiMetricCard label="Risk Score" value="87" icon="§" valueColor="text-destructive" sublabel="Critical" />
            <AsciiMetricCard label="Loss Estimate" value="$4.2M" icon="»" valueColor="text-foreground" sublabel="Annual (FAIR)" />
            <AsciiMetricCard label="Attack Vectors" value="12" icon="▸" sublabel="3 critical" />
            <AsciiMetricCard label="Mean TTB" value="4h 22m" icon="●" valueColor="text-primary" sublabel="Time to breach" />
          </div>
        </div>

        <AsciiDivider variant="dots" />

        {/* Table */}
        <div className="space-y-3">
          <AsciiSectionHeader sigil="┬">Table</AsciiSectionHeader>
          <AsciiTable
            columns={[
              { key: "step", header: "Step" },
              { key: "technique", header: "Technique" },
              { key: "success", header: "Success", align: "right" },
              { key: "time", header: "Time", align: "right" },
            ]}
            rows={[
              { step: "Recon", technique: "LinkedIn OSINT", success: "100%", time: "14m" },
              { step: "Weaponize", technique: "Credential harvester", success: "100%", time: "8m" },
              { step: "Deliver", technique: "Spear-phish email", success: "67%", time: "36m" },
              { step: "Exploit", technique: "Cred theft + pivot", success: "33%", time: "22m" },
              { step: "C2", technique: "DNS tunnel", success: "0%", time: "—" },
            ]}
            ariaLabel="Kill chain step performance"
          />
        </div>

        <AsciiDivider variant="dots" />

        {/* Alerts */}
        <div className="space-y-3">
          <AsciiSectionHeader sigil="⚠">Alerts</AsciiSectionHeader>
          <div className="space-y-2 max-w-lg">
            <AsciiAlert variant="info" title="Simulation paused">
              Waiting for human confirmation before proceeding to exploitation phase.
            </AsciiAlert>
            <AsciiAlert variant="warning" title="High confidence attack path">
              87% of Monte Carlo runs result in successful credential harvesting.
            </AsciiAlert>
            <AsciiAlert variant="error" title="Critical finding">
              CFO credentials exposed. No MFA enforcement detected on VPN gateway.
            </AsciiAlert>
            <AsciiAlert variant="success">
              Blue team containment procedure activated within SLA threshold.
            </AsciiAlert>
          </div>
        </div>

        <AsciiDivider variant="dots" />

        {/* Tab Bar */}
        <div className="space-y-3">
          <AsciiSectionHeader sigil="│">Tab Bar</AsciiSectionHeader>
          <TabBarDemo />
        </div>

        <AsciiDivider variant="dots" />

        {/* Empty State */}
        <div className="space-y-3">
          <AsciiSectionHeader sigil="○">Empty State</AsciiSectionHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-border/20 rounded-lg">
              <AsciiEmptyState
                title="No findings yet"
                description="Run a simulation to see attack findings here."
                sigil="§"
              />
            </div>
            <div className="border border-border/20 rounded-lg">
              <AsciiEmptyState
                title="No timeline events"
                description="Events will appear as the simulation progresses."
                sigil="│"
                action={
                  <button className="font-mono text-xs text-primary hover:underline">
                    Start simulation
                  </button>
                }
              />
            </div>
          </div>
        </div>
      </div>

      <AsciiDivider variant="labeled" label="BRAND TOUCHES" />

      {/* ── Brand Touches ── */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold tracking-tight text-foreground">
          Brand Touches
        </h2>
        <p className="text-xs text-muted-foreground font-mono">
          Minimal decorative elements for production integration.
          Background grain is already active on this page.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Spinner demo */}
          <TerminalFrame title="ascii-spinner :: loading indicator">
            <div className="space-y-4 py-2">
              <p className="text-xs font-mono text-pitch-black-500">
                Cycling brightness ramp: · : ; = + # % @
              </p>
              <div className="flex items-center gap-4">
                <button
                  onClick={simulateLoading}
                  disabled={fakeLoading}
                  className="bg-primary text-primary-foreground px-4 py-1.5 rounded-lg font-mono text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-70 disabled:cursor-not-allowed min-w-[120px]"
                >
                  {fakeLoading ? (
                    <>
                      <AsciiSpinner /> Analyzing
                    </>
                  ) : (
                    "Analyze"
                  )}
                </button>
                <span className="text-xs font-mono text-pitch-black-500">
                  {fakeLoading ? "Loading for 3s..." : "Click to demo"}
                </span>
              </div>
              <div className="flex items-center gap-3 text-tuscan-sun-400">
                <span className="text-xs font-mono text-pitch-black-500">Standalone:</span>
                <AsciiSpinner className="text-lg" />
                <AsciiSpinner className="text-2xl" />
                <AsciiSpinner className="text-3xl" />
              </div>
            </div>
          </TerminalFrame>

          {/* Watermark demo */}
          <TerminalFrame title="ascii-watermark :: empty state decoration">
            <div className="space-y-3 py-2">
              <p className="text-xs font-mono text-pitch-black-500">
                Faint ASCII art for empty states. Nearly subliminal.
              </p>
              {/* Simulated sidebar empty state */}
              <div className="bg-pitch-black-900/50 rounded-lg p-4 text-center max-w-[16rem] mx-auto">
                <p className="text-sm text-pitch-black-400 font-mono">No runs yet</p>
                <p className="text-xs text-pitch-black-500 font-mono mt-1">
                  Start an analysis to see history here
                </p>
                <div className="mt-4">
                  <AsciiWatermark />
                </div>
              </div>
              {/* Higher opacity preview */}
              <p className="text-xs font-mono text-pitch-black-500 text-center mt-2">
                Same art at 20% opacity (for visibility):
              </p>
              <div className="flex justify-center">
                <AsciiWatermark opacity={0.2} />
              </div>
            </div>
          </TerminalFrame>
        </div>
      </div>

      {/* ── Product Features (PM-approved) ── */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold tracking-tight text-foreground">
          Product Features
        </h2>
        <p className="text-xs text-muted-foreground font-mono">
          Features using pretext for real product value, not just visual flair.
        </p>
      </div>

      {/* Email Viewport Simulator */}
      <TerminalFrame title="email-viewport :: phishing email reflow simulator">
        <div className="space-y-2">
          <p className="text-xs font-mono text-pitch-black-500 mb-3">
            Drag the slider to see how a phishing email reflows at different viewport widths.
            URL line breaks are flagged — a layout-based phishing tell.
          </p>
          <EmailViewportSim />
        </div>
      </TerminalFrame>

      {/* MC Variation Heatmap */}
      <TerminalFrame title="mc-heatmap :: monte carlo variation overlay">
        <div className="space-y-2">
          <p className="text-xs font-mono text-pitch-black-500 mb-3">
            6 Monte Carlo attack path variations overlaid. Consensus regions appear crisp,
            divergence points scatter into a cloud. Hover to isolate one variation.
          </p>
          <MCVariationHeatmap />
        </div>
      </TerminalFrame>

      <hr className="border-border/30" />

      {/* ── Engine Demos ── */}
      <div className="space-y-1">
        <h2 className="text-lg font-bold tracking-tight text-foreground">
          Engine Demos
        </h2>
        <p className="text-xs text-muted-foreground font-mono">
          Pretext ASCII art engine showcases.
        </p>
      </div>

      {/* Demo 1: ASCII Logo */}
      <TerminalFrame title="direphish-logo :: variable-weight ascii">
        <AsciiLogo />
      </TerminalFrame>

      {/* Demo 2: Video ASCII Art */}
      <TerminalFrame title="video-ascii :: fireship-style text sculpting">
        <div className="space-y-2">
          <p className="text-xs font-mono text-pitch-black-500 mb-3">
            Video brightness sculpts itself from source text. Bright pixels reveal
            characters, dark pixels hide them. Toggle webcam for the full experience.
          </p>
          <VideoAscii />
        </div>
      </TerminalFrame>

      {/* Demo 3: Particle Field */}
      <TerminalFrame title="particle-field :: attractor orbits">
        <div className="space-y-2">
          <p className="text-xs font-mono text-pitch-black-500 mb-3">
            120 particles orbit two attractors. Brightness deposited into an oversampled
            field, decayed each frame, mapped to weighted characters.
          </p>
          <ParticleField />
        </div>
      </TerminalFrame>

      {/* Demo 4: Risk Score */}
      <TerminalFrame title="risk-score :: interactive ascii number">
        <div className="space-y-2">
          <p className="text-xs font-mono text-pitch-black-500 mb-3">
            Risk score rendered as variable-weight ASCII art. Color shifts from
            verdigris (safe) to tuscan sun (caution) to burnt peach (critical).
          </p>
          <AsciiRiskScore />
        </div>
      </TerminalFrame>

      <AsciiDivider variant="labeled" label="HOMEPAGE BACKGROUND — LOGO ALIVE" />

      {/* ── Logo Alive ── */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold tracking-tight text-foreground">
          Logo Alive — Forking Attack Path
        </h2>
        <p className="text-xs text-muted-foreground font-mono">
          The DirePhish logo as a living canvas. Characters stream from origin through a fork —
          red path (threats) shatters, teal path (predictions) settles. Move mouse to scatter.
          Click for shockwave. Mouse near fork influences the split ratio.
        </p>
      </div>

      {/* Logo Alive on light background — simulated homepage */}
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs font-semibold text-foreground">Homepage Preview</span>
          <span className="font-mono text-[10px] text-muted-foreground">— move mouse &amp; click to interact</span>
        </div>
        <div className="relative rounded-xl border border-border/30 overflow-hidden bg-background" style={{ height: "520px" }}>
          <LogoAlive />
          {/* Mock composer card at the fork point */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ paddingLeft: "10%" }}>
            <div className="bg-card/80 backdrop-blur-sm rounded-xl border border-border/30 overflow-hidden w-full max-w-md shadow-sm pointer-events-none">
              <div className="text-center py-4 px-6">
                <p className="text-lg font-bold tracking-tight text-foreground">Predict what breaks next.</p>
                <p className="text-xs text-muted-foreground font-mono mt-1">Predictive incident response simulation.</p>
              </div>
              <div className="flex items-center justify-between px-3 py-2 border-t border-border/20">
                <div className="flex gap-1 rounded-lg bg-muted/50 p-0.5">
                  <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-card text-foreground shadow-sm">Test</span>
                  <span className="px-2.5 py-1 rounded-md text-xs font-mono text-muted-foreground">Quick</span>
                  <span className="px-2.5 py-1 rounded-md text-xs font-mono text-muted-foreground">Standard</span>
                </div>
                <span className="bg-primary text-primary-foreground px-4 py-1.5 rounded-lg font-mono text-xs">Analyze</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Logo Alive on dark background */}
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs font-semibold text-foreground">Dark Variant</span>
          <span className="font-mono text-[10px] text-muted-foreground">— same animation, dark bg for contrast</span>
        </div>
        <div className="rounded-xl overflow-hidden border border-border/30" style={{ height: "520px", background: "rgb(15,14,13)" }}>
          <LogoAlive bg="15,14,13" />
        </div>
      </div>

      <AsciiDivider variant="labeled" label="EARLIER PROTOTYPES" />

      {/* ── Earlier Options ── */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold tracking-tight text-foreground">
          Earlier Prototypes
        </h2>
        <p className="text-xs text-muted-foreground font-mono">
          Previous canvas experiments — Hook, Kill Chain, Email Rain.
        </p>
      </div>

      {/* Option 1: The Hook — Royal Azure on light bg */}
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs font-semibold text-foreground">Option 1: The Hook</span>
          <span className="font-mono text-[10px] text-muted-foreground">— Royal Azure blue, no extra container opacity</span>
        </div>
        <div className="relative rounded-xl border border-border/30 overflow-hidden bg-background" style={{ height: "520px" }}>
          <div className="absolute inset-0 flex items-center justify-center">
            <BackgroundHook cols={70} rows={35} colorClass="text-royal-azure-500" glow={false} />
          </div>
          <div className="relative z-10 flex flex-col items-center justify-center h-full px-6">
            <div className="text-center space-y-2 mb-6">
              <h3 className="text-2xl font-bold tracking-tight text-foreground">Predict what breaks next.</h3>
              <p className="text-sm text-muted-foreground font-mono">Predictive incident response simulation.</p>
            </div>
            <div className="bg-card rounded-xl border border-border/30 overflow-hidden w-full max-w-md shadow-sm">
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="text-muted-foreground/50 text-sm">🔗</span>
                <span className="text-sm font-mono text-muted-foreground/40">company.com</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 border-t border-border/20">
                <div className="flex gap-1 rounded-lg bg-muted/50 p-0.5">
                  <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-card text-foreground shadow-sm">Test</span>
                  <span className="px-2.5 py-1 rounded-md text-xs font-mono text-muted-foreground">Quick</span>
                  <span className="px-2.5 py-1 rounded-md text-xs font-mono text-muted-foreground">Standard</span>
                </div>
                <span className="bg-primary text-primary-foreground px-4 py-1.5 rounded-lg font-mono text-xs">Analyze</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Option 2: Kill Chain — warm neutral on light bg */}
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs font-semibold text-foreground">Option 2: Network Breach</span>
          <span className="font-mono text-[10px] text-muted-foreground">— Pitch Black warm neutral, structural watermark feel</span>
        </div>
        <div className="relative rounded-xl border border-border/30 overflow-hidden bg-background" style={{ height: "520px" }}>
          <div className="absolute inset-0 flex items-center justify-center">
            <KillChainBackground cols={70} rows={35} colorClass="text-pitch-black-700" glow={false} />
          </div>
          <div className="relative z-10 flex flex-col items-center justify-center h-full px-6">
            <div className="text-center space-y-2 mb-6">
              <h3 className="text-2xl font-bold tracking-tight text-foreground">Predict what breaks next.</h3>
              <p className="text-sm text-muted-foreground font-mono">Predictive incident response simulation.</p>
            </div>
            <div className="bg-card rounded-xl border border-border/30 overflow-hidden w-full max-w-md shadow-sm">
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="text-muted-foreground/50 text-sm">🔗</span>
                <span className="text-sm font-mono text-muted-foreground/40">company.com</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 border-t border-border/20">
                <div className="flex gap-1 rounded-lg bg-muted/50 p-0.5">
                  <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-card text-foreground shadow-sm">Test</span>
                  <span className="px-2.5 py-1 rounded-md text-xs font-mono text-muted-foreground">Quick</span>
                  <span className="px-2.5 py-1 rounded-md text-xs font-mono text-muted-foreground">Standard</span>
                </div>
                <span className="bg-primary text-primary-foreground px-4 py-1.5 rounded-lg font-mono text-xs">Analyze</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Option 3: Email Rain — Tuscan Sun gold on light bg */}
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs font-semibold text-foreground">Option 3: Email Rain</span>
          <span className="font-mono text-[10px] text-muted-foreground">— Tuscan Sun gold, phishing text fragments raining down</span>
        </div>
        <div className="relative rounded-xl border border-border/30 overflow-hidden bg-background" style={{ height: "520px" }}>
          <div className="absolute inset-0 flex items-center justify-center">
            <EmailRain cols={70} rows={35} colorClass="text-tuscan-sun-500" glow={false} />
          </div>
          <div className="relative z-10 flex flex-col items-center justify-center h-full px-6">
            <div className="text-center space-y-2 mb-6">
              <h3 className="text-2xl font-bold tracking-tight text-foreground">Predict what breaks next.</h3>
              <p className="text-sm text-muted-foreground font-mono">Predictive incident response simulation.</p>
            </div>
            <div className="bg-card rounded-xl border border-border/30 overflow-hidden w-full max-w-md shadow-sm">
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="text-muted-foreground/50 text-sm">🔗</span>
                <span className="text-sm font-mono text-muted-foreground/40">company.com</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 border-t border-border/20">
                <div className="flex gap-1 rounded-lg bg-muted/50 p-0.5">
                  <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-card text-foreground shadow-sm">Test</span>
                  <span className="px-2.5 py-1 rounded-md text-xs font-mono text-muted-foreground">Quick</span>
                  <span className="px-2.5 py-1 rounded-md text-xs font-mono text-muted-foreground">Standard</span>
                </div>
                <span className="bg-primary text-primary-foreground px-4 py-1.5 rounded-lg font-mono text-xs">Analyze</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Raw engine demos on dark backgrounds for contrast */}
      <AsciiDivider variant="labeled" label="DARK BACKGROUND VARIANTS" />
      <p className="text-xs text-muted-foreground font-mono">
        Same canvas animations on dark backgrounds — shows the full trail/glow effect.
      </p>
      <div className="space-y-4">
        <TerminalFrame title="the-hook :: dark">
          <div style={{ height: "400px", background: "rgb(20,18,16)" }}>
            <BackgroundHook color="rgba(196,163,90," />
          </div>
        </TerminalFrame>
        <TerminalFrame title="kill-chain :: dark">
          <div style={{ height: "400px", background: "rgb(20,18,16)" }}>
            <KillChainBackground color="rgba(196,163,90," />
          </div>
        </TerminalFrame>
        <TerminalFrame title="email-rain :: dark">
          <div style={{ height: "400px", background: "rgb(20,18,16)" }}>
            <EmailRain color="rgba(196,163,90," />
          </div>
        </TerminalFrame>
      </div>
    </div>
  )
}
