export type Category = {
  id: string;
  name: string;
  sort_order: number;
};

export type Product = {
  id: string;
  name: string;
  photo_path: string | null; // data URL
  sell_price: number; // integer rupiah
  cost_price: number | null; // HPP, null = belum diisi
  category_id: string | null;
  stock: number | null; // null = unlimited, 0 = habis
  /** override threshold stok menipis per produk; fallback ke settings */
  low_stock_threshold?: number;
  is_active: boolean;
};

export type PaymentMethod = "cash" | "other";

export type Transaction = {
  id: string;
  timestamp: number;
  cashier_id: string | null;
  shift_id: string | null;
  total_omset: number;
  total_hpp: number;
  total_laba: number;
  has_missing_hpp: boolean;
  discount_total?: number; // total diskon (item + transaksi), rupiah
  payment_method: PaymentMethod;
  status: "completed" | "voided";
  void_reason: string | null;
};

export type TransactionItem = {
  id: string;
  transaction_id: string;
  product_id: string;
  product_name: string;
  qty: number;
  price_at_sale: number;
  hpp_at_sale: number | null;
  discount_percent?: number; // diskon % snapshost saat jual, 0/absent = tanpa diskon
};

export type StoreSettings = {
  id: "default";
  store_name: string;
  business_type: string;
  logo_path: string | null;
  pin_hash: string | null;
  pin_salt: string | null;
  /** true bila seed demo sudah dijalankan atau user sengaja menghapus data */
  seeded?: boolean;
  /** ambang stok menipis global (default 5) */
  low_stock_threshold?: number;
};

export type Shift = {
  id: string;
  opened_at: number;
  closed_at: number | null;
  opening_cash: number;
  closing_cash_system: number | null;
  closing_cash_actual: number | null;
  selisih: number | null;
  status: "open" | "closed";
};

export type CartLine = {
  product: Product;
  qty: number;
  discount_percent: number;
};
