// frontend/app/components/research/ResearchProgress.tsx
interface Props {
  progress: number;
  message: string;
  errorMessage?: string;
  onRetry?: () => void;
}

export default function ResearchProgress({
  progress,
  message,
  errorMessage,
  onRetry,
}: Props) {
  if (errorMessage) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <div className="w-full max-w-md p-4 rounded-lg bg-severity-critical-bg border border-severity-critical-border text-severity-critical-text text-sm">
          <p className="font-semibold mb-1">Research Failed</p>
          <p>{errorMessage}</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 rounded-lg bg-accent text-white font-medium text-sm hover:opacity-90 transition-opacity"
          >
            Retry Research
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-between text-xs text-text-secondary mb-1">
          <span>{message}</span>
          <span>{progress}%</span>
        </div>
        <div className="w-full h-2 bg-background border border-border rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-500 rounded-full"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      </div>
      <p className="text-xs text-text-secondary">Gathering company intelligence...</p>
    </div>
  );
}
