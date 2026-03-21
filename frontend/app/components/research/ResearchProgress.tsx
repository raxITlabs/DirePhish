// frontend/app/components/research/ResearchProgress.tsx
import { Alert, AlertTitle, AlertDescription } from "@/app/components/ui/alert";
import { Button } from "@/app/components/ui/button";

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
        <Alert variant="destructive" className="w-full max-w-md">
          <AlertTitle>Research Failed</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
        {onRetry && (
          <Button onClick={onRetry}>Retry Research</Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>{message}</span>
          <span>{progress}%</span>
        </div>
        <div className="w-full h-2 bg-background border border-border rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500 rounded-full"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Gathering company intelligence...</p>
    </div>
  );
}
