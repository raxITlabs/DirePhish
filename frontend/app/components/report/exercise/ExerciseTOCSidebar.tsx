"use client";

import { useEffect, useState } from "react";

interface TOCItem {
  id: string;
  label: string;
  children?: TOCItem[];
}

interface ExerciseTOCSidebarProps {
  items: TOCItem[];
}

export default function ExerciseTOCSidebar({ items }: ExerciseTOCSidebarProps) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const ids = items.flatMap((item) => [
      item.id,
      ...(item.children?.map((c) => c.id) ?? []),
    ]);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0.1 }
    );

    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [items]);

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <nav className="sticky top-24 space-y-1 text-sm">
      <p className="font-mono text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        <span className="text-primary select-none" aria-hidden="true">{"§ "}</span>
        Contents
      </p>
      {items.map((item) => (
        <div key={item.id}>
          <button
            onClick={() => scrollTo(item.id)}
            className={`block w-full text-left px-3 py-1.5 rounded-md font-mono text-xs transition-colors ${
              activeId === item.id
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {activeId === item.id && <span className="text-primary select-none mr-1" aria-hidden="true">{"▸"}</span>}
            {item.label}
          </button>
          {item.children?.map((child) => (
            <button
              key={child.id}
              onClick={() => scrollTo(child.id)}
              className={`block w-full text-left pl-6 pr-3 py-1 rounded-md text-xs transition-colors ${
                activeId === child.id
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {child.label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
