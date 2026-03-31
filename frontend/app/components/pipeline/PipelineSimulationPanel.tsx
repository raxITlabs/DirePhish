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

function getActionBorderColor(action: string): string {
  if (action === "send_message") return "border-l-2 border-royal-azure-300";
  if (action === "send_email") return "border-l-2 border-tuscan-sun-300";
  return "border-l-2 border-pitch-black-200";
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
                variant="secondary"
                className={`text-[10px] font-mono ${
                  pressure.triggered
                    ? getSeverityColor(pressure.severity)
                    : "bg-pitch-black-50 text-pitch-black-400 opacity-40"
                }`}
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

/* ── Timeline View ── */

function TimelineView({ actions }: { actions: AgentAction[] }) {
  let lastRound = -1;

  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div className="absolute left-2 top-0 bottom-0 w-px bg-border/30" />

      {actions.map((action, i) => {
        const showRoundDivider = action.round !== lastRound;
        lastRound = action.round;
        const time = formatTime(action.timestamp);
        const { content, meta } = getActionContent(action);
        const preview = action.action === "send_email"
          ? (action.args.subject as string) || content.slice(0, 120)
          : content.length > 120 ? content.slice(0, 120) + "..." : content;

        const isInject = action.type === "inject" || action.action === "inject";
        const isArbiter = action.type === "arbiter";
        const isThreatActor = action.role === "threat_actor" || action.type === "threat_actor";

        return (
          <div key={i}>
            {showRoundDivider && (
              <div className="relative flex items-center -ml-6 my-3">
                <div className="w-full bg-pitch-black-50 rounded px-3 py-1">
                  <span className="text-[10px] font-mono text-pitch-black-500 uppercase tracking-wider font-semibold">
                    Round {action.round}
                  </span>
                </div>
              </div>
            )}

            {isInject ? (
              <div className="relative flex items-start gap-3 py-1.5">
                <div className="absolute -left-[17px] top-2.5 w-2 h-2 rounded-full ring-2 ring-card bg-tuscan-sun-400" />
                <div className="text-[10px] font-mono text-muted-foreground/50 w-14 shrink-0 pt-0.5 tabular-nums">{time}</div>
                <div className="flex-1 min-w-0 rounded-md bg-tuscan-sun-50 border border-tuscan-sun-200 px-3 py-2 text-xs font-mono">
                  <span className="text-tuscan-sun-700 font-bold">!! INJECT</span>
                  <span className="text-tuscan-sun-600 ml-2">{action.description || (action.args?.content as string)}</span>
                  {action.kill_chain_step && (
                    <span className="ml-2 text-[10px] bg-tuscan-sun-100 text-tuscan-sun-700 px-1.5 py-0.5 rounded uppercase">{action.kill_chain_step}</span>
                  )}
                </div>
              </div>
            ) : isArbiter ? (
              <div className="relative flex items-start gap-3 py-1.5">
                <div className="absolute -left-[17px] top-2.5 w-2 h-2 rounded-full ring-2 ring-card bg-verdigris-400" />
                <div className="text-[10px] font-mono text-muted-foreground/50 w-14 shrink-0 pt-0.5 tabular-nums">{time}</div>
                <div className="flex-1 min-w-0 rounded-md bg-verdigris-50 border border-verdigris-200 px-3 py-2 text-xs font-mono">
                  <span className="text-verdigris-700 font-bold">~ SCENARIO</span>
                  <span className="text-verdigris-600 ml-2">{action.reason || action.complication}</span>
                </div>
              </div>
            ) : (
              <div className="relative flex items-start gap-3 py-1.5">
                {/* Node dot */}
                <div className={`absolute -left-[17px] top-2.5 w-2 h-2 rounded-full ring-2 ring-card ${isThreatActor ? "bg-burnt-peach-400" : getRoleDotColor(action.role)}`} />

                {/* Time label */}
                <div className="text-[10px] font-mono text-muted-foreground/50 w-14 shrink-0 pt-0.5 tabular-nums">
                  {time}
                </div>

                {/* Card */}
                <div className={`flex-1 min-w-0 rounded-md px-3 py-2 bg-muted/20 ${getActionBorderColor(action.action)} ${isThreatActor ? "bg-burnt-peach-50/50 border-l-2 border-l-burnt-peach-400" : ""}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-foreground">
                      {isThreatActor && <span className="text-burnt-peach-600 mr-1 text-[9px] font-mono uppercase">ATTACKER</span>}
                      {getAgentName(action)}
                    </span>
                    <Badge
                      variant="secondary"
                      className={`text-[9px] font-mono py-0 h-4 ${getRoleColor(action.role)}`}
                    >
                      {action.role}
                    </Badge>
                    <span className="text-[9px] font-mono text-muted-foreground/50 ml-auto">
                      {action.action === "send_message" ? "slack" : action.action === "send_email" ? "email" : action.action}
                    </span>
                  </div>
                  {meta && (
                    <p className="text-[9px] font-mono text-muted-foreground/60 mt-1 truncate">{meta}</p>
                  )}
                  {preview && (
                    <p className="text-[11px] text-foreground/70 mt-1 leading-relaxed line-clamp-2">
                      {preview}
                    </p>
                  )}
                </div>
              </div>
            )}
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

  return (
    <>
      {actions.map((action, i) => {
        const showRoundDivider = action.round !== lastRound;
        lastRound = action.round;

        const agentName = getAgentName(action);
        const initials = agentName
          .split(" ")
          .map((n) => n[0])
          .join("")
          .slice(0, 2);

        const { content, meta } = getActionContent(action);
        const isLong = content.length > 300;
        const isExpanded = expandedActions.has(i);
        const displayContent = isLong && !isExpanded ? content.slice(0, 300) + "..." : content;
        const time = formatTime(action.timestamp);

        // Inject event — amber banner
        const isInject = action.type === "inject" || action.action === "inject";
        // Arbiter event — teal notification
        const isArbiter = action.type === "arbiter";
        // Threat actor — red-tinted card
        const isThreatActor = action.role === "threat_actor" || action.type === "threat_actor";

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

            {/* Inject event banner */}
            {isInject ? (
              <div className="rounded-md bg-tuscan-sun-50 border border-tuscan-sun-200 px-3 py-2 text-xs font-mono my-1">
                <span className="text-tuscan-sun-700 font-bold">!! INJECT</span>
                <span className="text-tuscan-sun-600 ml-2">{action.description || (action.args?.content as string)}</span>
                {action.kill_chain_step && (
                  <span className="ml-2 text-[10px] bg-tuscan-sun-100 text-tuscan-sun-700 px-1.5 py-0.5 rounded uppercase">{action.kill_chain_step}</span>
                )}
              </div>
            ) : isArbiter ? (
              /* Arbiter event notification */
              <div className="rounded-md bg-verdigris-50 border border-verdigris-200 px-3 py-2 text-xs font-mono my-1">
                <span className="text-verdigris-700 font-bold">~ SCENARIO</span>
                <span className="text-verdigris-600 ml-2">{action.reason || action.complication}</span>
              </div>
            ) : (
              /* Regular / threat actor action card */
              <div className={`flex gap-2 py-1.5 pl-2 rounded-sm ${getActionBorderColor(action.action)} ${isThreatActor ? "bg-burnt-peach-50/50 border-l-2 border-l-burnt-peach-400" : ""}`}>
                <div
                  className={`w-7 h-7 rounded-md flex-shrink-0 flex items-center justify-center text-xs font-bold ${getRoleColor(action.role)}`}
                >
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">
                      {isThreatActor && <span className="text-burnt-peach-600 mr-1 text-[10px] font-mono uppercase">ATTACKER</span>}
                      {agentName}
                    </span>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] font-mono ${getRoleColor(action.role)}`}
                    >
                      {action.role}
                    </Badge>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {action.world}:{action.action}
                    </span>
                    {time && (
                      <span className="text-[10px] font-mono text-muted-foreground/40 ml-auto tabular-nums">
                        {time}
                      </span>
                    )}
                  </div>
                  {meta && (
                    <div className="text-[10px] font-mono text-muted-foreground/70 mt-1 space-y-0.5">
                      {(action.args.to as string) && (
                        <div>To: {action.args.to as string}</div>
                      )}
                      {(action.args.cc as string) && (
                        <div>Cc: {action.args.cc as string}</div>
                      )}
                      {(action.args.subject as string) && (
                        <div className="font-semibold text-foreground/70">Sub: {action.args.subject as string}</div>
                      )}
                    </div>
                  )}
                  {content && (
                    <div className="text-sm text-foreground mt-1 whitespace-pre-wrap">
                      {displayContent}
                      {isLong && (
                        <button
                          onClick={() => onToggleExpand(i)}
                          className="text-[10px] font-mono text-primary hover:text-primary/80 ml-1"
                        >
                          {isExpanded ? "Show less" : "Show more"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
