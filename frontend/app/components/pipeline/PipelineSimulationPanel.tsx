"use client";

import { useEffect, useRef, useState } from "react";
import type { SimulationStatus, AgentAction, ActivePressureState } from "@/app/types/status";
import type { GraphData } from "@/app/types";
import { Badge } from "@/app/components/ui/badge";

const ROLE_COLORS: Record<string, string> = {
  ir_lead: "bg-royal-azure-100 text-royal-azure-700",
  ciso: "bg-verdigris-100 text-verdigris-700",
  ceo: "bg-tuscan-sun-100 text-tuscan-sun-700",
  legal: "bg-burnt-peach-100 text-burnt-peach-700",
  vp_eng: "bg-sandy-brown-100 text-sandy-brown-700",
  cto: "bg-royal-azure-200 text-royal-azure-800",
  soc_analyst: "bg-verdigris-200 text-verdigris-800",
};

const ROLE_DOT_COLORS: Record<string, string> = {
  ir_lead: "bg-royal-azure-400",
  ciso: "bg-verdigris-400",
  ceo: "bg-tuscan-sun-400",
  legal: "bg-burnt-peach-400",
  vp_eng: "bg-sandy-brown-400",
  cto: "bg-royal-azure-500",
  soc_analyst: "bg-verdigris-500",
};

function getRoleColor(role: string) {
  return ROLE_COLORS[role] || "bg-pitch-black-100 text-pitch-black-700";
}

function getRoleDotColor(role: string) {
  return ROLE_DOT_COLORS[role] || "bg-pitch-black-400";
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-burnt-peach-100 text-burnt-peach-700",
  high: "bg-tuscan-sun-100 text-tuscan-sun-700",
  normal: "bg-verdigris-100 text-verdigris-700",
};

function getSeverityColor(severity: string) {
  return SEVERITY_COLORS[severity] || "bg-pitch-black-100 text-pitch-black-700";
}

