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
import { listAllTransactionItems, listTransactions } from "@/lib/db/pos-db";
import type { Transaction, TransactionItem } from "@/lib/db/types";
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

type Range = "today" | "7d" | "30d" | "all";

const DAY = 24 * 60 * 60 * 1000;
const PRIMARY = "var(--color-primary)";
const CHART_2 = "var(--color-chart-2)";
const MUTED = "var(--color-muted-foreground)";
const BORDER = "var(--color-border)";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function rangeFrom(range: Range): number {
  if (range === "today") return startOfToday();
  if (range === "7d") return Date.now() - 7 * DAY;
  if (range === "30d") return Date.now() - 30 * DAY;
  return 0;
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

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions"],
    queryFn: listTransactions,
  });
  const { data: allItems = [] } = useQuery({
    queryKey: ["all-transaction-items"],
    queryFn: listAllTransactionItems,
  });

  const report = useMemo(() => {
    const from = rangeFrom(range);
    const active: Transaction[] = transactions.filter(
      (t) => t.status === "completed" && t.timestamp >= from,
    );

    const itemsByTx = new Map<string, TransactionItem[]>();
    for (const item of allItems) {
      const list = itemsByTx.get(item.transaction_id);
      if (list) list.push(item);
      else itemsByTx.set(item.transaction_id, [item]);
    }

    const omset = active.reduce((s, t) => s + t.total_omset, 0);
    const laba = active.reduce((s, t) => s + t.total_laba, 0);
    const qtyTotal = active.reduce((s, t) => {
      const items = itemsByTx.get(t.id);
      return s + (items?.reduce((a, it) => a + it.qty, 0) ?? 0);
    }, 0);

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
        cur.qty += item.qty;
        cur.omset += item.price_at_sale * item.qty;
        cur.laba += (item.price_at_sale - (item.hpp_at_sale ?? 0)) * item.qty;
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
      const h = new Date(t.timestamp).getHours();
      hours[h].omset += t.total_omset;
      hours[h].transaksi += 1;
    }

    // Hari sibuk (bucket per tanggal)
    const dayMap = new Map<string, { label: string; omset: number; transaksi: number }>();
    for (const t of active) {
      const d = new Date(t.timestamp);
      const key = d.toDateString();
      const label = d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
      const cur = dayMap.get(key) ?? { label, omset: 0, transaksi: 0 };
      cur.omset += t.total_omset;
      cur.transaksi += 1;
      dayMap.set(key, cur);
    }
    const days = Array.from(dayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-60)
      .map(([, v]) => v);

    return { count: active.length, omset, laba, qtyTotal, hours, days, leaderboard };
  }, [transactions, allItems, range]);

  const showDaysChart = range !== "today";
  const wide = Math.max(320, report.hours.length * 22);

  return (
    <AppShell title="Laporan">
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {(
          [
            ["today", "Hari ini"],
            ["7d", "7 hari"],
            ["30d", "30 hari"],
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

      {report.count === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <p className="text-sm font-semibold text-foreground">Belum ada transaksi</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tidak ada penjualan pada rentang waktu ini.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Ringkasan */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Omset"
              value={rupiah(report.omset)}
              sub={`${report.count} transaksi`}
              highlight
            />
            <StatCard
              label="Laba"
              value={rupiah(report.laba)}
              sub={report.qtyTotal > 0 ? `${report.qtyTotal} item terjual` : "—"}
            />
            <StatCard
              label="Rata-rata / trx"
              value={rupiah(report.count > 0 ? Math.round(report.omset / report.count) : 0)}
              sub="per transaksi"
            />
            <StatCard
              label="Margin"
              value={report.omset > 0 ? `${Math.round((report.laba / report.omset) * 100)}%` : "0%"}
              sub="laba terhadap omset"
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
          {showDaysChart && report.days.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-bold text-foreground">Hari sibuk</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Omset per tanggal</p>
              <div className="no-scrollbar mt-3 overflow-x-auto">
                <div style={{ width: Math.max(320, report.days.length * 46) }}>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={report.days} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={BORDER} vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: MUTED, fontSize: 10 }}
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
                      <Bar dataKey="omset" radius={[4, 4, 0, 0]} fill={CHART_2} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>
          )}

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

          <p className="pb-2 text-center text-xs text-muted-foreground">
            Semua data dihitung dari transaksi yang tersimpan di perangkat ini.
          </p>
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
