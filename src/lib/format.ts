export function rupiah(value: number) {
  return "Rp" + Math.round(value).toLocaleString("id-ID");
}

export function parseRupiahInput(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}
