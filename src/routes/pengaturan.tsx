import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/pos/AppShell";

export const Route = createFileRoute("/pengaturan")({
  head: () => ({
    meta: [
      { title: "Pengaturan Toko — POS Offline" },
      {
        name: "description",
        content: "Atur nama toko, jenis usaha, logo struk, PIN keamanan, dan cadangan data.",
      },
      { property: "og:title", content: "Pengaturan Toko — POS Offline" },
      { property: "og:description", content: "Nama toko, logo struk, PIN, dan cadangan data." },
    ],
  }),
  component: PengaturanPage,
});

function PengaturanPage() {
  return (
    <AppShell title="Pengaturan">
      <div className="rounded-xl border border-dashed border-border p-6 text-center">
        <p className="text-sm font-semibold text-foreground">Menyusul di fase berikutnya</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Identitas toko, struk cetak, PIN keamanan, shift kasir, dan backup/restore data.
        </p>
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Semua data tersimpan lokal di perangkat ini dan bekerja tanpa internet.
      </p>
    </AppShell>
  );
}
