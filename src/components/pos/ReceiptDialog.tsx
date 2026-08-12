import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { StoreSettings, Transaction, TransactionItem } from "@/lib/db/types";
import { rupiah } from "@/lib/format";

type Props = {
  open: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  items: TransactionItem[];
  settings: StoreSettings | null | undefined;
};

function fullDate(ts: number) {
  return new Date(ts).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReceiptDialog({ open, onClose, transaction, items, settings }: Props) {
  if (!transaction) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="no-scrollbar max-h-[85vh] overflow-y-auto print-dialog">
        <DialogHeader className="print-hide">
          <DialogTitle>Struk Transaksi</DialogTitle>
        </DialogHeader>

        <div
          id="receipt-area"
          className="mx-auto w-full max-w-[280px] bg-card px-3 py-4 font-mono text-[11px] leading-tight text-foreground"
        >
          {settings?.logo_path && (
            <img
              src={settings.logo_path}
              alt={`Logo ${settings.store_name}`}
              className="mx-auto mb-2 h-14 w-14 rounded object-cover"
            />
          )}
          <p className="text-center text-sm font-bold uppercase">
            {settings?.store_name ?? "Toko Saya"}
          </p>
          {settings?.business_type && (
            <p className="text-center text-[10px]">{settings.business_type}</p>
          )}

          <div className="my-2 border-t border-dashed border-foreground/40" />
          <div className="flex justify-between">
            <span>No</span>
            <span>{transaction.id.slice(-8).toUpperCase()}</span>
          </div>
          <div className="flex justify-between">
            <span>Waktu</span>
            <span>{fullDate(transaction.timestamp)}</span>
          </div>
          <div className="my-2 border-t border-dashed border-foreground/40" />

          <div className="space-y-1">
            {items.map((item) => {
              const gross = item.price_at_sale * item.qty;
              const disc = Math.round((gross * (item.discount_percent ?? 0)) / 100);
              return (
                <div key={item.id}>
                  <p className="font-bold">{item.product_name}</p>
                  <div className="flex justify-between">
                    <span>
                      {item.qty} x {rupiah(item.price_at_sale)}
                    </span>
                    <span className="tabular-nums">{rupiah(gross)}</span>
                  </div>
                  {disc > 0 && (
                    <div className="flex justify-between">
                      <span>Diskon {item.discount_percent}%</span>
                      <span className="tabular-nums">-{rupiah(disc)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="my-2 border-t border-dashed border-foreground/40" />
          {(transaction.discount_total ?? 0) > 0 && (
            <>
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="tabular-nums">
                  {rupiah(transaction.total_omset + (transaction.discount_total ?? 0))}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Total Diskon</span>
                <span className="tabular-nums">-{rupiah(transaction.discount_total ?? 0)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between text-sm font-bold">
            <span>TOTAL</span>
            <span className="tabular-nums">{rupiah(transaction.total_omset)}</span>
          </div>
          <div className="flex justify-between">
            <span>Bayar</span>
            <span>{transaction.payment_method === "cash" ? "Tunai" : "Non-Tunai"}</span>
          </div>
          <div className="my-2 border-t border-dashed border-foreground/40" />
          <p className="text-center">Terima kasih atas kunjungan Anda</p>
        </div>

        <div className="print-hide grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11" onClick={onClose}>
            Tutup
          </Button>
          <Button className="h-11" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Cetak
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
