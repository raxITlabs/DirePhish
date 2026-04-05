"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import GlobalHeader from "./GlobalHeader"
import AppSidebar from "./AppSidebar"

export default function LayoutShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isFullscreen = pathname === "/" || pathname.startsWith("/pipeline/") || pathname.startsWith("/report/")

  if (isFullscreen) {
    return (
      <main id="main-content" className="h-svh w-full overflow-hidden">
        {children}
      </main>
    )
  }

  return (
    <>
      <GlobalHeader />
      <div className="flex" style={{ height: "calc(100svh - 3rem)" }}>
        <AppSidebar />
        <main id="main-content" className="flex-1 min-w-0 overflow-auto">
          {children}
        </main>
      </div>
    </>
  )
}
