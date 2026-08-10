import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteProduct,
  listCategories,
  listProducts,
  saveCategory,
  saveProduct,
} from "@/lib/db/pos-db";
import type { Product } from "@/lib/db/types";
import { parseRupiahInput, rupiah } from "@/lib/format";

export const Route = createFileRoute("/produk")({
  head: () => ({
    meta: [
      { title: "Produk — POS Offline untuk UMKM" },
      {
        name: "description",
        content: "Kelola produk, kategori, harga jual, HPP, dan stok toko Anda secara offline.",
      },
      { property: "og:title", content: "Produk — POS Offline untuk UMKM" },
      {
        property: "og:description",
        content: "Kelola produk, kategori, harga jual, HPP, dan stok secara offline.",
      },
    ],
  }),
  component: ProdukPage,
});

type Draft = {
  id?: string;
  name: string;
  photo_path: string | null;
  sell_price: string;
  cost_price: string;
  category_id: string;
  stock: string;
  unlimited: boolean;
};

const emptyDraft: Draft = {
  name: "",
  photo_path: null,
  sell_price: "",
  cost_price: "",
  category_id: "none",
  stock: "0",
  unlimited: false,
};

function ProdukPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newCat, setNewCat] = useState("");
  const [catOpen, setCatOpen] = useState(false);

  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: listProducts });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["categories"] });
  };

  const saveMutation = useMutation({
    mutationFn: async (d: Draft) => {
      if (!d.name.trim()) throw new Error("Nama produk wajib diisi");
      const sell = parseRupiahInput(d.sell_price);
      if (sell <= 0) throw new Error("Harga jual wajib diisi");
      const product: Omit<Product, "id"> & { id?: string | undefined } = {
        id: d.id,
        name: d.name.trim(),
        photo_path: d.photo_path,
        sell_price: sell,
        cost_price: d.cost_price.trim() === "" ? null : parseRupiahInput(d.cost_price),
        category_id: d.category_id === "none" ? null : d.category_id,
        stock: d.unlimited ? null : d.stock.trim() === "" ? 0 : parseRupiahInput(d.stock),
        is_active: true,
      };
      return saveProduct(product);
    },
    onSuccess: () => {
      setDraft(null);
      invalidate();
      toast.success("Produk tersimpan");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Gagal menyimpan"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      invalidate();
      toast.success("Produk dihapus");
    },
  });

  const onPhoto = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () =>
      setDraft((prev) => (prev ? { ...prev, photo_path: String(reader.result) } : prev));
    reader.readAsDataURL(file);
  };

  return (
    <AppShell title="Produk">
      <div className="mb-4 flex gap-2">
        <Button className="flex-1 h-11" onClick={() => setDraft({ ...emptyDraft })}>
          <Plus className="mr-1 h-4 w-4" /> Produk
        </Button>
        <Button variant="outline" className="h-11" onClick={() => setCatOpen(true)}>
          Kategori
        </Button>
      </div>

      <div className="space-y-2">
        {products.map((p) => {
          const cat = categories.find((c) => c.id === p.category_id);
          return (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                {p.photo_path ? (
                  <img src={p.photo_path} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="font-bold text-muted-foreground">{p.name.slice(0, 1)}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {rupiah(p.sell_price)}
                  {p.cost_price === null ? " · HPP belum diisi" : ` · HPP ${rupiah(p.cost_price)}`}
                  {cat ? ` · ${cat.name}` : ""}
                </p>
                <StockBadge stock={p.stock} />
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() =>
                  setDraft({
                    id: p.id,
                    name: p.name,
                    photo_path: p.photo_path,
                    sell_price: String(p.sell_price),
                    cost_price: p.cost_price === null ? "" : String(p.cost_price),
                    category_id: p.category_id ?? "none",
                    stock: p.stock === null ? "0" : String(p.stock),
                    unlimited: p.stock === null,
                  })
                }
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(p.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          );
        })}
      </div>

      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Ubah Produk" : "Produk Baru"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="nama">Nama produk</Label>
                <Input
                  id="nama"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="foto">Foto</Label>
                <Input
                  id="foto"
                  type="file"
                  accept="image/*"
                  onChange={(e) => onPhoto(e.target.files?.[0])}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="harga">Harga jual</Label>
                  <Input
                    id="harga"
                    inputMode="numeric"
                    value={draft.sell_price}
                    onChange={(e) => setDraft({ ...draft, sell_price: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="hpp">HPP (opsional)</Label>
                  <Input
                    id="hpp"
                    inputMode="numeric"
                    value={draft.cost_price}
                    onChange={(e) => setDraft({ ...draft, cost_price: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Kategori</Label>
                <Select
                  value={draft.category_id}
                  onValueChange={(v) => setDraft({ ...draft, category_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tanpa kategori</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="stok">Stok</Label>
                <Input
                  id="stok"
                  inputMode="numeric"
                  placeholder="0"
                  disabled={draft.unlimited}
                  value={draft.unlimited ? "" : draft.stock}
                  onChange={(e) => setDraft({ ...draft, stock: e.target.value })}
                />
                <label className="mt-2 flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--color-primary)]"
                    checked={draft.unlimited}
                    onChange={(e) => setDraft({ ...draft, unlimited: e.target.checked })}
                  />
                  Stok tidak terbatas
                </label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Kosong = 0 (habis) · angka = stok terbatas
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              className="h-11 w-full"
              onClick={() => draft && saveMutation.mutate(draft)}
              disabled={saveMutation.isPending}
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kategori</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {categories.map((c) => (
              <div key={c.id} className="rounded-md border border-border px-3 py-2 text-sm">
                {c.name}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newCat}
              placeholder="Nama kategori baru"
              onChange={(e) => setNewCat(e.target.value)}
            />
            <Button
              onClick={async () => {
                if (!newCat.trim()) return;
                await saveCategory({ name: newCat.trim(), sort_order: categories.length + 1 });
                setNewCat("");
                invalidate();
              }}
            >
              Tambah
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function StockBadge({ stock }: { stock: number | null }) {
  if (stock === null)
    return <span className="text-[11px] text-muted-foreground">Stok tidak terbatas</span>;
  if (stock === 0)
    return (
      <span className="inline-flex rounded bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
        Stok Habis
      </span>
    );
  return <span className="text-[11px] font-medium text-foreground">Stok {stock}</span>;
}
