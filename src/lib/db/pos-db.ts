import type {
  CartLine,
  Category,
  PaymentMethod,
  Product,
  Shift,
  StoreSettings,
  Transaction,
  TransactionItem,
} from "./types";

const DB_NAME = "pos-offline";
const DB_VERSION = 1;

export const STORES = {
  products: "products",
  categories: "categories",
  transactions: "transactions",
  transactionItems: "transaction_items",
  settings: "settings",
  shifts: "shifts",
} as const;

export function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB tidak tersedia"));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.categories)) {
        db.createObjectStore(STORES.categories, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.products)) {
        const s = db.createObjectStore(STORES.products, { keyPath: "id" });
        s.createIndex("category_id", "category_id");
      }
      if (!db.objectStoreNames.contains(STORES.transactions)) {
        const s = db.createObjectStore(STORES.transactions, { keyPath: "id" });
        s.createIndex("timestamp", "timestamp");
      }
      if (!db.objectStoreNames.contains(STORES.transactionItems)) {
        const s = db.createObjectStore(STORES.transactionItems, { keyPath: "id" });
        s.createIndex("transaction_id", "transaction_id");
      }
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.shifts)) {
        db.createObjectStore(STORES.shifts, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaksi dibatalkan"));
  });
}

async function getAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  const tx = db.transaction(store, "readonly");
  return reqToPromise(tx.objectStore(store).getAll() as IDBRequest<T[]>);
}

async function put<T>(store: string, value: T): Promise<T> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(value);
  await txDone(tx);
  return value;
}

async function remove(store: string, id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(id);
  await txDone(tx);
}

/* ---------------- Categories ---------------- */

