"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/debts", label: "Debts" },
  { href: "/negotiations", label: "Negotiations" },
  { href: "/calendar", label: "Calendar" },
  { href: "/entities", label: "Entities" },
  { href: "/import", label: "Import" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Sections">
      {ITEMS.map((i) => {
        const on = i.href === "/" ? path === "/" : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
