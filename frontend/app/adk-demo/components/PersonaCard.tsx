// frontend/app/adk-demo/components/PersonaCard.tsx
"use client";

type LatestAction = {
  action: string;
  world: string;
  preview?: string;
};

type PersonaCardProps = {
  name: string;
  role: string;
  latestAction?: LatestAction;
  status?: "idle" | "thinking" | "acted";
};

const roleBadgeClass: Record<string, string> = {
  defender: "bg-blue-100 text-blue-800 border-blue-300",
  attacker: "bg-red-100 text-red-800 border-red-300",
  judge: "bg-purple-100 text-purple-800 border-purple-300",
};

const statusDotClass: Record<string, string> = {
  idle: "bg-gray-300",
  thinking: "bg-yellow-400 animate-pulse",
  acted: "bg-green-500",
};

function getRoleCategory(role: string): string {
  const r = role.toLowerCase();
  if (r.includes("threat") || r.includes("attacker") || r.includes("adversary")) return "attacker";
  if (r.includes("judge")) return "judge";
  return "defender";
}

export default function PersonaCard({ name, role, latestAction, status = "idle" }: PersonaCardProps) {
  const category = getRoleCategory(role);
  const badgeClass = roleBadgeClass[category] ?? roleBadgeClass.defender;
  const dotClass = statusDotClass[status];

  return (
    <div className="bg-white border border-gray-200 rounded font-mono text-sm relative">
      {/* Corner brackets */}
      <span className="absolute top-1 left-1 text-gray-300 text-xs select-none">┌</span>
      <span className="absolute top-1 right-1 text-gray-300 text-xs select-none">┐</span>
      <span className="absolute bottom-1 left-1 text-gray-300 text-xs select-none">└</span>
      <span className="absolute bottom-1 right-1 text-gray-300 text-xs select-none">┘</span>

      <div className="px-4 pt-4 pb-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} title={status} />
          <span className="font-semibold text-gray-900 truncate">{name}</span>
        </div>

        {/* Role badge */}
        <span className={`inline-block px-2 py-0.5 text-xs border rounded uppercase tracking-wide ${badgeClass}`}>
          {role}
        </span>

        {/* Latest action */}
        {latestAction ? (
          <div className="mt-2 border-t border-gray-100 pt-2">
            <div className="text-xs text-gray-500 mb-0.5">
              [{latestAction.world}]
            </div>
            <div className="text-xs text-gray-800 font-semibold truncate">
              {latestAction.action}
            </div>
            {latestAction.preview && (
              <div className="text-xs text-gray-500 mt-0.5 truncate italic">
                {latestAction.preview}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-400 italic">
            no actions yet
          </div>
        )}
      </div>
    </div>
  );
}
