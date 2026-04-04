"use client"

import * as React from "react"
import { Separator as SeparatorPrimitive } from "@base-ui/react/separator"

import { cn } from "@/app/lib/utils"

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorPrimitive.Props) {
  if (orientation === "vertical") {
    return (
      <SeparatorPrimitive
        data-slot="separator"
        orientation="vertical"
        className={cn(
          "shrink-0 self-stretch inline-flex items-center text-muted-foreground/30 select-none font-mono text-xs",
          className
        )}
        {...props}
      >
        <span aria-hidden="true">│</span>
      </SeparatorPrimitive>
    )
  }

  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation="horizontal"
      className={cn(
        "shrink-0 w-full overflow-hidden text-muted-foreground/30 select-none font-mono text-xs leading-none motion-safe:animate-none",
        className
      )}
      {...props}
    >
      <span aria-hidden="true" className="whitespace-nowrap">
        {"· ".repeat(80).trim()}
      </span>
    </SeparatorPrimitive>
  )
}

export { Separator }
