import Link from "next/link";
import { Separator } from "@/app/components/ui/separator";

export default function Header() {
  return (
    <header className="bg-card">
      <div className="flex items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <span className="text-lg font-bold text-primary">Crucible</span>
          <span className="text-sm text-muted-foreground font-mono">by raxIT Labs</span>
        </Link>
      </div>
      <Separator />
    </header>
  );
}
