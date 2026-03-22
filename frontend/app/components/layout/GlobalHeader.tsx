import Link from "next/link";
import { Badge } from "@/app/components/ui/badge";

export default function GlobalHeader() {
  return (
    <header className="flex items-center px-4 shrink-0 h-12">
      <Link href="/" className="transition-opacity hover:opacity-80">
        <div className="flex items-center gap-2">
          <span className="font-mono text-base font-bold text-primary tracking-tighter">
            DirePhish
          </span>
          <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wider">
            Alpha
          </Badge>
        </div>
        <span className="font-mono text-[10px] tracking-widest text-muted-foreground/50 block">
          by raxIT Labs
        </span>
      </Link>
    </header>
  );
}
