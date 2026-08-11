import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { PinDialog } from "@/components/pos/PinDialog";
import { StoreIdentityForm } from "@/components/pos/StoreIdentityForm";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  clearAllData,
  exportAllData,
  getSettings,
  importAllData,
  isValidBackup,
  saveSettings,
  type BackupFile,
} from "@/lib/db/pos-db";
import { hashPin, randomSalt, verifyPin } from "@/lib/pin";

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

type Guarded = { kind: "restore"; backup: BackupFile } | { kind: "clear" };

function PengaturanPage() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const fileRef = useRef<HTMLInputElement>(null);

  const [pinOpen, setPinOpen] = useState(false);
  const [confirmPin, setConfirmPin] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);

  const [pending, setPending] = useState<Guarded | null>(null);
  const [guardPin, setGuardPin] = useState<Guarded | null>(null);
  const [guardError, setGuardError] = useState<string | null>(null);

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

  const refreshAll = async () => {
    await queryClient.invalidateQueries();
  };

  const doBackup = async () => {
    try {
      const data = await exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `cadangan-pos-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Cadangan diunduh");
    } catch {
      toast.error("Gagal membuat cadangan");
    }
  };

  const pickBackupFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isValidBackup(parsed)) {
        toast.error("Berkas cadangan tidak valid");
        return;
      }
      setPending({ kind: "restore", backup: parsed });
    } catch {
      toast.error("Berkas cadangan tidak bisa dibaca");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const runAction = async (action: Guarded) => {
    try {
      if (action.kind === "restore") {
        await importAllData(action.backup);
        toast.success("Data berhasil dipulihkan");
      } else {
        await clearAllData();
        toast.success("Semua data transaksi & produk dihapus");
      }
      await refreshAll();
    } catch {
      toast.error("Aksi gagal dijalankan");
    }
  };

  const confirmAction = async () => {
    const action = pending;
    setPending(null);
    if (!action) return;
    if (settings?.pin_hash) {
      setGuardError(null);
      setGuardPin(action);
      return;
    }
    await runAction(action);
  };

  const submitGuardPin = async (pin: string) => {
    const ok = await verifyPin(pin, settings?.pin_salt ?? null, settings?.pin_hash ?? null);
    if (!ok) {
      setGuardError("PIN salah");
      return;
    }
    const action = guardPin;
    setGuardPin(null);
    if (action) await runAction(action);
  };

  return (
    <AppShell title="Pengaturan">
      <div className="space-y-4">
        <StoreIdentityForm settings={settings} />

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-bold text-foreground">PIN Keamanan</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {settings?.pin_hash
              ? "PIN aktif. Dibutuhkan saat menghapus transaksi & memulihkan data."
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

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-bold text-foreground">Cadangan &amp; Pulihkan Data</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Simpan seluruh data ke satu berkas, atau pulihkan dari cadangan sebelumnya.
          </p>
          <div className="mt-3 grid gap-2">
            <Button variant="outline" className="h-11 justify-start" onClick={doBackup}>
              <Download className="mr-2 h-4 w-4" /> Cadangkan data
            </Button>
            <Button
              variant="outline"
              className="h-11 justify-start"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" /> Pulihkan dari berkas
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => void pickBackupFile(e.target.files?.[0])}
            />
            <Button
              variant="outline"
              className="h-11 justify-start text-destructive"
              onClick={() => setPending({ kind: "clear" })}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Hapus semua data
            </Button>
          </div>
        </section>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Semua data tersimpan lokal di perangkat ini dan bekerja tanpa internet.
      </p>

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.kind === "restore" ? "Pulihkan data?" : "Hapus semua data?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === "restore"
                ? "Seluruh data saat ini akan diganti dengan isi berkas cadangan. Tindakan ini tidak bisa dibatalkan."
                : "Semua produk, kategori, dan transaksi akan dihapus permanen. Identitas toko dan PIN tetap disimpan."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmAction()}>Lanjutkan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      <PinDialog
        open={guardPin !== null}
        title="Masukkan PIN"
        description="Konfirmasi keamanan untuk melanjutkan tindakan ini."
        error={guardError}
        onClose={() => setGuardPin(null)}
        onSubmit={submitGuardPin}
      />
    </AppShell>
  );
}
