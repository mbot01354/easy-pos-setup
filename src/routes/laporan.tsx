import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/pos/AppShell";
import { ReportSheet } from "@/components/pos/ReportSheet";
import { Input } from "@/components/ui/input";
import { getSettings, listAllTransactionItems, listTransactions } from "@/lib/db/pos-db";
import type { Transaction, TransactionItem } from "@/lib/db/types";
import { downloadCsv } from "@/lib/csv";
import { rupiah } from "@/lib/format";


export const Route = createFileRoute("/laporan")({
  head: () => ({
    meta: [
      { title: "Laporan Penjualan — POS Offline" },
      {
        name: "description",
        content: "Ringkasan omset, laba, produk terlaris, dan jam sibuk toko Anda.",
      },
      { property: "og:title", content: "Laporan Penjualan — POS Offline" },
      { property: "og:description", content: "Omset, laba, produk terlaris, dan jam sibuk." },
    ],
  }),
  component: LaporanPage,
});

type Range = "today" | "7d" | "30d" | "all" | "custom";

const DAY = 24 * 60 * 60 * 1000;
const PRIMARY = "var(--color-primary)";
const CHART_2 = "var(--color-chart-2)";
const MUTED = "var(--color-muted-foreground)";
const BORDER = "var(--color-border)";
const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function fmtDate(ts: number) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function rangeBounds(
  range: Range,
  customFrom: number | null,
  customTo: number | null,
): { from: number; to: number } {
  const now = Date.now();
  if (range === "today") return { from: startOfToday(), to: now };
  if (range === "7d") return { from: now - 7 * DAY, to: now };
  if (range === "30d") return { from: now - 30 * DAY, to: now };
  if (range === "custom") {
    const from = customFrom ?? 0;
    const to = (customTo ?? now) + DAY;
    return { from, to };
  }
  return { from: 0, to: now };
}

