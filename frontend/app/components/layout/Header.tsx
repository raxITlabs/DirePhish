import Link from "next/link";

export default function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card">
      <Link href="/" className="flex items-center gap-2">
        <span className="text-lg font-bold text-accent">Crucible</span>
        <span className="text-sm text-text-secondary font-mono">by raxIT Labs</span>
      </Link>
    </header>
  );
}
