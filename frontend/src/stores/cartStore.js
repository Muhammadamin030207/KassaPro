import { create } from "zustand";

/**
 * Kassadagi chek (savat) holati.
 *
 * item: { product_id, barcode, name, price, qty }
 * Bir xil mahsulot qayta skanerlansa — qty +1 (bump animatsiyasi uchun return).
 */
export const useCartStore = create((set, get) => ({
  items: [],
  lastBumpedProductId: null,
  lastAddedProductId: null,

  /** @returns {number} jami summa */
  getTotal: () =>
    get()
      .items.reduce((sum, it) => sum + it.price * it.qty, 0),

  /** Mahsulot qo'shish (barcode yoki product_id bo'yicha birlashadi) */
  addItem: (product, qty = 1) =>
    set((state) => {
      const existing = state.items.find((it) => it.product_id === product.product_id || it.barcode === product.barcode);
      if (existing) {
        return {
          items: state.items.map((it) =>
            it.barcode === existing.barcode ? { ...it, qty: it.qty + qty } : it
          ),
          lastBumpedProductId: existing.product_id,
          lastAddedProductId: null,
        };
      }
      return {
        items: [
          ...state.items,
          {
            product_id: product.product_id,
            barcode: product.barcode,
            name: product.name,
            price: product.price,
            qty,
          },
        ],
        lastAddedProductId: product.product_id,
        lastBumpedProductId: null,
      };
    }),

  setQty: (product_id, qty) =>
    set((state) => ({
      items: qty <= 0
        ? state.items.filter((it) => it.product_id !== product_id)
        : state.items.map((it) => (it.product_id === product_id ? { ...it, qty } : it)),
    })),

  removeItem: (product_id) =>
    set((state) => ({ items: state.items.filter((it) => it.product_id !== product_id) })),

  clear: () =>
    set({ items: [], lastBumpedProductId: null, lastAddedProductId: null }),

  clearHighlight: () => set({ lastBumpedProductId: null, lastAddedProductId: null }),
}));