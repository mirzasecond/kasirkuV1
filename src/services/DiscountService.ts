import { getDatabase } from '../lib/db';

export interface DiscountRule {
  id: number;
  name: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  start_date: string | null;
  end_date: string | null;
  days_of_week: string | null;
  min_purchase: number | null;
  max_discount: number | null;
  active: number;
  scope_type?: 'all' | 'category' | 'products' | null;
  scope_value?: string | null;
  created_at?: string;
}

/** A cart line used for scope-aware discount computation. */
export interface CartLine {
  product_code: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  category?: string | null;
}

export interface DiscountResult {
  discountAmount: number;
  discountType: 'percentage' | 'fixed' | 'none';
  ruleName?: string;
  scopeType?: 'all' | 'category' | 'products';
  /** codes of products that were included in the discount base */
  affectedProductCodes?: string[];
  /** subtotal of only the items the discount applies to */
  appliedSubtotal?: number;
}

export class DiscountService {
  private db;

  constructor() {
    this.db = getDatabase();
  }

  private getRuleScope(r: DiscountRule): { type: 'all' | 'category' | 'products'; value: string | null } {
    const type = (r.scope_type || 'all') as 'all' | 'category' | 'products';
    return { type, value: r.scope_value || null };
  }

  /** Parse scope_value for 'products' scope into an array of codes. */
  private parseProductCodes(scopeValue: string | null): string[] {
    if (!scopeValue) return [];
    try {
      const arr = JSON.parse(scopeValue);
      if (Array.isArray(arr)) return arr.map((x) => String(x));
    } catch {
      // fallback: comma-separated
      return scopeValue.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return [];
  }

  /**
   * Items (and their subtotal) that a given rule applies to.
   * - all: every cart line
   * - category: lines whose category matches scope_value
   * - products: lines whose product_code is in scope_value
   */
  private itemsInScope(rule: DiscountRule, cart: CartLine[]): { lines: CartLine[]; subtotal: number } {
    const { type, value } = this.getRuleScope(rule);
    let lines: CartLine[];
    if (type === 'category') {
      const target = (value || '').trim().toLowerCase();
      lines = cart.filter((l) => (l.category || '').trim().toLowerCase() === target);
    } else if (type === 'products') {
      const codes = this.parseProductCodes(value).map((c) => c.toLowerCase());
      lines = cart.filter((l) => codes.includes((l.product_code || '').toLowerCase()));
    } else {
      lines = cart.slice();
    }
    const subtotal = lines.reduce((s, l) => s + (Number(l.subtotal) || 0), 0);
    return { lines, subtotal };
  }

  /**
   * Active rules whose date/day conditions are met. min_purchase is checked
   * against the SCOPE subtotal (not the whole cart) so rules like "10% off
   * Flooring, min 50k" mean "buy >= 50k of Flooring".
   */
  private eligibleRules(date: Date, cart: CartLine[]): DiscountRule[] {
    let rows: DiscountRule[] = [];
    try {
      rows = this.db.all<DiscountRule>(
        'SELECT * FROM discount_rules WHERE active = 1 ORDER BY id ASC'
      );
    } catch {
      return [];
    }

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const today = `${y}-${m}-${d}`;
    const dow = String(date.getDay());

    return rows.filter((r) => {
      if (r.start_date && today < r.start_date) return false;
      if (r.end_date && today > r.end_date) return false;
      if (r.days_of_week && r.days_of_week.trim() !== '') {
        const days = r.days_of_week.split(',').map((s) => s.trim()).filter(Boolean);
        if (days.length > 0 && !days.includes(dow)) return false;
      }
      const scopeSubtotal = this.itemsInScope(r, cart).subtotal;
      if (scopeSubtotal <= 0) return false; // nothing in scope -> rule not applicable
      if (r.min_purchase != null && scopeSubtotal < Number(r.min_purchase)) return false;
      return true;
    });
  }

  /**
   * Hitung diskon untuk isi keranjang dari aturan diskon di database.
   * Menerapkan SATU aturan terbaik (diskon terbesar). Jika TIDAK ADA aturan
   * aktif yang memenuhi syarat, diskon = 0 (tidak ada promo bawaan/hardcoded).
   *
   * Backward compatible: `cartOrSubtotal` boleh berupa number (pemanggil lama)
   * yang diperlakukan sebagai satu baris "all", atau array CartLine (pemanggil baru).
   */
  calculateDiscount(
    cartOrSubtotal: number | CartLine[],
    date: Date = new Date(),
    rules?: any[]
  ): DiscountResult {
    const cart: CartLine[] = Array.isArray(cartOrSubtotal)
      ? cartOrSubtotal
      : [{ product_code: '__ALL__', quantity: 1, unit_price: Number(cartOrSubtotal) || 0, subtotal: Number(cartOrSubtotal) || 0, category: null }];

    const eligible = rules && rules.length ? (rules as DiscountRule[]) : this.eligibleRules(date, cart);

    // Tidak ada aturan aktif yang memenuhi syarat -> tanpa diskon.
    if (eligible.length === 0) {
      return { discountAmount: 0, discountType: 'none' };
    }

    let best: {
      amount: number;
      type: 'percentage' | 'fixed';
      name: string;
      scopeType: 'all' | 'category' | 'products';
      appliedSubtotal: number;
      codes: string[];
    } | null = null;

    for (const r of eligible) {
      const scope = this.getRuleScope(r);
      const { lines, subtotal: scopeSubtotal } = this.itemsInScope(r, cart);
      if (scopeSubtotal <= 0) continue;

      let amount = 0;
      const value = Number(r.discount_value) || 0;
      if (r.discount_type === 'percentage') {
        amount = Math.floor((scopeSubtotal * value) / 100);
      } else {
        // Fixed amount: cap at the scope subtotal.
        amount = Math.floor(Math.min(value, scopeSubtotal));
      }
      if (r.max_discount != null && Number(r.max_discount) > 0) {
        amount = Math.min(amount, Number(r.max_discount));
      }
      amount = Math.min(amount, scopeSubtotal);

      if (!best || amount > best.amount) {
        best = {
          amount,
          type: r.discount_type,
          name: r.name,
          scopeType: scope.type,
          appliedSubtotal: scopeSubtotal,
          codes: lines.map((l) => l.product_code),
        };
      }
    }

    if (!best || best.amount <= 0) return { discountAmount: 0, discountType: 'none' };
    return {
      discountAmount: best.amount,
      discountType: best.type,
      ruleName: best.name,
      scopeType: best.scopeType,
      appliedSubtotal: best.appliedSubtotal,
      affectedProductCodes: best.codes,
    };
  }
}