function compactRupiah(value: number) {
  if (value >= 1_000_000)
    return `${(value / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}jt`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}rb`;
  return String(value);
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="font-bold text-primary">
          {rupiah(p.value)}
        </p>
      ))}
    </div>
  );
}

type ProductRank = {
  product_id: string;
  name: string;
  qty: number;
  omset: number;
  laba: number;
  has_missing_hpp: boolean;
};

function LaporanPage() {
  const [range, setRange] = useState<Range>("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions"],
    queryFn: listTransactions,
  });
  const { data: allItems = [] } = useQuery({
    queryKey: ["all-transaction-items"],
    queryFn: listAllTransactionItems,
  });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });


  const report = useMemo(() => {
    const customFromTs = customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : null;
    const customToTs = customTo ? new Date(`${customTo}T00:00:00`).getTime() : null;
    const { from, to } = rangeBounds(range, customFromTs, customToTs);
    const active: Transaction[] = transactions.filter(
      (t) => t.status === "completed" && t.timestamp >= from && t.timestamp < to,
    );

    const itemsByTx = new Map<string, TransactionItem[]>();
    for (const item of allItems) {
      const list = itemsByTx.get(item.transaction_id);
      if (list) list.push(item);
      else itemsByTx.set(item.transaction_id, [item]);
    }

    // Omset sudah net diskon (disimpan di transaksi). Laba memakai total_laba
    // transaksi agar diskon item + diskon transaksi ikut terhitung, dan produk
    // tanpa HPP tidak diasumsikan HPP=0 (PRD §4.5).
    let omset = 0;
    let laba = 0;
    let totalHpp = 0;
    let qtyTotal = 0;
    let diskon = 0;
    for (const t of active) {
      omset += t.total_omset;
      laba += t.total_laba;
      diskon += t.discount_total ?? 0;
      for (const it of itemsByTx.get(t.id) ?? []) {
        qtyTotal += it.qty;
        if (it.hpp_at_sale !== null) totalHpp += it.hpp_at_sale * it.qty;
      }
    }
    const someMissing = active.some((t) => t.has_missing_hpp);
    const distinctDays = new Set(active.map((t) => new Date(t.timestamp).toDateString())).size;
    const spanDays = Math.max(1, distinctDays);

    // Leaderboard produk (per product_id, pakai snapshot nama)
    const rankMap = new Map<string, ProductRank>();
    for (const t of active) {
      for (const item of itemsByTx.get(t.id) ?? []) {
        const cur = rankMap.get(item.product_id) ?? {
          product_id: item.product_id,
          name: item.product_name,
          qty: 0,
          omset: 0,
          laba: 0,
          has_missing_hpp: false,
        };
        const missing = item.hpp_at_sale === null;
        const gross = item.price_at_sale * item.qty;
        const net = gross - Math.round((gross * (item.discount_percent ?? 0)) / 100);
        cur.qty += item.qty;
        cur.omset += net;
        if (!missing) cur.laba += net - (item.hpp_at_sale ?? 0) * item.qty;
        cur.has_missing_hpp = cur.has_missing_hpp || missing;
        rankMap.set(item.product_id, cur);
      }
    }
    const leaderboard = Array.from(rankMap.values())
      .sort((a, b) => b.qty - a.qty || b.omset - a.omset)
      .slice(0, 8);

    // Jam sibuk (0-23)
    const hours = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${String(h).padStart(2, "0")}.00`,
      omset: 0,
      transaksi: 0,
    }));
    for (const t of active) {
      const bucket = hours[new Date(t.timestamp).getHours()];
      if (!bucket) continue;
      bucket.omset += t.total_omset;
      bucket.transaksi += 1;
    }

    // Hari sibuk (agregasi Senin–Minggu)
    const weekdays = WEEKDAYS.map((label) => ({ label, omset: 0, transaksi: 0 }));
    for (const t of active) {
      const idx = (new Date(t.timestamp).getDay() + 6) % 7;
      const day = weekdays[idx];
      if (!day) continue;
      day.omset += t.total_omset;
      day.transaksi += 1;
    }

    return {
      count: active.length,
      omset,
      laba,
      totalHpp,
      qtyTotal,
      diskon,
      someMissing,
      spanDays,
      hours,
      weekdays,
      leaderboard,
    };
  }, [transactions, allItems, range, customFrom, customTo]);

  const wide = Math.max(320, report.hours.length * 22);

  const periodLabel =
    range === "today"
      ? "Hari ini"
      : range === "7d"
        ? "7 hari terakhir"
        : range === "30d"
          ? "30 hari terakhir"
          : range === "all"
            ? "Semua waktu"
            : `${customFrom || "-"} s/d ${customTo || "-"}`;

  const exportCsv = () => {
    const rows: Array<Array<string | number>> = [
      [settings?.store_name ?? "Toko Saya"],
      ["Laporan Penjualan", periodLabel],
      ["Dicetak", new Date().toLocaleString("id-ID")],
      [],
      ["Ringkasan"],
      ["Omset", report.omset],
      ["Jumlah transaksi", report.count],
      ["Item terjual", report.qtyTotal],
      ["Rata-rata per hari", report.spanDays > 0 ? Math.round(report.omset / report.spanDays) : 0],
      ["Total diskon", report.diskon],
      ["Total HPP", report.totalHpp],
      ["Laba kotor", report.laba],
      ["Margin (%)", report.omset > 0 ? Math.round((report.laba / report.omset) * 100) : 0],
      [],
      ["Produk terlaris"],
      ["#", "Produk", "Qty", "Omset", "Laba"],
      ...report.leaderboard.map((p, i) => [i + 1, p.name, p.qty, p.omset, p.laba]),
      [],
      ["Omset per hari"],
      ["Hari", "Transaksi", "Omset"],
      ...report.weekdays.map((d) => [d.label, d.transaksi, d.omset]),
      [],
      ["Omset per jam"],
      ["Jam", "Transaksi", "Omset"],
      ...report.hours.map((h) => [h.label, h.transaksi, h.omset]),
    ];
    downloadCsv(`laporan-${fmtDate(Date.now())}.csv`, rows);
  };

  const pickCustom = () => {
    if (range === "custom") return;
    setRange("custom");
    if (!customFrom) setCustomFrom(fmtDate(Date.now() - 30 * DAY));
    if (!customTo) setCustomTo(fmtDate(Date.now()));
  };


  return (
    <AppShell title="Laporan">
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {(
          [
            ["today", "Hari ini"],
            ["7d", "7 hari"],
            ["30d", "30 hari"],
            ["all", "Semua"],
            ["custom", "Kustom"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => (value === "custom" ? pickCustom() : setRange(value))}
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

      {range === "custom" && (
        <div className="-mx-4 mb-4 grid grid-cols-2 gap-2 px-4">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Dari</p>
            <Input
              type="date"
              className="h-11"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Sampai</p>
            <Input
              type="date"
              className="h-11"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </div>
        </div>
      )}

      {report.count === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <p className="text-sm font-semibold text-foreground">Belum ada transaksi</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tidak ada penjualan pada rentang waktu ini.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {report.someMissing && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-medium text-amber-900">
              Sebagian produk belum diisi HPP — laba, margin, dan total HPP dihitung dari produk
              ber-HPP saja.
            </div>
          )}

          {/* Ringkasan */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Omset"
              value={rupiah(report.omset)}
              sub={`${report.count} transaksi`}
              highlight
            />
            <StatCard
              label="Transaksi"
              value={String(report.count)}
              sub={report.qtyTotal > 0 ? `${report.qtyTotal} item` : "—"}
            />
            <StatCard
              label="Rata-rata / hari"
              value={rupiah(report.spanDays > 0 ? Math.round(report.omset / report.spanDays) : 0)}
              sub={`${report.spanDays} hari aktif`}
            />
            <StatCard
              label="Laba"
              value={rupiah(report.laba)}
              sub={report.someMissing ? "HPP belum lengkap" : `${report.qtyTotal} item terjual`}
            />
            <StatCard
              label="Total HPP"
              value={rupiah(report.totalHpp)}
              sub={report.someMissing ? "sebagian kosong" : "harga pokok terjual"}
            />
            <StatCard
              label="Margin"
              value={report.omset > 0 ? `${Math.round((report.laba / report.omset) * 100)}%` : "0%"}
              sub="laba terhadap omset"
            />
            <StatCard
              label="Total Diskon"
              value={rupiah(report.diskon)}
              sub="diskon item + transaksi"
            />
          </div>

          {/* Jam sibuk */}
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-bold text-foreground">Jam sibuk</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Omset per jam</p>
            <div className="no-scrollbar mt-3 overflow-x-auto">
              <div style={{ width: wide }}>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={report.hours} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={BORDER} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: MUTED, fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: BORDER }}
                      interval={2}
                    />
                    <YAxis
                      tick={{ fill: MUTED, fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={38}
                      tickFormatter={(v: number) => compactRupiah(v)}
                    />
                    <Tooltip
                      content={<ChartTooltip />}
                      cursor={{ fill: "var(--color-accent)", opacity: 0.4 }}
                    />
                    <Bar dataKey="omset" radius={[4, 4, 0, 0]}>
                      {report.hours.map((h) => (
                        <Cell key={h.hour} fill={h.omset > 0 ? PRIMARY : "transparent"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Puncak:{" "}
              <span className="font-semibold text-foreground">
                {report.hours.find((h) => h.omset === Math.max(...report.hours.map((x) => x.omset)))
                  ?.label ?? "-"}
              </span>{" "}
              ({report.hours.reduce((a, h) => a + h.transaksi, 0)} transaksi)
            </p>
          </section>

          {/* Hari sibuk */}
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-bold text-foreground">Hari sibuk</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Omset per hari (Senin–Minggu)</p>
            <div className="mt-3">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={report.weekdays} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={BORDER} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: MUTED, fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: BORDER }}
                    interval={0}
                  />
                  <YAxis
                    tick={{ fill: MUTED, fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={38}
                    tickFormatter={(v: number) => compactRupiah(v)}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: "var(--color-accent)", opacity: 0.4 }}
                  />
                  <Bar dataKey="omset" radius={[4, 4, 0, 0]}>
                    {report.weekdays.map((d) => (
                      <Cell key={d.label} fill={d.omset > 0 ? CHART_2 : "transparent"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Puncak:{" "}
              <span className="font-semibold text-foreground">
                {report.weekdays.reduce(
                  (best, d) => (d.omset > (best?.omset ?? -1) ? d : best),
                  null as { label: string; omset: number } | null,
                )?.label ?? "-"}
              </span>
            </p>
          </section>

          {/* Produk terlaris */}
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-bold text-foreground">Produk terlaris</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Berdasarkan jumlah item terjual ({report.leaderboard.length} teratas)
            </p>
            {report.leaderboard.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Belum ada data penjualan produk.</p>
            ) : (
              <ol className="mt-3 space-y-2">
                {report.leaderboard.map((p, i) => (
                  <li
                    key={p.product_id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-background p-3"
                  >
                    <RankBadge rank={i + 1} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.qty} item · omset {rupiah(p.omset)}
                        {p.has_missing_hpp ? " · HPP belum diisi" : ` · laba ${rupiah(p.laba)}`}
                      </p>
                    </div>
                    <span className="text-base font-bold text-primary">{rupiah(p.omset)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="print-hide grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={exportCsv}
              className="h-12 rounded-xl bg-secondary text-sm font-bold text-secondary-foreground"
            >
              Ekspor CSV / Excel
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="h-12 rounded-xl bg-primary text-sm font-bold text-primary-foreground"
            >
              Cetak / Simpan PDF
            </button>
          </section>

          <p className="pb-2 text-center text-xs text-muted-foreground">
            Semua data dihitung dari transaksi yang tersimpan di perangkat ini.
          </p>

          <ReportSheet
            storeName={settings?.store_name ?? "Toko Saya"}
            periodLabel={periodLabel}
            data={report}
          />
        </div>
      )}
    </AppShell>
  );

}

function StatCard({
  label,
  value,
  sub,
  highlight = false,
}: {
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-border p-3 ${
        highlight ? "bg-primary text-primary-foreground" : "bg-card"
      }`}
    >
      <p
        className={`text-xs font-medium ${highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}
      >
        {label}
      </p>
      <p
        className={`mt-0.5 text-lg font-extrabold tabular-nums ${
          highlight ? "text-primary-foreground" : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p
        className={`mt-0.5 text-[11px] ${highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}
      >
        {sub}
      </p>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const styles =
    rank === 1
      ? "bg-amber-400 text-amber-950"
      : rank === 2
        ? "bg-slate-300 text-slate-800"
        : rank === 3
          ? "bg-orange-300 text-orange-900"
          : "bg-muted text-muted-foreground";
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${styles}`}
    >
      {rank}
    </span>
  );
}
