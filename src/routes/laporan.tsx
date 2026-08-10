import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/pos/AppShell";

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

function LaporanPage() {
  return (
    <AppShell title="Laporan">
      <div className="rounded-xl border border-dashed border-border p-6 text-center">
        <p className="text-sm font-semibold text-foreground">Menyusul di fase berikutnya</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Filter waktu, ringkasan omset/laba, leaderboard produk, dan grafik jam & hari sibuk.
        </p>
      </div>
    </AppShell>
  );
}
