import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSettings } from "@/lib/db/pos-db";
import type { StoreSettings } from "@/lib/db/types";
import { fileToCompressedDataUrl } from "@/lib/image";
import { DEFAULT_LOW_STOCK_THRESHOLD } from "@/lib/stock";

export function StoreIdentityForm({ settings }: { settings: StoreSettings | undefined }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [threshold, setThreshold] = useState("5");
  const [saving, setSaving] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (!settings || initialized.current) return;
    initialized.current = true;
    setName(settings.store_name);
    setType(settings.business_type);
    setLogo(settings.logo_path);
    setThreshold(String(settings.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD));
  }, [settings]);

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    try {
      setLogo(await fileToCompressedDataUrl(file, 320, 0.8));
    } catch {
      toast.error("Gagal memuat gambar");
    }
  };

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Nama toko wajib diisi");
      return;
    }
    const parsedThreshold = Number.parseInt(threshold, 10);
    if (Number.isNaN(parsedThreshold) || parsedThreshold < 0) {
      toast.error("Ambang stok menipis harus angka 0 atau lebih");
      return;
    }
    setSaving(true);
    try {
      await saveSettings({
        id: "default",
        pin_hash: settings?.pin_hash ?? null,
        pin_salt: settings?.pin_salt ?? null,
        store_name: name.trim(),
        business_type: type.trim(),
        logo_path: logo,
        ...(settings?.seeded !== undefined ? { seeded: settings.seeded } : {}),
        low_stock_threshold: parsedThreshold,
      });
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Identitas toko tersimpan");
    } catch {
      toast.error("Gagal menyimpan identitas");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-bold text-foreground">Identitas Toko</h2>
      <p className="mt-1 text-sm text-muted-foreground">Tampil di bagian atas struk.</p>

      <div className="mt-4 flex items-center gap-3">
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
          {logo ? (
            <>
              <img src={logo} alt="Logo toko" className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label="Hapus logo"
                onClick={() => setLogo(null)}
                className="absolute right-1 top-1 rounded-full bg-destructive p-1 text-destructive-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </>
          ) : (
            <ImagePlus className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-border px-3 text-sm font-semibold">
          Pilih Logo
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void pickLogo(e.target.files?.[0])}
          />
        </label>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <Label htmlFor="store-name">Nama toko</Label>
          <Input
            id="store-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Warung Bu Sari"
            className="mt-1 h-11"
          />
        </div>
        <div>
          <Label htmlFor="store-type">Jenis usaha</Label>
          <Input
            id="store-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder="Warung Makan"
            className="mt-1 h-11"
          />
        </div>
        <div>
          <Label htmlFor="low-stock">Ambang stok menipis</Label>
          <Input
            id="low-stock"
            inputMode="numeric"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value.replace(/\D/g, ""))}
            placeholder="5"
            className="mt-1 h-11"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Produk dengan sisa stok sampai angka ini ditandai &quot;Stok menipis&quot;.
          </p>
        </div>
      </div>

      <Button className="mt-4 h-11 w-full" disabled={saving} onClick={submit}>
        Simpan Identitas
      </Button>
    </section>
  );
}
