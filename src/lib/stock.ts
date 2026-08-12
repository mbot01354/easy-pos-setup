import type { Product, StoreSettings } from "@/lib/db/types";

export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

export function lowStockThreshold(settings: StoreSettings | null | undefined) {
  return settings?.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
}

/** true bila stok terbatas dan berada di 1..ambang (habis punya penanda sendiri) */
export function isLowStock(product: Product, globalThreshold: number) {
  if (product.stock === null || product.stock <= 0) return false;
  const threshold = product.low_stock_threshold ?? globalThreshold;
  return threshold > 0 && product.stock <= threshold;
}

export const DISCOUNT_PRESETS = [5, 10, 15, 20, 25, 50];
