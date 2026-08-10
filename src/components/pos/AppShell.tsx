import { Link } from "@tanstack/react-router";
import { ShoppingCart, Package, Receipt, BarChart3, Settings } from "lucide-react";

const items = [
  { to: "/", label: "Kasir", icon: ShoppingCart },
  { to: "/produk", label: "Produk", icon: Package },
  { to: "/riwayat", label: "Riwayat", icon: Receipt },
  { to: "/laporan", label: "Laporan", icon: BarChart3 },
  { to: "/pengaturan", label: "Atur", icon: Settings },
] as const;

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
      <ul className="mx-auto flex max-w-lg items-stretch">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <Link
              to={to}
              activeOptions={{ exact: to === "/" }}
              activeProps={{ className: "text-primary" }}
              inactiveProps={{ className: "text-muted-foreground" }}
              className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors"
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function AppShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="mx-auto max-w-lg px-4 py-3">
          <h1 className="text-lg font-bold tracking-tight text-foreground">{title}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-4">{children}</main>
      <BottomNav />
    </div>
  );
}
