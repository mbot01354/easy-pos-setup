/** Utilitas ekspor CSV (bisa dibuka di Excel / Google Sheets). */

function escapeCell(value: string | number) {
  const s = String(value ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Array<Array<string | number>>) {
  // pakai ; sebagai pemisah agar Excel locale Indonesia langsung rapi
  return rows.map((row) => row.map(escapeCell).join(";")).join("\r\n");
}

export function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  // BOM supaya karakter non-ASCII tampil benar di Excel
  const blob = new Blob(["\uFEFF" + toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
