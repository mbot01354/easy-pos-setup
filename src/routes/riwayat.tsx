import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/pos/AppShell";

export const Route = createFileRoute("/riwayat")({
  head: () => ({
    meta: [
      { title: "Riwayat Transaksi — POS Offline" },
      {
        name: "description",
        content: "Lihat riwayat transaksi kasir yang tersimpan di perangkat Anda.",
      },
      { property: "og:title", content: "Riwayat Transaksi — POS Offline" },
      { property: "og:description", content: "Riwayat transaksi kasir tersimpan di perangkat." },
    ],
  }),
  component: RiwayatPage,
});

function RiwayatPage() {
  return (
    <AppShell title="Riwayat">
      <div className="rounded-xl border border-dashed border-border p-6 text-center">
        <p className="text-sm font-semibold text-foreground">Menyusul di fase berikutnya</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Riwayat transaksi, hapus dengan PIN, dan void transaksi akan dibangun setelah fase Kasir
          disetujui.
        </p>
      </div>
    </AppShell>
  );
}
