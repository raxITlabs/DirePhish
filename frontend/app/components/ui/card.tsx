import * as React from "react"

import { cn } from "@/app/lib/utils"

const cornerMark = "absolute font-mono text-[10px] text-muted-foreground/30 select-none leading-none pointer-events-none"

function Card({
  className,
  size = "default",
  corners = true,
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm"; corners?: boolean }) {
  return (
    <div className="relative p-0.5 h-full">
      {corners && (
        <>
          <span className={cn(cornerMark, "-top-1 -left-0.5")} aria-hidden="true">┌</span>
          <span className={cn(cornerMark, "-top-1 -right-0.5")} aria-hidden="true">┐</span>
          <span className={cn(cornerMark, "-bottom-1 -left-0.5")} aria-hidden="true">└</span>
          <span className={cn(cornerMark, "-bottom-1 -right-0.5")} aria-hidden="true">┘</span>
        </>
      )}
      <div
        data-slot="card"
        data-size={size}
        className={cn(
          "group/card flex flex-col gap-4 bg-card border border-border/20 rounded-lg px-4 py-3 text-sm text-card-foreground h-full has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:px-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0",
          className
        )}
        {...props}
      />
    </div>
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 px-4 group-data-[size=sm]/card:px-3 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-4 flex-1 group-data-[size=sm]/card:px-3", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center border-t bg-muted/50 p-4 group-data-[size=sm]/card:p-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
