"use client";

import { useState, useRef, useEffect } from "react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { ChevronDown, ChevronRight, Terminal } from "lucide-react";

interface ConsoleLogProps {
  lines: string[];
}

export default function ConsoleLog({ lines }: ConsoleLogProps) {
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, open]);

  return (
    <div className="border border-border rounded-lg">
      <Button
        variant="ghost"
        className="w-full flex items-center gap-2 px-4 py-3 h-auto justify-start"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <Terminal size={16} />
        <span className="text-sm font-medium">Console</span>
        <Badge variant="outline" className="text-xs ml-auto">
          {lines.length} lines
        </Badge>
      </Button>

      {open && (
        <div
          ref={scrollRef}
          className="max-h-48 overflow-y-auto bg-muted rounded-md p-3 mx-4 mb-4"
        >
          {lines.map((line, i) => (
            <div key={i} className="font-mono text-xs text-muted-foreground">
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
