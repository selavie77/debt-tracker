"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/plan", label: "Plan" },
  { href: "/debts", label: "Debts" },
  { href: "/negotiations", label: "Negotiations" },
  { href: "/calendar", label: "Calendar" },
  { href: "/living-costs", label: "Living costs" },
  { href: "/compare", label: "Compare" },
  { href: "/tax", label: "Tax review" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
  { href: "/entities", label: "Entities" },
  { href: "/import", label: "Import" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Sections">
      {ITEMS.map((i) => {
        const on = path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
