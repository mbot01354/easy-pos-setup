import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2, Plus, Minus, ShoppingCart, Percent } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { NumpadDialog } from "@/components/pos/NumpadDialog";
import { ReceiptDialog } from "@/components/pos/ReceiptDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  checkout,
  closeShift,
  getOpenShift,
  getSettings,
  listCategories,
  listProducts,
  listShifts,
  openShift,
} from "@/lib/db/pos-db";
import type {
  CartLine,
  PaymentMethod,
  Product,
  Shift,
  Transaction,
  TransactionItem,
} from "@/lib/db/types";
import { rupiah } from "@/lib/format";
import { DISCOUNT_PRESETS, isLowStock, lowStockThreshold } from "@/lib/stock";

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

function timeLabel(ts: number) {
  return new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function dateLabel(ts: number) {
  return new Date(ts).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
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
  const [openCash, setOpenCash] = useState(false);
  const [closeCash, setCloseCash] = useState(false);
  const [shiftResult, setShiftResult] = useState<Shift | null>(null);
  const [discountFor, setDiscountFor] = useState<CartLine | null>(null);
  const [txPercent, setTxPercent] = useState(0);
  const [txDiscOpen, setTxDiscOpen] = useState(false);

  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: listProducts });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const { data: activeShift } = useQuery({ queryKey: ["open-shift"], queryFn: getOpenShift });
  const { data: shifts = [] } = useQuery({ queryKey: ["shifts"], queryFn: listShifts });

  const closedShifts = shifts.filter((s) => s.status === "closed");
  const lowThreshold = lowStockThreshold(settings);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return products.filter(
      (p) =>
        (activeCat === "all" || p.category_id === activeCat) &&
        (q === "" || p.name.toLowerCase().includes(q)),
    );
  }, [products, debouncedSearch, activeCat]);

  const totalQty = cart.reduce((s, l) => s + l.qty, 0);
  const subtotal = cart.reduce((s, l) => s + l.qty * l.product.sell_price, 0);
  const itemDiscTotal = cart.reduce(
    (s, l) => s + Math.round((l.qty * l.product.sell_price * l.discount_percent) / 100),
    0,
  );
  const afterItemDisc = subtotal - itemDiscTotal;
  const txDiscTotal = Math.round((afterItemDisc * txPercent) / 100);
  const totalOmset = afterItemDisc - txDiscTotal;

  const addToCart = (product: Product) => {
    if (product.stock === 0) return;
    setCart((prev) => {
      const found = prev.find((l) => l.product.id === product.id);
      if (!found) return [...prev, { product, qty: 1, discount_percent: 0 }];
      if (product.stock !== null && found.qty + 1 > product.stock) {
        toast.error(`Stok ${product.name} tinggal ${product.stock}`);
        return prev;
      }
      return prev.map((l) => (l.product.id === product.id ? { ...l, qty: l.qty + 1 } : l));
    });
  };

  const setStoreDiscount = (productId: string, percent: number) => {
    setCart((prev) =>
      prev.map((l) =>
        l.product.id === productId
          ? { ...l, discount_percent: Math.min(100, Math.max(0, percent)) }
          : l,
      ),
    );
  };

  const setQty = (productId: string, qty: number) => {
    setCart((prev) =>
      qty <= 0
        ? prev.filter((l) => l.product.id !== productId)
        : prev.map((l) => (l.product.id === productId ? { ...l, qty } : l)),
    );
  };

  const pay = async (method: PaymentMethod) => {
    if (!activeShift) {
      toast.error("Buka shift dulu sebelum bertransaksi");
      return;
    }
    try {
      const result = await checkout(cart, method, activeShift.id, txPercent);
      setCart([]);
      setTxPercent(0);
      setCartOpen(false);
      setReceipt({ transaction: result.transaction, items: result.items });
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(`Transaksi tersimpan — ${rupiah(result.transaction.total_omset)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan transaksi");
    }
  };

  const doOpenShift = async (openingCash: number) => {
    try {
      await openShift(openingCash);
      await queryClient.invalidateQueries({ queryKey: ["open-shift"] });
      await queryClient.invalidateQueries({ queryKey: ["shifts"] });
      toast.success("Shift dibuka");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuka shift");
    }
  };

  const doCloseShift = async (actual: number) => {
    if (!activeShift) return;
    try {
      const closed = await closeShift(activeShift.id, actual);
      setShiftResult(closed);
      await queryClient.invalidateQueries({ queryKey: ["open-shift"] });
      await queryClient.invalidateQueries({ queryKey: ["shifts"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menutup shift");
    }
  };

  return (
    <AppShell title="Kasir">
      <section className="mb-3 rounded-xl border border-border bg-card p-3">
        {activeShift ? (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-primary">Shift aktif</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Buka {timeLabel(activeShift.opened_at)} · Modal {rupiah(activeShift.opening_cash)}
              </p>
            </div>
            <Button variant="outline" className="h-10 shrink-0" onClick={() => setCloseCash(true)}>
              Tutup Shift
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-foreground">
                Shift belum dibuka
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Buka shift sebelum mulai transaksi kasir.
              </p>
            </div>
            <Button className="h-10 shrink-0" onClick={() => setOpenCash(true)}>
              Buka Shift
            </Button>
          </div>
        )}

        {!activeShift && closedShifts.length > 0 && (
          <div className="mt-2 border-t border-border pt-2">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Shift terakhir
            </p>
            <div className="space-y-1">
              {closedShifts.slice(0, 3).map((s) => (
                <div key={s.id} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{dateLabel(s.opened_at)}</span>
                  <span
                    className={
                      s.selisih !== null && s.selisih >= 0
                        ? "font-medium"
                        : "font-medium text-destructive"
                    }
                  >
                    Selisih {s.selisih !== null ? rupiah(s.selisih) : "-"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

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
                ) : isLowStock(p, lowThreshold) ? (
                  <span className="mt-1 inline-flex w-fit rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    Stok menipis · {p.stock}
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
              cart.map((line) => {
                const gross = line.qty * line.product.sell_price;
                const disc = Math.round((gross * line.discount_percent) / 100);
                return (
                  <div key={line.product.id} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{line.product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {rupiah(line.product.sell_price)} × {line.qty}
                          {line.discount_percent > 0 && (
                            <>
                              {" "}
                              <span className="line-through">{rupiah(gross)}</span>{" "}
                              <span className="font-semibold text-primary">
                                {rupiah(gross - disc)}
                              </span>
                            </>
                          )}
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
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setQty(line.product.id, 0)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDiscountFor(line)}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${
                        line.discount_percent > 0
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      <Percent className="h-3 w-3" />
                      {line.discount_percent > 0
                        ? `Diskon ${line.discount_percent}% (-${rupiah(disc)})`
                        : "Diskon item"}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="shrink-0 border-t border-border bg-card px-4 pb-5 pt-3">
            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{rupiah(subtotal)}</span>
              </div>
              {itemDiscTotal > 0 && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Diskon item</span>
                  <span className="tabular-nums">-{rupiah(itemDiscTotal)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setTxDiscOpen(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground"
                >
                  <Percent className="h-3 w-3" />
                  Diskon transaksi{txPercent > 0 ? ` ${txPercent}%` : ""}
                </button>
                <span className="tabular-nums text-muted-foreground">
                  {txDiscTotal > 0 ? `-${rupiah(txDiscTotal)}` : rupiah(0)}
                </span>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-2xl font-extrabold text-foreground">{rupiah(totalOmset)}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="h-12"
                disabled={cart.length === 0 || !activeShift}
                onClick={() => pay("other")}
              >
                Non-Tunai
              </Button>
              <Button
                className="h-12"
                disabled={cart.length === 0 || !activeShift}
                onClick={() => pay("cash")}
              >
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

      <NumpadDialog
        open={discountFor !== null}
        title={`Diskon % — ${discountFor?.product.name ?? ""}`}
        initialValue={discountFor?.discount_percent ?? 0}
        max={100}
        presets={DISCOUNT_PRESETS}
        onClose={() => setDiscountFor(null)}
        onSubmit={(value) => {
          if (discountFor) setStoreDiscount(discountFor.product.id, value);
          setDiscountFor(null);
        }}
      />

      <NumpadDialog
        open={txDiscOpen}
        title="Diskon transaksi (%)"
        initialValue={txPercent}
        max={100}
        presets={DISCOUNT_PRESETS}
        onClose={() => setTxDiscOpen(false)}
        onSubmit={(value) => {
          setTxPercent(Math.min(100, Math.max(0, Math.round(value))));
          setTxDiscOpen(false);
        }}
      />

      <ReceiptDialog
        open={receipt !== null}
        onClose={() => setReceipt(null)}
        transaction={receipt?.transaction ?? null}
        items={receipt?.items ?? []}
        settings={settings}
      />

      <NumpadDialog
        open={openCash}
        title="Modal awal shift"
        initialValue={0}
        onClose={() => setOpenCash(false)}
        onSubmit={async (value) => {
          setOpenCash(false);
          await doOpenShift(value);
        }}
      />

      <NumpadDialog
        open={closeCash}
        title="Uang fisik di kasir (tutup shift)"
        initialValue={0}
        onClose={() => setCloseCash(false)}
        onSubmit={async (value) => {
          setCloseCash(false);
          await doCloseShift(value);
        }}
      />

      <Dialog open={shiftResult !== null} onOpenChange={(o) => !o && setShiftResult(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Shift Ditutup</DialogTitle>
          </DialogHeader>
          {shiftResult && (
            <div className="space-y-2 text-sm">
              <Row label="Kas sistem" value={rupiah(shiftResult.closing_cash_system ?? 0)} />
              <Row label="Kas aktual" value={rupiah(shiftResult.closing_cash_actual ?? 0)} />
              <div
                className={`mt-1 flex items-center justify-between border-t border-border pt-2 text-base font-bold ${
                  (shiftResult.selisih ?? 0) >= 0 ? "text-foreground" : "text-destructive"
                }`}
              >
                <span>Selisih</span>
                <span className="tabular-nums">
                  {shiftResult.selisih !== null ? rupiah(shiftResult.selisih) : "-"}
                </span>
              </div>
            </div>
          )}
          <Button className="h-11 w-full" onClick={() => setShiftResult(null)}>
            Tutup
          </Button>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
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
