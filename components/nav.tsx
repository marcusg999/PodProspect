import Link from "next/link";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/campaign", label: "Campaign" },
  { href: "/review", label: "Review" },
  { href: "/queue", label: "Approval Queue" },
  { href: "/health", label: "Health" },
];

export function Nav() {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-20">
      <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-6">
        <Link href="/" className="font-semibold tracking-tight text-primary">
          PodProspect
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
