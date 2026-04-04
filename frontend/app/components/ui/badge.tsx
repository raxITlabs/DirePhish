import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/app/lib/utils"

const badgeVariants = cva(
  "inline-flex items-baseline font-mono text-xs",
  {
    variants: {
      variant: {
        default: "text-primary",
        secondary: "text-secondary",
        destructive: "text-destructive",
        outline: "text-foreground",
        warning: "text-tuscan-sun-700",
        success: "text-verdigris-600",
        ghost: "text-muted-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  bracket = "square",
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    bracket?: "square" | "angle" | "paren" | "none"
  }) {
  const [open, close] = {
    square: ["[", "]"],
    angle: ["<", ">"],
    paren: ["(", ")"],
    none: ["", ""],
  }[bracket]

  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      <span aria-hidden="true" className="text-muted-foreground/50 select-none">
        {open}
      </span>
      <span className="px-0.5">{children}</span>
      <span aria-hidden="true" className="text-muted-foreground/50 select-none">
        {close}
      </span>
    </span>
  )
}

export { Badge, badgeVariants }
