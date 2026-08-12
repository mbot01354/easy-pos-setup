import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { PinDialog } from "@/components/pos/PinDialog";
import { ReceiptDialog } from "@/components/pos/ReceiptDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  deleteTransaction,
  getSettings,
  listTransactionItems,
  listTransactions,
  voidTransaction,
} from "@/lib/db/pos-db";
import type { Transaction } from "@/lib/db/types";
import { rupiah } from "@/lib/format";
import { verifyPin } from "@/lib/pin";

export const Route = createFileRoute("/riwayat")({
  head: () => ({
    meta: [
      { title: "Riwayat Transaksi — POS Offline" },
      {
        name: "description",
        content: "Lihat, telusuri, dan hapus riwayat transaksi kasir yang tersimpan di perangkat.",
      },
      { property: "og:title", content: "Riwayat Transaksi — POS Offline" },
      { property: "og:description", content: "Riwayat transaksi kasir tersimpan di perangkat." },
    ],
  }),
  component: RiwayatPage,
});

type Range = "today" | "7d" | "all";

const DAY = 24 * 60 * 60 * 1000;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dateLabel(ts: number) {
  return new Date(ts).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function timeLabel(ts: number) {
  return new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function RiwayatPage() {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<Range>("today");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions"],
    queryFn: listTransactions,
  });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const { data: detailItems = [] } = useQuery({
    queryKey: ["transaction-items", detailId],
    queryFn: () => listTransactionItems(detailId as string),
    enabled: detailId !== null,
  });

  const [voidPinTarget, setVoidPinTarget] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const filtered = useMemo(() => {
    const from = range === "today" ? startOfToday() : range === "7d" ? Date.now() - 7 * DAY : 0;
    return transactions.filter((t) => t.timestamp >= from);
  }, [transactions, range]);

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const key = dateLabel(t.timestamp);
      const arr = map.get(key);
      if (arr) arr.push(t);
      else map.set(key, [t]);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const detail = transactions.find((t) => t.id === detailId) ?? null;

  const askDelete = (id: string) => {
    if (!settings?.pin_hash) {
      toast.error("Buat PIN dulu di halaman Pengaturan untuk menghapus transaksi.");
      return;
    }
    setPinError(null);
    setPendingDelete(id);
  };

  const confirmDelete = async (pin: string) => {
    const ok = await verifyPin(pin, settings?.pin_salt ?? null, settings?.pin_hash ?? null);
    if (!ok) {
      setPinError("PIN salah");
      return;
    }
    const id = pendingDelete;
    setPendingDelete(null);
    if (!id) return;
    try {
      await deleteTransaction(id);
      setDetailId(null);
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Transaksi dihapus, stok dikembalikan");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus transaksi");
    }
  };

  const askVoid = (id: string) => {
    if (!settings?.pin_hash) {
      toast.error("Buat PIN dulu di halaman Pengaturan untuk membatalkan transaksi.");
      return;
    }
    setPinError(null);
    setVoidPinTarget(id);
  };

  const confirmVoidPin = async (pin: string) => {
    const ok = await verifyPin(pin, settings?.pin_salt ?? null, settings?.pin_hash ?? null);
    if (!ok) {
      setPinError("PIN salah");
      return;
    }
    const id = voidPinTarget;
    setVoidPinTarget(null);
    if (!id) return;
    setVoidReason("");
    setVoidTarget(id);
  };

  const runVoid = async () => {
    const id = voidTarget;
    if (!id) return;
    if (voidReason.trim().length < 3) {
      toast.error("Alasan wajib diisi (min. 3 karakter)");
      return;
    }
    try {
      await voidTransaction(id, voidReason.trim());
      setVoidTarget(null);
      setDetailId(null);
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["all-transaction-items"] });
      toast.success("Transaksi dibatalkan (void)");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membatalkan transaksi");
    }
  };

  return (
    <AppShell title="Riwayat">
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {(
          [
            ["today", "Hari ini"],
            ["7d", "7 hari"],
            ["all", "Semua"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setRange(value)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
              range === value
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Belum ada transaksi.</p>
      ) : (
        <div className="space-y-5">
          {groups.map(([label, rows]) => {
            const total = rows.reduce((s, t) => s + t.total_omset, 0);
            return (
              <section key={label}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {label}
                  </h2>
                  <span className="text-xs font-semibold text-foreground">{rupiah(total)}</span>
                </div>
                <div className="space-y-2">
                  {rows.map((t) => {
                    const isVoided = t.status === "voided";
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setDetailId(t.id)}
                        className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition active:scale-[0.99]"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-x-1.5 text-sm font-semibold text-foreground">
                            <span className={isVoided ? "text-muted-foreground" : ""}>
                              {timeLabel(t.timestamp)} ·{" "}
                              {t.payment_method === "cash" ? "Tunai" : "Non-Tunai"}
                            </span>
                            {isVoided && (
                              <span className="inline-flex rounded bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
                                Dibatalkan
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {isVoided
                              ? (t.void_reason ?? "Void")
                              : `Laba ${rupiah(t.total_laba)}${t.has_missing_hpp ? " (HPP belum lengkap)" : ""}`}
                          </p>
                        </div>
                        <span
                          className={`text-base font-bold ${
                            isVoided ? "text-muted-foreground line-through" : "text-primary"
                          }`}
                        >
                          {rupiah(t.total_omset)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detail Transaksi</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {dateLabel(detail.timestamp)} · {timeLabel(detail.timestamp)}
              </p>
              <div className="space-y-2">
                {detailItems.map((item) => {
                  const gross = item.price_at_sale * item.qty;
                  const disc = Math.round((gross * (item.discount_percent ?? 0)) / 100);
                  return (
                    <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-semibold">{item.product_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {rupiah(item.price_at_sale)} × {item.qty}
                          {disc > 0 && ` · diskon ${item.discount_percent}% (-${rupiah(disc)})`}
                        </p>
                      </div>
                      <span className="font-semibold tabular-nums">{rupiah(gross - disc)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="space-y-1 border-t border-border pt-3 text-sm">
                {(detail.discount_total ?? 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total diskon</span>
                    <span className="font-semibold">-{rupiah(detail.discount_total ?? 0)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span className="text-lg font-extrabold">{rupiah(detail.total_omset)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Laba</span>
                  <span className="font-semibold">{rupiah(detail.total_laba)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pembayaran</span>
                  <span className="font-semibold">
                    {detail.payment_method === "cash" ? "Tunai" : "Non-Tunai"}
                  </span>
                </div>
                {detail.status === "voided" && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <span className="font-semibold text-destructive">
                      Dibatalkan — {detail.void_reason ?? "tanpa alasan"}
                    </span>
                  </div>
                )}
              </div>
              <Button className="h-11 w-full" onClick={() => setReceiptOpen(true)}>
                <Printer className="mr-2 h-4 w-4" /> Lihat &amp; cetak struk
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full"
                disabled={detail.status === "voided"}
                onClick={() => askVoid(detail.id)}
              >
                <Ban className="mr-2 h-4 w-4" />
                {detail.status === "voided" ? "Transaksi dibatalkan" : "Void transaksi"}
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full text-destructive"
                onClick={() => askDelete(detail.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Hapus transaksi
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ReceiptDialog
        open={receiptOpen && detail !== null}
        onClose={() => setReceiptOpen(false)}
        transaction={detail}
        items={detailItems}
        settings={settings}
      />

      <PinDialog
        open={pendingDelete !== null}
        title="Masukkan PIN"
        description="Penghapusan transaksi akan mengembalikan stok produk."
        error={pinError}
        onClose={() => setPendingDelete(null)}
        onSubmit={confirmDelete}
      />

      <PinDialog
        open={voidPinTarget !== null}
        title="Masukkan PIN"
        description="Konfirmasi keamanan untuk membatalkan transaksi."
        error={pinError}
        onClose={() => setVoidPinTarget(null)}
        onSubmit={confirmVoidPin}
      />

      <Dialog open={voidTarget !== null} onOpenChange={(o) => !o && setVoidTarget(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Void Transaksi</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Transaksi akan ditandai <b>dibatalkan</b> dan dikecualikan dari laporan. Alasan wajib
              diisi untuk audit.
            </p>
            <div className="flex flex-wrap gap-2">
              {["Salah input", "Pesanan dibatalkan", "Barang tidak jadi"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setVoidReason(s)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    voidReason === s
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <Input
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Atau tulis alasan lain…"
              className="h-11"
            />
            <Button
              className="h-11 w-full"
              disabled={voidReason.trim().length < 3}
              onClick={() => void runVoid()}
            >
              Konfirmasi Void
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
