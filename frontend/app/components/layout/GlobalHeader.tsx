import Link from "next/link";

export default function GlobalHeader() {
  return (
    <header className="flex items-center px-4 h-12 bg-background/60 backdrop-blur-sm">
      <Link href="/" className="transition-opacity hover:opacity-80">
        <div className="flex items-center gap-2">
          <span className="font-mono text-base font-bold text-primary tracking-tighter">
            DirePhish
          </span>
          <span className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground border border-border rounded px-1 py-px leading-none">
            Alpha
          </span>
        </div>
        <span className="font-mono text-[8px] tracking-widest text-muted-foreground/50 block">
          by raxIT Labs
        </span>
      </Link>
    </header>
  );
}
