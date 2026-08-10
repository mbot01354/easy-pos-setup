import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { PinDialog } from "@/components/pos/PinDialog";
import { Button } from "@/components/ui/button";
import { getSettings, saveSettings } from "@/lib/db/pos-db";
import { hashPin, randomSalt } from "@/lib/pin";

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
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const [pinOpen, setPinOpen] = useState(false);
  const [confirmPin, setConfirmPin] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);

  const savePin = async (pin: string) => {
    if (confirmPin === null) {
      setPinError(null);
      setConfirmPin(pin);
      return;
    }
    if (confirmPin !== pin) {
      setPinError("PIN tidak sama, ulangi");
      setConfirmPin(null);
      return;
    }
    if (!settings) return;
    const salt = randomSalt();
    const hash = await hashPin(pin, salt);
    await saveSettings({ ...settings, pin_salt: salt, pin_hash: hash });
    setPinOpen(false);
    setConfirmPin(null);
    await queryClient.invalidateQueries({ queryKey: ["settings"] });
    toast.success("PIN tersimpan");
  };

  const removePin = async () => {
    if (!settings) return;
    await saveSettings({ ...settings, pin_salt: null, pin_hash: null });
    await queryClient.invalidateQueries({ queryKey: ["settings"] });
    toast.success("PIN dihapus");
  };

  return (
    <AppShell title="Pengaturan">
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-bold text-foreground">PIN Keamanan</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {settings?.pin_hash
            ? "PIN aktif. Dibutuhkan saat menghapus transaksi."
            : "Belum ada PIN. Buat PIN 4-6 digit untuk melindungi aksi sensitif."}
        </p>
        <div className="mt-3 flex gap-2">
          <Button
            className="h-11 flex-1"
            onClick={() => {
              setConfirmPin(null);
              setPinError(null);
              setPinOpen(true);
            }}
          >
            {settings?.pin_hash ? "Ubah PIN" : "Buat PIN"}
          </Button>
          {settings?.pin_hash && (
            <Button variant="outline" className="h-11" onClick={removePin}>
              Hapus PIN
            </Button>
          )}
        </div>
      </section>

      <div className="mt-4 rounded-xl border border-dashed border-border p-6 text-center">
        <p className="text-sm font-semibold text-foreground">Menyusul di fase berikutnya</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Identitas toko &amp; struk, laporan, shift kasir, dan backup/restore data.
        </p>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Semua data tersimpan lokal di perangkat ini dan bekerja tanpa internet.
      </p>

      <PinDialog
        open={pinOpen}
        title={confirmPin === null ? "Buat PIN baru" : "Ulangi PIN"}
        description={
          confirmPin === null ? "Masukkan 4-6 digit angka." : "Masukkan PIN yang sama sekali lagi."
        }
        error={pinError}
        onClose={() => {
          setPinOpen(false);
          setConfirmPin(null);
        }}
        onSubmit={savePin}
      />
    </AppShell>
  );
}