function formatTime(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

function getActionContent(action: AgentAction): { content: string; meta?: string } {
  if (action.action === "send_email") {
    const subject = (action.args.subject as string) || "";
    const body = (action.args.body as string) || "";
    const to = (action.args.to as string) || "";
    const cc = (action.args.cc as string) || "";
    const meta = [to && `To: ${to}`, cc && `Cc: ${cc}`, subject && `Sub: ${subject}`]
      .filter(Boolean)
      .join(" · ");
    return { content: body, meta };
  }
  // Fallback chain: args.content → args.body → description (inject) → reason (arbiter) → complication (arbiter)
  const content =
    (action.args?.content as string) ||
    (action.args?.body as string) ||
    action.description ||
    action.reason ||
    action.complication ||
    "";
  return { content };
}

function getAgentName(action: AgentAction): string {
  return action.agent || (action.type === "inject" ? "SYSTEM" : action.type === "arbiter" ? "ARBITER" : "");
}


function getStatusStyle(status: string): string {
  switch (status) {
    case "running":
    case "starting":
      return "bg-verdigris-100 text-verdigris-700";
    case "completed":
      return "bg-pitch-black-100 text-pitch-black-600";
    case "failed":
    case "stopped":
      return "bg-burnt-peach-100 text-burnt-peach-700";
    default:
      return "bg-pitch-black-100 text-pitch-black-600";
  }
}

function getStatusMetricColor(status: string): string {
  switch (status) {
    case "running":
    case "starting":
      return "text-primary";
    case "completed":
      return "text-verdigris-700";
    case "failed":
    case "stopped":
      return "text-burnt-peach-700";
    default:
      return "text-foreground";
  }
}

type WorldTab = "all" | "slack" | "email" | "timeline";

const TAB_DOT_COLORS: Record<WorldTab, string> = {
  all: "bg-pitch-black-400",
  slack: "bg-royal-azure-400",
  email: "bg-tuscan-sun-400",
  timeline: "bg-verdigris-400",
};

interface PipelineSimulationPanelProps {
  simStatus: SimulationStatus;
  simActions: AgentAction[];
  graphData: GraphData;
  activeSimIndex: number;
  totalSims: number;
  scenarioTitle?: string;
  onSimChange?: (index: number) => void;
  contextHeader?: {
    title: string;
    subtitle?: string;
    changes?: string[];
  };
}

export default function PipelineSimulationPanel({
  simStatus,
  simActions,
  graphData,
  activeSimIndex,
  totalSims,
  scenarioTitle,
  onSimChange,
  contextHeader,
}: PipelineSimulationPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [activeWorld, setActiveWorld] = useState<WorldTab>("all");
  const [expandedActions, setExpandedActions] = useState<Set<number>>(new Set());

  const isLive = simStatus.status === "running" || simStatus.status === "starting";

  // Auto-scroll to bottom when new actions arrive — but only if user
  // is already near the bottom (within 150px). This prevents yanking
  // the user away from earlier messages they're reading.
  useEffect(() => {
    if (activeWorld === "timeline") return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 150) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [simActions.length, activeWorld]);

  // Filter actions by world tab (timeline uses all actions but different view)
  // Also exclude do_nothing actions — agent chose not to act, nothing to show
  const filteredActions = simActions
    .filter((a) => a.action !== "do_nothing")
    .filter((a) => {
      if (activeWorld === "all" || activeWorld === "timeline") return true;
      if (activeWorld === "slack") return a.action === "send_message";
      if (activeWorld === "email") return a.action === "send_email";
      return true;
    });

  const visibleActions = simActions.filter((a) => a.action !== "do_nothing");
  const slackCount = visibleActions.filter((a) => a.action === "send_message").length;
  const emailCount = visibleActions.filter((a) => a.action === "send_email").length;

  const worldTabs: { id: WorldTab; label: string; count: number }[] = [
    { id: "all", label: "All", count: visibleActions.length },
    { id: "slack", label: "Slack", count: slackCount },
    { id: "email", label: "Email", count: emailCount },
    { id: "timeline", label: "Timeline", count: visibleActions.length },
  ];

  const toggleExpand = (index: number) => {
    setExpandedActions((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Top accent bar */}
      <div className="h-0.5 bg-royal-azure-500 shrink-0" />

      {/* Fixed header */}
      <div className="px-5 py-4 border-b border-border/10 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm font-semibold text-foreground truncate">
            {scenarioTitle || "Simulation"}
          </h2>
          <span
            className={`flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-md shrink-0 ${getStatusStyle(simStatus.status)}`}
          >
            {isLive && (
              <span className="w-1.5 h-1.5 rounded-full bg-verdigris-600 animate-pulse-dot" />
            )}
            {isLive ? "Live" : simStatus.status}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1.5">
          {/* Simulation switcher */}
          {totalSims > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onSimChange?.(activeSimIndex - 1)}
                disabled={activeSimIndex === 0}
                className="w-5 h-5 rounded flex items-center justify-center text-xs font-mono bg-muted hover:bg-muted/80 text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Previous simulation"
              >
                ‹
              </button>
              <span className="text-xs font-mono text-muted-foreground px-1">
                Sim {activeSimIndex + 1} of {totalSims}
              </span>
              <button
                onClick={() => onSimChange?.(activeSimIndex + 1)}
                disabled={activeSimIndex === totalSims - 1}
                className="w-5 h-5 rounded flex items-center justify-center text-xs font-mono bg-muted hover:bg-muted/80 text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Next simulation"
              >
                ›
              </button>
            </div>
          )}
          <span className="text-xs font-mono text-muted-foreground">
            Round {simStatus.currentRound}/{simStatus.totalRounds}
          </span>
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-2 px-5 py-3 border-b border-border/10 shrink-0">
        <div className="text-center bg-muted/20 rounded-lg py-2">
          <div className="text-lg font-mono font-semibold text-foreground">
            {simStatus.currentRound}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            Round
          </div>
        </div>
        <div className="text-center bg-muted/20 rounded-lg py-2">
          <div className="text-lg font-mono font-semibold text-foreground">
            {simStatus.actionCount}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            Actions
          </div>
        </div>
        <div className="text-center bg-muted/20 rounded-lg py-2">
          <div className={`text-lg font-mono font-semibold capitalize ${getStatusMetricColor(simStatus.status)}`}>
            {simStatus.status}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            Status
          </div>
        </div>
      </div>

      {/* Pressures section */}
      {simStatus.pressures.length > 0 && (
        <div className="px-5 py-3 border-b border-border/10 shrink-0 space-y-2">
          <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            Pressures
          </div>
          <div className="flex flex-wrap gap-1.5">
            {simStatus.pressures.map((pressure, i) => (
              <Badge
                key={i}
                variant={
                  !pressure.triggered
                    ? "ghost"
                    : pressure.severity === "critical"
                      ? "destructive"
                      : pressure.severity === "high"
                        ? "warning"
                        : "success"
                }
                className={`text-[10px] font-mono ${!pressure.triggered ? "opacity-40" : ""}`}
              >
                {pressure.name}
                {pressure.value != null && ` (${pressure.value}${pressure.unit || ""})`}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Context header (for MC / CF modes) */}
      {contextHeader && (
        <div className="mx-5 mt-3 mb-1 rounded-lg border border-border/30 bg-card p-3 space-y-1.5 shrink-0">
          <h3 className="text-sm font-mono font-bold text-foreground">{contextHeader.title}</h3>
          {contextHeader.subtitle && (
            <p className="text-xs font-mono text-muted-foreground">{contextHeader.subtitle}</p>
          )}
          {contextHeader.changes && contextHeader.changes.length > 0 && (
            <ul className="space-y-0.5 mt-1">
              {contextHeader.changes.map((change, i) => (
                <li key={i} className="text-xs font-mono text-muted-foreground/80 flex items-center gap-1.5">
                  <span className="text-tuscan-sun-500">&#9658;</span> {change}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* World tabs */}
      <div className="px-5 py-2 border-b border-border/10 shrink-0 flex gap-1">
        {worldTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveWorld(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-mono rounded-md transition-colors ${
              activeWorld === tab.id
                ? "bg-royal-azure-100 text-royal-azure-700"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TAB_DOT_COLORS[tab.id]}`} />
            {tab.label}
            {tab.count > 0 && <span className="text-muted-foreground/50">{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* Scrollable content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
        {filteredActions.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-8 font-mono">
            Waiting for actions...
          </p>
        )}

        {activeWorld === "timeline" ? (
          <TimelineView actions={filteredActions} />
        ) : (
          <ActionFeed
            actions={filteredActions}
            expandedActions={expandedActions}
            onToggleExpand={toggleExpand}
          />
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/* ── Shared Renderers ── */

function InjectBanner({ action }: { action: AgentAction }) {
  return (
    <div className="rounded-lg bg-tuscan-sun-50 border border-tuscan-sun-200 px-3 py-2.5 text-xs font-mono my-1.5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm">⚠</span>
        <span className="text-tuscan-sun-700 font-bold uppercase text-[10px] tracking-wide">Inject</span>
        {action.kill_chain_step && (
          <span className="text-[10px] bg-tuscan-sun-100 text-tuscan-sun-700 px-1.5 py-0.5 rounded uppercase ml-auto">{action.kill_chain_step}</span>
        )}
      </div>
      <p className="text-tuscan-sun-600 leading-relaxed">{action.description || (action.args?.content as string)}</p>
    </div>
  );
}

function ArbiterBanner({ action }: { action: AgentAction }) {
  return (
    <div className="rounded-lg bg-verdigris-50 border border-verdigris-200 px-3 py-2.5 text-xs font-mono my-1.5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-verdigris-700 font-bold uppercase text-[10px] tracking-wide">~ Scenario</span>
        <span className="text-[10px] text-verdigris-500">{action.decision || "continue"}</span>
      </div>
      <p className="text-verdigris-600 leading-relaxed">{action.reason || action.complication}</p>
    </div>
  );
}

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2);
}

/* ── Slack-Style Message ── */

function SlackMessage({ action, expanded, onToggle }: {
  action: AgentAction; expanded: boolean; onToggle: () => void;
}) {
  const isThreatActor = action.role === "threat_actor" || action.type === "threat_actor";
  const isThread = action.action === "reply_in_thread";
  const { content } = getActionContent(action);
  const isLong = content.length > 300;
  const displayContent = isLong && !expanded ? content.slice(0, 300) + "..." : content;
  const time = formatTime(action.timestamp);
  const name = getAgentName(action);
  const initials = getInitials(name);

  const wrapper = isThread ? "ml-10 border-l-2 border-border/40 pl-3" : "";

  return (
    <div className={wrapper}>
      {isThread && (
        <div className="text-[10px] font-mono text-muted-foreground/50 mb-1">↳ Thread reply</div>
      )}
      <div className={`flex gap-2.5 ${isThread ? "py-1" : "py-2"}`}>
        <div className={`${isThread ? "w-6 h-6 text-[9px]" : "w-8 h-8 text-[11px]"} rounded-md flex-shrink-0 flex items-center justify-center font-bold text-white`}
          style={{ backgroundColor: getRoleHex(action.role) }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 mb-0.5">
            <span className={`font-semibold ${isThread ? "text-xs" : "text-sm"} text-foreground`}>
              {name}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0 rounded">{action.role}</span>
            <span className="text-[10px] font-mono text-muted-foreground/50 ml-auto tabular-nums">{time}</span>
          </div>
          <div className={`${isThread ? "text-xs" : "text-sm"} text-foreground/80 leading-relaxed whitespace-pre-wrap`}>
            {displayContent}
            {isLong && (
              <button onClick={onToggle} className="text-[10px] font-mono text-royal-azure-600 hover:text-royal-azure-500 ml-1">
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Threat Actor Message ── */

function ThreatActorMessage({ action, expanded, onToggle }: {
  action: AgentAction; expanded: boolean; onToggle: () => void;
}) {
  const { content } = getActionContent(action);
  const isLong = content.length > 300;
  const displayContent = isLong && !expanded ? content.slice(0, 300) + "..." : content;
  const time = formatTime(action.timestamp);
  const name = getAgentName(action);
  const initials = getInitials(name);
  const channel = action.world || "c2-channel";

  return (
    <div className="bg-burnt-peach-50 border border-burnt-peach-200 border-l-[3px] border-l-burnt-peach-500 rounded-lg overflow-hidden my-1.5">
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-8 h-8 rounded-md flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white bg-burnt-peach-500">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-semibold text-burnt-peach-700">{name}</span>
              <span className="text-[10px] font-mono text-burnt-peach-500 bg-burnt-peach-100 px-1.5 py-0 rounded">threat_actor</span>
            </div>
          </div>
          <span className="text-[10px] font-mono text-burnt-peach-400 tabular-nums">{time}</span>
        </div>
        <div className="text-[10px] font-mono text-burnt-peach-400 mb-1">{channel}</div>
        <div className="text-sm text-burnt-peach-800 leading-relaxed whitespace-pre-wrap">
          {displayContent}
          {isLong && (
            <button onClick={onToggle} className="text-[10px] font-mono text-burnt-peach-600 hover:text-burnt-peach-500 ml-1">
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Email-Style Card ── */

function EmailCard({ action, expanded, onToggle }: {
  action: AgentAction; expanded: boolean; onToggle: () => void;
}) {
  const isReply = action.action === "reply_email";
  const name = getAgentName(action);
  const initials = getInitials(name);
  const { content } = getActionContent(action);
  const isLong = content.length > 300;
  const displayContent = isLong && !expanded ? content.slice(0, 300) + "..." : content;
  const time = formatTime(action.timestamp);
  const subject = (action.args.subject as string) || "";
  const to = (action.args.to as string) || "";
  const cc = (action.args.cc as string) || "";

  return (
    <div className={`bg-white border border-pitch-black-200 rounded-lg overflow-hidden my-1.5 ${isReply ? "ml-5 border-l-[3px] border-l-tuscan-sun-400" : ""}`}>
      {/* Email header */}
      <div className="px-3 py-2.5 border-b border-pitch-black-100">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
            style={{ backgroundColor: getRoleHex(action.role) }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-semibold text-pitch-black-900">{name}</span>
              <span className="text-[10px] font-mono text-pitch-black-400">{action.role}</span>
            </div>
          </div>
          <span className="text-[10px] font-mono text-pitch-black-400 tabular-nums">{time}</span>
        </div>
        {to && <div className="text-[11px] font-mono text-pitch-black-400"><span className="text-pitch-black-300">To:</span> {to}</div>}
        {cc && <div className="text-[11px] font-mono text-pitch-black-400"><span className="text-pitch-black-300">Cc:</span> {cc}</div>}
        {subject && (
          <div className="text-sm font-semibold text-pitch-black-800 mt-1.5">
            {isReply ? `Re: ${subject}` : subject}
          </div>
        )}
      </div>
      {/* Email body */}
      <div className="px-3 py-2.5 text-sm text-pitch-black-700 leading-relaxed whitespace-pre-wrap">
        {displayContent}
        {isLong && (
          <button onClick={onToggle} className="text-[10px] font-mono text-royal-azure-600 hover:text-royal-azure-500 ml-1">
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Role color hex for avatars ── */

const ROLE_HEX: Record<string, string> = {
  ir_lead: "#3a7ae0", ciso: "#2d9c8f", ceo: "#b87333", legal: "#c06040",
  vp_eng: "#8b6914", cto: "#2855a0", soc_analyst: "#1a8a7a",
  chief_legal_officer: "#c06040", chief_security_officer: "#2d9c8f",
  soc_manager: "#3a7ae0", lead_security_researcher: "#1a8a7a",
  head_of_trust_and_safety: "#8b6914", vp_of_engineering: "#8b6914",
  cfo: "#b87333", president: "#9a5c30", field_ciso: "#2d9c8f",
  lead_incident_responder: "#3a7ae0", head_of_threat_intelligence: "#1a8a7a",
  threat_actor: "#c44444",
};

function getRoleHex(role: string): string {
  return ROLE_HEX[role] || "#666";
}

/* ── Timeline View ── */

function TimelineView({ actions }: { actions: AgentAction[] }) {
  let lastRound = -1;
  const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set());
  const toggleExpand = (i: number) => setExpandedSet(prev => {
    const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next;
  });

  return (
    <div className="relative pl-7">
      {/* Vertical line */}
      <div className="absolute left-[11px] top-0 bottom-0 w-px bg-border/30" />

      {actions.map((action, i) => {
        const showRoundDivider = action.round !== lastRound;
        lastRound = action.round;
        const time = formatTime(action.timestamp);
        const isInject = action.type === "inject" || action.action === "inject";
        const isArbiter = action.type === "arbiter";
        const isThreatActor = action.role === "threat_actor" || action.type === "threat_actor";
        const isEmail = action.action === "send_email" || action.action === "reply_email";

        return (
          <div key={i}>
            {showRoundDivider && (
              <div className="relative flex items-center -ml-7 my-3">
                <div className="absolute left-[7px] w-[9px] h-[9px] rounded-full bg-tuscan-sun-400 ring-2 ring-card z-10" />
                <div className="ml-7 text-[10px] font-mono text-pitch-black-500 uppercase tracking-widest font-semibold">
                  Round {action.round}
                </div>
              </div>
            )}

            <div className="relative py-1">
              {/* Timeline dot */}
              <div className={`absolute -left-[20px] top-3 w-[8px] h-[8px] rounded-full ring-2 ring-card z-10 ${
                isInject ? "bg-tuscan-sun-400" :
                isArbiter ? "bg-verdigris-400" :
                isThreatActor ? "bg-burnt-peach-400" :
                getRoleDotColor(action.role)
              }`} />

              {/* Time label */}
              {!isInject && !isArbiter && (
                <div className="text-[10px] font-mono text-muted-foreground/40 mb-0.5 tabular-nums">{time}</div>
              )}

              {/* Content — platform-native skin */}
              {isInject ? (
                <InjectBanner action={action} />
              ) : isArbiter ? (
                <ArbiterBanner action={action} />
              ) : isThreatActor ? (
                <ThreatActorMessage action={action} expanded={expandedSet.has(i)} onToggle={() => toggleExpand(i)} />
              ) : isEmail ? (
                <EmailCard action={action} expanded={expandedSet.has(i)} onToggle={() => toggleExpand(i)} />
              ) : (
                <div className="bg-royal-azure-50/30 border border-royal-azure-100 rounded-lg px-3 py-1">
                  <SlackMessage action={action} expanded={expandedSet.has(i)} onToggle={() => toggleExpand(i)} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Action Feed (All / Slack / Email tabs) ── */

function ActionFeed({
  actions,
  expandedActions,
  onToggleExpand,
}: {
  actions: AgentAction[];
  expandedActions: Set<number>;
  onToggleExpand: (index: number) => void;
}) {
  let lastRound = -1;
  let lastChannel = "";

  return (
    <>
      {actions.map((action, i) => {
        const showRoundDivider = action.round !== lastRound;
        lastRound = action.round;

        const isInject = action.type === "inject" || action.action === "inject";
        const isArbiter = action.type === "arbiter";
        const isEmail = action.action === "send_email" || action.action === "reply_email";
        const isSlack = action.action === "send_message" || action.action === "reply_in_thread";

        // Show channel header when channel changes
        const channel = action.world || "";
        const showChannelHeader = isSlack && channel !== lastChannel;
        if (isSlack) lastChannel = channel;

        return (
          <div key={i}>
            {showRoundDivider && (
              <div className="flex items-center gap-2 py-2 my-1">
                <div className="h-px flex-1 bg-border/20" />
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  Round {action.round}
                </span>
                <div className="h-px flex-1 bg-border/20" />
              </div>
            )}

            {isInject ? (
              <InjectBanner action={action} />
            ) : isArbiter ? (
              <ArbiterBanner action={action} />
            ) : (action.role === "threat_actor" || action.type === "threat_actor") ? (
              <ThreatActorMessage action={action} expanded={expandedActions.has(i)} onToggle={() => onToggleExpand(i)} />
            ) : isEmail ? (
              <EmailCard action={action} expanded={expandedActions.has(i)} onToggle={() => onToggleExpand(i)} />
            ) : isSlack ? (
              <>
                {showChannelHeader && (
                  <div className="mt-2 mb-1 px-2">
                    <span className="text-[10px] font-mono text-muted-foreground bg-royal-azure-50 border border-royal-azure-100 px-2 py-0.5 rounded"># {channel}</span>
                  </div>
                )}
                <div className="bg-royal-azure-50/30 border border-royal-azure-100 rounded-lg px-3">
                  <SlackMessage action={action} expanded={expandedActions.has(i)} onToggle={() => onToggleExpand(i)} />
                </div>
              </>
            ) : (
              /* Fallback for unknown action types */
              <div className="flex gap-2 py-1.5 pl-2 rounded-sm border-l-2 border-pitch-black-200">
                <div className={`w-7 h-7 rounded-md flex-shrink-0 flex items-center justify-center text-xs font-bold ${getRoleColor(action.role)}`}>
                  {getInitials(getAgentName(action))}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-foreground">{getAgentName(action)}</span>
                  <span className="text-[10px] font-mono text-muted-foreground ml-2">{action.action}</span>
                  <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{getActionContent(action).content}</p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
