import { rupiah } from "@/lib/format";

export type ReportSheetData = {
  count: number;
  omset: number;
  laba: number;
  totalHpp: number;
  qtyTotal: number;
  diskon: number;
  spanDays: number;
  someMissing: boolean;
  leaderboard: Array<{ product_id: string; name: string; qty: number; omset: number }>;
  weekdays: Array<{ label: string; omset: number; transaksi: number }>;
};

type Props = {
  storeName: string;
  periodLabel: string;
  data: ReportSheetData;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-black/20 py-1">
      <span>{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}

/**
 * Lembar laporan khusus cetak (Cetak → Simpan sebagai PDF).
 * Disembunyikan di layar, hanya muncul lewat aturan @media print.
 */
export function ReportSheet({ storeName, periodLabel, data }: Props) {
  const margin = data.omset > 0 ? Math.round((data.laba / data.omset) * 100) : 0;
  return (
    <div id="print-area" className="hidden text-[12px] leading-snug text-black">
      <div className="mx-auto max-w-[700px] p-6">
        <h1 className="text-lg font-bold">{storeName}</h1>
        <p>Laporan Penjualan — {periodLabel}</p>
        <p className="mb-4">Dicetak: {new Date().toLocaleString("id-ID")}</p>

        <h2 className="mb-1 font-bold">Ringkasan</h2>
        <Row label="Omset" value={rupiah(data.omset)} />
        <Row label="Jumlah transaksi" value={String(data.count)} />
        <Row label="Item terjual" value={String(data.qtyTotal)} />
        <Row
          label="Rata-rata / hari"
          value={rupiah(data.spanDays > 0 ? Math.round(data.omset / data.spanDays) : 0)}
        />
        <Row label="Total diskon" value={rupiah(data.diskon)} />
        <Row label="Total HPP" value={rupiah(data.totalHpp)} />
        <Row label="Laba kotor" value={rupiah(data.laba)} />
        <Row label="Margin" value={`${margin}%`} />
        {data.someMissing && (
          <p className="mt-2">
            Catatan: sebagian produk belum diisi HPP — laba & margin dihitung dari produk ber-HPP
            saja.
          </p>
        )}

        <h2 className="mt-5 mb-1 font-bold">Produk terlaris</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="py-1">#</th>
              <th className="py-1">Produk</th>
              <th className="py-1 text-right">Qty</th>
              <th className="py-1 text-right">Omset</th>
            </tr>
          </thead>
          <tbody>
            {data.leaderboard.map((p, i) => (
              <tr key={p.product_id} className="border-b border-black/20">
                <td className="py-1">{i + 1}</td>
                <td className="py-1">{p.name}</td>
                <td className="py-1 text-right">{p.qty}</td>
                <td className="py-1 text-right">{rupiah(p.omset)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mt-5 mb-1 font-bold">Omset per hari</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="py-1">Hari</th>
              <th className="py-1 text-right">Transaksi</th>
              <th className="py-1 text-right">Omset</th>
            </tr>
          </thead>
          <tbody>
            {data.weekdays.map((d) => (
              <tr key={d.label} className="border-b border-black/20">
                <td className="py-1">{d.label}</td>
                <td className="py-1 text-right">{d.transaksi}</td>
                <td className="py-1 text-right">{rupiah(d.omset)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
