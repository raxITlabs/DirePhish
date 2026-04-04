import type { Metadata } from "next"
import AsciiTestPage from "./AsciiTestPage"

export const metadata: Metadata = {
  title: "ASCII Art Test | DirePhish",
  description: "Variable typographic ASCII art demos powered by pretext",
}

export default function Page() {
  return <AsciiTestPage />
}