export async function listCategories(): Promise<Category[]> {
  await ensureSeed();
  const rows = await getAll<Category>(STORES.categories);
  return rows.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

export async function saveCategory(input: Omit<Category, "id"> & { id?: string | undefined }) {
  return put<Category>(STORES.categories, { ...input, id: input.id ?? newId() });
}

export async function deleteCategory(id: string) {
  const db = await openDb();
  const tx = db.transaction([STORES.categories, STORES.products], "readwrite");
  tx.objectStore(STORES.categories).delete(id);
  const products = await reqToPromise(
    tx.objectStore(STORES.products).getAll() as IDBRequest<Product[]>,
  );
  for (const p of products) {
    if (p.category_id === id) tx.objectStore(STORES.products).put({ ...p, category_id: null });
  }
  await txDone(tx);
}

/* ---------------- Products ---------------- */

export async function listProducts(): Promise<Product[]> {
  await ensureSeed();
  const rows = await getAll<Product>(STORES.products);
  return rows.filter((p) => p.is_active).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveProduct(input: Omit<Product, "id"> & { id?: string | undefined }) {
  return put<Product>(STORES.products, { ...input, id: input.id ?? newId() });
}

export async function deleteProduct(id: string) {
  return remove(STORES.products, id);
}

/* ---------------- Settings ---------------- */

export async function getSettings(): Promise<StoreSettings> {
  await ensureSeed();
  const db = await openDb();
  const tx = db.transaction(STORES.settings, "readonly");
  const row = await reqToPromise(
    tx.objectStore(STORES.settings).get("default") as IDBRequest<StoreSettings | undefined>,
  );
  return row ?? { ...DEFAULT_SETTINGS };
}

export async function saveSettings(settings: StoreSettings) {
  return put<StoreSettings>(STORES.settings, settings);
}

/* ---------------- Checkout ---------------- */

export type CheckoutResult = {
  transaction: Transaction;
  items: TransactionItem[];
};

/**
 * Menyimpan transaksi + item + pengurangan stok dalam satu IndexedDB
 * transaction (atomik) supaya data tidak korup bila app ditutup mendadak.
 */
export async function checkout(
  lines: CartLine[],
  paymentMethod: PaymentMethod,
  shiftId: string,
): Promise<CheckoutResult> {
  if (lines.length === 0) throw new Error("Keranjang kosong");
  if (!shiftId) throw new Error("Buka shift dulu sebelum bertransaksi");
  const db = await openDb();
  const tx = db.transaction(
    [STORES.products, STORES.transactions, STORES.transactionItems],
    "readwrite",
  );
  const productStore = tx.objectStore(STORES.products);

  const transactionId = newId();
  const items: TransactionItem[] = [];
  let totalOmset = 0;
  let totalHpp = 0;
  let totalLaba = 0;
  let hasMissingHpp = false;

  for (const line of lines) {
    const fresh = await reqToPromise(
      productStore.get(line.product.id) as IDBRequest<Product | undefined>,
    );
    if (!fresh) throw new Error(`Produk ${line.product.name} tidak ditemukan`);
    if (fresh.stock !== null && fresh.stock < line.qty) {
      tx.abort();
      throw new Error(`Stok ${fresh.name} tidak cukup (sisa ${fresh.stock})`);
    }

    totalOmset += fresh.sell_price * line.qty;
    // Laba hanya dihitung untuk produk yang HPP-nya terisi; tanpa HPP tidak usah
    // diasumsikan 0 (PRD §4.5) — ditandai via has_missing_hpp.
    if (fresh.cost_price === null) {
      hasMissingHpp = true;
    } else {
      totalHpp += fresh.cost_price * line.qty;
      totalLaba += (fresh.sell_price - fresh.cost_price) * line.qty;
    }

    items.push({
      id: newId(),
      transaction_id: transactionId,
      product_id: fresh.id,
      product_name: fresh.name,
      qty: line.qty,
      price_at_sale: fresh.sell_price,
      hpp_at_sale: fresh.cost_price,
    });

    if (fresh.stock !== null) {
      productStore.put({ ...fresh, stock: fresh.stock - line.qty });
    }
  }

  const transaction: Transaction = {
    id: transactionId,
    timestamp: Date.now(),
    cashier_id: null,
    shift_id: shiftId,
    total_omset: totalOmset,
    total_hpp: totalHpp,
    total_laba: totalLaba,
    has_missing_hpp: hasMissingHpp,
    payment_method: paymentMethod,
    status: "completed",
    void_reason: null,
  };

  tx.objectStore(STORES.transactions).put(transaction);
  for (const item of items) tx.objectStore(STORES.transactionItems).put(item);

  await txDone(tx);
  return { transaction, items };
}

export async function listTransactions(): Promise<Transaction[]> {
  const rows = await getAll<Transaction>(STORES.transactions);
  return rows.sort((a, b) => b.timestamp - a.timestamp);
}

export async function listTransactionItems(transactionId: string): Promise<TransactionItem[]> {
  const db = await openDb();
  const tx = db.transaction(STORES.transactionItems, "readonly");
  const idx = tx.objectStore(STORES.transactionItems).index("transaction_id");
  return reqToPromise(idx.getAll(transactionId) as IDBRequest<TransactionItem[]>);
}

export async function listAllTransactionItems(): Promise<TransactionItem[]> {
  return getAll<TransactionItem>(STORES.transactionItems);
}

/* ---------------- Shift / Tutup Kasir ---------------- */

export async function listShifts(): Promise<Shift[]> {
  const rows = await getAll<Shift>(STORES.shifts);
  return rows.sort((a, b) => b.opened_at - a.opened_at);
}

export async function getOpenShift(): Promise<Shift | null> {
  const rows = await listShifts();
  return rows.find((s) => s.status === "open" && s.closed_at === null) ?? null;
}

export async function openShift(openingCash: number): Promise<Shift> {
  const existing = await getOpenShift();
  if (existing) throw new Error("Sudah ada shift yang belum ditutup");
  const shift: Shift = {
    id: newId(),
    opened_at: Date.now(),
    closed_at: null,
    opening_cash: openingCash,
    closing_cash_system: null,
    closing_cash_actual: null,
    selisih: null,
    status: "open",
  };
  await put(STORES.shifts, shift);
  return shift;
}

export async function closeShift(shiftId: string, closingCashActual: number): Promise<Shift> {
  const db = await openDb();
  const tx = db.transaction([STORES.shifts, STORES.transactions], "readwrite");
  const shift = await reqToPromise(
    tx.objectStore(STORES.shifts).get(shiftId) as IDBRequest<Shift | undefined>,
  );
  if (!shift) throw new Error("Shift tidak ditemukan");
  if (shift.status === "closed") throw new Error("Shift sudah ditutup");

  const allTx = await reqToPromise(
    tx.objectStore(STORES.transactions).getAll() as IDBRequest<Transaction[]>,
  );
  const cashSales = allTx
    .filter(
      (t) => t.shift_id === shiftId && t.payment_method === "cash" && t.status === "completed",
    )
    .reduce((s, t) => s + t.total_omset, 0);

  const closing_cash_system = shift.opening_cash + cashSales;
  const updated: Shift = {
    ...shift,
    closed_at: Date.now(),
    closing_cash_system,
    closing_cash_actual: closingCashActual,
    selisih: closingCashActual - closing_cash_system,
    status: "closed",
  };
  tx.objectStore(STORES.shifts).put(updated);
  await txDone(tx);
  return updated;
}

/* ---------------- Void transaksi ---------------- */

export async function voidTransaction(transactionId: string, reason: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([STORES.transactions], "readwrite");
  const t = await reqToPromise(
    tx.objectStore(STORES.transactions).get(transactionId) as IDBRequest<Transaction | undefined>,
  );
  if (!t) throw new Error("Transaksi tidak ditemukan");
  if (t.status === "voided") throw new Error("Transaksi sudah dibatalkan");
  tx.objectStore(STORES.transactions).put({ ...t, status: "voided", void_reason: reason });
  await txDone(tx);
}

/* ---------------- Seed ---------------- */

const DEFAULT_SETTINGS: StoreSettings = {
  id: "default",
  store_name: "Toko Saya",
  business_type: "Warung",
  logo_path: null,
  pin_hash: null,
  pin_salt: null,
  seeded: false,
};

let seedPromise: Promise<void> | null = null;

function ensureSeed() {
  if (!seedPromise) seedPromise = runSeed();
  return seedPromise;
}

async function runSeed() {
  const db = await openDb();
  const tx = db.transaction([STORES.categories, STORES.products, STORES.settings], "readwrite");
  const settingsStore = tx.objectStore(STORES.settings);
  const existing = await reqToPromise(
    settingsStore.get("default") as IDBRequest<StoreSettings | undefined>,
  );
  // Sudah pernah di-seed atau user sengaja menghapus data → jangan seed lagi.
  if (existing?.seeded) {
    tx.abort();
    return;
  }
  const catStore = tx.objectStore(STORES.categories);
  const count = await reqToPromise(catStore.count());
  if (count > 0) {
    settingsStore.put({ ...(existing ?? DEFAULT_SETTINGS), seeded: true });
    await txDone(tx);
    return;
  }

  const cats: Category[] = [
    { id: "cat-makanan", name: "Makanan", sort_order: 1 },
    { id: "cat-minuman", name: "Minuman", sort_order: 2 },
    { id: "cat-snack", name: "Snack", sort_order: 3 },
  ];
  const products: Array<Omit<Product, "id"> & { id: string }> = [
    {
      id: "p1",
      name: "Nasi Goreng",
      photo_path: null,
      sell_price: 15000,
      cost_price: 8000,
      category_id: "cat-makanan",
      stock: 25,
      is_active: true,
    },
    {
      id: "p2",
      name: "Mie Ayam",
      photo_path: null,
      sell_price: 14000,
      cost_price: 7500,
      category_id: "cat-makanan",
      stock: 12,
      is_active: true,
    },
    {
      id: "p3",
      name: "Es Teh Manis",
      photo_path: null,
      sell_price: 5000,
      cost_price: 1500,
      category_id: "cat-minuman",
      stock: 40,
      is_active: true,
    },
    {
      id: "p4",
      name: "Kopi Susu",
      photo_path: null,
      sell_price: 8000,
      cost_price: 3000,
      category_id: "cat-minuman",
      stock: 20,
      is_active: true,
    },
    {
      id: "p5",
      name: "Keripik Singkong",
      photo_path: null,
      sell_price: 10000,
      cost_price: null,
      category_id: "cat-snack",
      stock: 0,
      is_active: true,
    },
    {
      id: "p6",
      name: "Roti Bakar",
      photo_path: null,
      sell_price: 12000,
      cost_price: 6000,
      category_id: "cat-snack",
      stock: 5,
      is_active: true,
    },
  ];

  for (const c of cats) catStore.put(c);
  for (const p of products) tx.objectStore(STORES.products).put(p);
  settingsStore.put({ ...(existing ?? DEFAULT_SETTINGS), seeded: true });
  await txDone(tx);
}

/* ---------------- Hapus transaksi (kembalikan stok) ---------------- */

export async function deleteTransaction(transactionId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(
    [STORES.products, STORES.transactions, STORES.transactionItems],
    "readwrite",
  );
  const itemStore = tx.objectStore(STORES.transactionItems);
  const productStore = tx.objectStore(STORES.products);

  const items = await reqToPromise(
    itemStore.index("transaction_id").getAll(transactionId) as IDBRequest<TransactionItem[]>,
  );

  for (const item of items) {
    const product = await reqToPromise(
      productStore.get(item.product_id) as IDBRequest<Product | undefined>,
    );
    if (product && product.stock !== null) {
      productStore.put({ ...product, stock: product.stock + item.qty });
    }
    itemStore.delete(item.id);
  }

  tx.objectStore(STORES.transactions).delete(transactionId);
  await txDone(tx);
}

/* ---------------- Backup / Restore ---------------- */

export type BackupFile = {
  version: 1;
  exported_at: number;
  categories: Category[];
  products: Product[];
  transactions: Transaction[];
  transaction_items: TransactionItem[];
  /** opsional: backup lama (v1 sebelum shift) tidak memuat field ini */
  shifts?: Shift[];
  settings: StoreSettings | null;
};

export async function exportAllData(): Promise<BackupFile> {
  const [categories, products, transactions, transaction_items, shifts, settings] =
    await Promise.all([
      getAll<Category>(STORES.categories),
      getAll<Product>(STORES.products),
      getAll<Transaction>(STORES.transactions),
      getAll<TransactionItem>(STORES.transactionItems),
      getAll<Shift>(STORES.shifts),
      getSettings(),
    ]);
  return {
    version: 1,
    exported_at: Date.now(),
    categories,
    products,
    transactions,
    transaction_items,
    shifts,
    settings,
  };
}

export function isValidBackup(value: unknown): value is BackupFile {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v["version"] === 1 &&
    Array.isArray(v["categories"]) &&
    Array.isArray(v["products"]) &&
    Array.isArray(v["transactions"]) &&
    Array.isArray(v["transaction_items"]) &&
    (v["shifts"] === undefined || Array.isArray(v["shifts"]))
  );
}

const ALL_STORES = [
  STORES.categories,
  STORES.products,
  STORES.transactions,
  STORES.transactionItems,
  STORES.shifts,
];

export async function importAllData(backup: BackupFile): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([...ALL_STORES, STORES.settings], "readwrite");
  for (const store of ALL_STORES) tx.objectStore(store).clear();

  for (const c of backup.categories) tx.objectStore(STORES.categories).put(c);
  for (const p of backup.products) tx.objectStore(STORES.products).put(p);
  for (const t of backup.transactions) tx.objectStore(STORES.transactions).put(t);
  for (const i of backup.transaction_items) tx.objectStore(STORES.transactionItems).put(i);
  for (const s of backup.shifts ?? []) tx.objectStore(STORES.shifts).put(s);
  if (backup.settings) tx.objectStore(STORES.settings).put({ ...backup.settings, id: "default" });

  await txDone(tx);
  seedPromise = Promise.resolve();
}

/** Hapus semua data; pengaturan toko (nama/logo/PIN) dipertahankan, seed demo tidak dijalankan lagi. */
export async function clearAllData(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([...ALL_STORES, STORES.settings], "readwrite");
  for (const store of ALL_STORES) tx.objectStore(store).clear();

  const existing = await reqToPromise(
    tx.objectStore(STORES.settings).get("default") as IDBRequest<StoreSettings | undefined>,
  );
  tx.objectStore(STORES.settings).put({ ...(existing ?? DEFAULT_SETTINGS), seeded: true });

  await txDone(tx);
  seedPromise = null;
}
