import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2, Plus, Minus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { NumpadDialog } from "@/components/pos/NumpadDialog";
import { ReceiptDialog } from "@/components/pos/ReceiptDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { checkout, getSettings, listCategories, listProducts } from "@/lib/db/pos-db";
import type {
  CartLine,
  PaymentMethod,
  Product,
  Transaction,
  TransactionItem,
} from "@/lib/db/types";
import { rupiah } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kasir — POS Offline untuk UMKM" },
      {
        name: "description",
        content:
          "Aplikasi kasir offline untuk warung dan UMKM: transaksi cepat, kontrol stok, dan laba akurat tanpa internet.",
      },
      { property: "og:title", content: "Kasir — POS Offline untuk UMKM" },
      {
        property: "og:description",
        content: "Transaksi cepat, kontrol stok, dan laba akurat tanpa internet.",
      },
    ],
  }),
  component: KasirPage,
});

function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function KasirPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 300);
  const [activeCat, setActiveCat] = useState<string | "all">("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [numpadFor, setNumpadFor] = useState<CartLine | null>(null);
  const [receipt, setReceipt] = useState<{
    transaction: Transaction;
    items: TransactionItem[];
  } | null>(null);

  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: listProducts });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return products.filter(
      (p) =>
        (activeCat === "all" || p.category_id === activeCat) &&
        (q === "" || p.name.toLowerCase().includes(q)),
    );
  }, [products, debouncedSearch, activeCat]);

  const totalQty = cart.reduce((s, l) => s + l.qty, 0);
  const totalOmset = cart.reduce((s, l) => s + l.qty * l.product.sell_price, 0);

  const addToCart = (product: Product) => {
    if (product.stock === 0) return;
    setCart((prev) => {
      const found = prev.find((l) => l.product.id === product.id);
      if (!found) return [...prev, { product, qty: 1 }];
      if (product.stock !== null && found.qty + 1 > product.stock) {
        toast.error(`Stok ${product.name} tinggal ${product.stock}`);
        return prev;
      }
      return prev.map((l) => (l.product.id === product.id ? { ...l, qty: l.qty + 1 } : l));
    });
  };

  const setQty = (productId: string, qty: number) => {
    setCart((prev) =>
      qty <= 0
        ? prev.filter((l) => l.product.id !== productId)
        : prev.map((l) => (l.product.id === productId ? { ...l, qty } : l)),
    );
  };

  const pay = async (method: PaymentMethod) => {
    try {
      const result = await checkout(cart, method);
      setCart([]);
      setCartOpen(false);
      setReceipt({ transaction: result.transaction, items: result.items });
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(`Transaksi tersimpan — ${rupiah(result.transaction.total_omset)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan transaksi");
    }
  };

  return (
    <AppShell title="Kasir">
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari produk..."
          className="h-11 pl-9"
        />
      </div>

      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <CatChip active={activeCat === "all"} onClick={() => setActiveCat("all")} label="Semua" />
        {categories.map((c) => (
          <CatChip
            key={c.id}
            active={activeCat === c.id}
            onClick={() => setActiveCat(c.id)}
            label={c.name}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Tidak ada produk.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((p) => {
            const habis = p.stock === 0;
            return (
              <button
                key={p.id}
                type="button"
                disabled={habis}
                onClick={() => addToCart(p)}
                className={`flex flex-col rounded-xl border border-border bg-card p-3 text-left transition ${
                  habis ? "opacity-50 grayscale" : "active:scale-[0.98] hover:border-primary"
                }`}
              >
                <div className="mb-2 flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-muted">
                  {p.photo_path ? (
                    <img src={p.photo_path} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-2xl font-bold text-muted-foreground">
                      {p.name.slice(0, 1)}
                    </span>
                  )}
                </div>
                <span className="line-clamp-2 text-sm font-semibold text-foreground">{p.name}</span>
                <span className="mt-0.5 text-base font-bold text-primary">
                  {rupiah(p.sell_price)}
                </span>
                {habis ? (
                  <span className="mt-1 inline-flex w-fit rounded bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
                    Stok Habis
                  </span>
                ) : (
                  <span className="mt-1 text-[11px] text-muted-foreground">
                    {p.stock === null ? "Stok tidak terbatas" : `Sisa ${p.stock}`}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {totalQty > 0 && (
        <div className="fixed inset-x-0 bottom-[60px] z-40 px-4 pb-2">
          <div className="mx-auto max-w-lg">
            <Button
              className="h-14 w-full justify-between text-base shadow-lg"
              onClick={() => setCartOpen(true)}
            >
              <span className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                {totalQty} item
              </span>
              <span className="font-bold">{rupiah(totalOmset)}</span>
            </Button>
          </div>
        </div>
      )}

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent
          side="bottom"
          className="flex h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        >
          <SheetHeader className="shrink-0 border-b border-border bg-card px-4 py-3">
            <SheetTitle>Keranjang</SheetTitle>
          </SheetHeader>

          <div className="no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {cart.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Keranjang masih kosong.
              </p>
            ) : (
              cart.map((line) => (
                <div key={line.product.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{line.product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {rupiah(line.product.sell_price)} × {line.qty}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => setQty(line.product.id, line.qty - 1)}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <button
                    type="button"
                    onClick={() => setNumpadFor(line)}
                    className="min-w-12 rounded-md border border-border px-2 py-2 text-center text-base font-bold tabular-nums"
                  >
                    {line.qty}
                  </button>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => {
                      if (line.product.stock !== null && line.qty + 1 > line.product.stock) {
                        toast.error(`Stok tinggal ${line.product.stock}`);
                        return;
                      }
                      setQty(line.product.id, line.qty + 1);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setQty(line.product.id, 0)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))
            )}
          </div>

          <div className="shrink-0 border-t border-border bg-card px-4 pb-5 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-2xl font-extrabold text-foreground">{rupiah(totalOmset)}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="h-12"
                disabled={cart.length === 0}
                onClick={() => pay("other")}
              >
                Non-Tunai
              </Button>
              <Button className="h-12" disabled={cart.length === 0} onClick={() => pay("cash")}>
                Bayar Tunai
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <NumpadDialog
        open={numpadFor !== null}
        title={`Jumlah — ${numpadFor?.product.name ?? ""}`}
        initialValue={numpadFor?.qty ?? 1}
        max={numpadFor?.product.stock ?? null}
        onClose={() => setNumpadFor(null)}
        onSubmit={(value) => {
          if (numpadFor) setQty(numpadFor.product.id, value);
          setNumpadFor(null);
        }}
      />
    </AppShell>
  );
}

function CatChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-secondary-foreground hover:bg-accent"
      }`}
    >
      {label}
    </button>
  );
}
