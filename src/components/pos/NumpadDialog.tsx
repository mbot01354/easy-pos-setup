import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Delete } from "lucide-react";

export function NumpadDialog({
  open,
  title,
  initialValue,
  onClose,
  onSubmit,
  max,
  presets,
}: {
  open: boolean;
  title: string;
  initialValue: number;
  onClose: () => void;
  onSubmit: (value: number) => void;
  max?: number | null;
  presets?: number[];
}) {
  const [raw, setRaw] = useState(String(initialValue));

  useEffect(() => {
    if (open) setRaw(String(initialValue));
  }, [open, initialValue]);

  const value = raw === "" ? 0 : parseInt(raw, 10);
  const tooMuch = typeof max === "number" && value > max;

  const press = (key: string) => {
    if (key === "back") setRaw((prev) => prev.slice(0, -1));
    else if (key === "clear") setRaw("");
    else setRaw((prev) => (prev === "0" ? key : (prev + key).slice(0, 5)));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="rounded-lg bg-muted px-4 py-3 text-right text-3xl font-bold tabular-nums">
          {raw === "" ? "0" : raw}
        </div>
        {tooMuch && <p className="text-sm font-medium text-destructive">Melebihi batas ({max})</p>}
        {presets && presets.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setRaw(String(p))}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  value === p
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground"
                }`}
              >
                {p}%
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
            <Button key={k} variant="secondary" className="h-14 text-xl" onClick={() => press(k)}>
              {k}
            </Button>
          ))}
          <Button variant="secondary" className="h-14 text-sm" onClick={() => press("clear")}>
            C
          </Button>
          <Button variant="secondary" className="h-14 text-xl" onClick={() => press("0")}>
            0
          </Button>
          <Button variant="secondary" className="h-14" onClick={() => press("back")}>
            <Delete className="h-5 w-5" />
          </Button>
        </div>
        <Button className="h-12 text-base" disabled={tooMuch} onClick={() => onSubmit(value)}>
          Simpan
        </Button>
      </DialogContent>
    </Dialog>
  );
}
