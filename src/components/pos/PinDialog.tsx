import { useEffect, useState } from "react";
import { Delete } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function PinDialog({
  open,
  title,
  description,
  onClose,
  onSubmit,
  error,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  onSubmit: (pin: string) => void;
  error?: string | null;
}) {
  const [pin, setPin] = useState("");

  useEffect(() => {
    setPin("");
  }, [open, title, error]);

  const press = (key: string) => {
    if (key === "back") setPin((p) => p.slice(0, -1));
    else if (key === "clear") setPin("");
    else setPin((p) => (p.length >= 6 ? p : p + key));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        <div className="flex justify-center gap-2 py-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className={`h-3 w-3 rounded-full ${
                i < pin.length ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>
        {error && <p className="text-center text-sm font-medium text-destructive">{error}</p>}
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
        <Button
          className="h-12 text-base"
          disabled={pin.length < 4}
          onClick={() => {
            const value = pin;
            setPin("");
            onSubmit(value);
          }}
        >
          Lanjut
        </Button>
      </DialogContent>
    </Dialog>
  );
}
