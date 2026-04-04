import { cn } from "@/app/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "motion-safe:animate-pulse rounded-md overflow-hidden text-muted-foreground/20 select-none font-mono text-xs leading-tight",
        className
      )}
      aria-hidden="true"
      {...props}
    >
      {"╌".repeat(120)}
    </div>
  )
}

export { Skeleton }
