import { getDatabase } from '../lib/db';

export class TaxService {
  private db;
  // Default tax rate (PPN 11%). The EFFECTIVE rate is stored in the `settings`
  // table (key `tax_rate`) and is editable from the Admin "Pajak" page, so the
  // rate shown to the cashier equals the rate used at checkout (single source).
  public static readonly DEFAULT_VAT_RATE = 0.11; // 11% PPN

  constructor() {
    this.db = getDatabase();
  }

  /** Effective rate: from settings, else the default. */
  get rate(): number {
    try {
      const row = this.db.get<{ value: string }>(
        "SELECT value FROM settings WHERE key = 'tax_rate'"
      );
      if (row && row.value != null && row.value !== '') {
        const parsed = Number(row.value);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) return parsed;
      }
    } catch (e) {
      // settings table may not exist yet on very first boot
    }
    return TaxService.DEFAULT_VAT_RATE;
  }

  /** Persist a new rate (0..1). Returns the stored value. */
  setRate(rate: number): number {
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
      throw new Error('Tarif pajak harus di antara 0 dan 1 (contoh 0.11 untuk 11%)');
    }
    const value = String(rate);
    const existing = this.db.get<{ key: string }>("SELECT key FROM settings WHERE key = 'tax_rate'");
    if (existing) {
      this.db.run("UPDATE settings SET value = ?, updated_at = ? WHERE key = 'tax_rate'", [
        value,
        new Date().toISOString(),
      ]);
    } else {
      this.db.run("INSERT INTO settings (key, value, updated_at) VALUES ('tax_rate', ?, ?)", [
        value,
        new Date().toISOString(),
      ]);
    }
    return rate;
  }

  calculateTax(subtotal: number): number {
    return Math.floor(subtotal * this.rate);
  }

  validateTaxCalculation(subtotal: number, expectedTax: number): boolean {
    const calculatedTax = this.calculateTax(subtotal);
    return calculatedTax === expectedTax;
  }
}
