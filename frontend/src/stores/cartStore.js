import { create } from "zustand";

/**
 * Kassadagi chek (savat) holati.
 *
 * item: { product_id, barcode, name, price, qty, stock_qty }
 * Bir xil mahsulot qayta skanerlansa — qty +1 (bump animatsiyasi uchun return).
 * `stock_qty` mavjud bo'lsa quantity undan oshirilmaydi (backed xatosi oldini).
 */
export const useCartStore = create((set, get) => ({
  items: [],
  lastBumpedProductId: null,
  lastAddedProductId: null,

  /** @returns {number} jami summa */
  getTotal: () =>
    get()
      .items.reduce((sum, it) => sum + it.price * it.qty, 0),

  /**
   * Mahsulot qo'shish (barcode yoki product_id bo'yicha birlashadi).
   * @returns {{ ok: boolean, reason?: string, item?: object }}
   *   ok=false — stock limiti tufayli qo'shib bo'lmadi.
   */
  addItem: (product, qty = 1) => {
    const existing = get().items.find(
      (it) => it.product_id === product.product_id || it.barcode === product.barcode
    );
    const currentQty = existing ? existing.qty : 0;
    const stock = product.stock_qty != null ? Number(product.stock_qty) : null;
    if (stock != null && currentQty + qty > stock) {
      return { ok: false, reason: "stock" };
    }
    set((state) => {
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
            stock_qty: stock,
          },
        ],
        lastAddedProductId: product.product_id,
        lastBumpedProductId: null,
      };
    });
    return { ok: true };
  },

  /**
   * Miqdorni to'g'ridan-to'g'ri o'rnatish (stock limitiga qarab).
   * @returns {{ ok: boolean, reason?: string }}
   */
  setQty: (product_id, qty) => {
    const it = get().items.find((x) => x.product_id === product_id);
    if (!it) return { ok: false, reason: "missing" };
    if (it.stock_qty != null && qty > Number(it.stock_qty)) {
      return { ok: false, reason: "stock" };
    }
    set((state) => ({
      items:
        qty <= 0
          ? state.items.filter((x) => x.product_id !== product_id)
          : state.items.map((x) => (x.product_id === product_id ? { ...x, qty } : x)),
    }));
    return { ok: true };
  },

  removeItem: (product_id) =>
    set((state) => ({ items: state.items.filter((it) => it.product_id !== product_id) })),

  clear: () =>
    set({ items: [], lastBumpedProductId: null, lastAddedProductId: null }),

  clearHighlight: () => set({ lastBumpedProductId: null, lastAddedProductId: null }),
}));
