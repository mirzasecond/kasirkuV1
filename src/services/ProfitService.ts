import { getDatabase } from '../lib/db';

export class ProfitService {
  private db;

  constructor() {
    this.db = getDatabase();
  }

  calculateProfit(productCode: string, quantity: number, salePrice: number): {
    revenue: number;
    cost: number;
    profit: number;
    marginPercent: number;
  } {
    const product = this.db.getProductById(
      this.db.getProducts().find(p => p.code === productCode)?.id!
    );

    if (!product) {
      return { revenue: 0, cost: 0, profit: 0, marginPercent: 0 };
    }

    const revenue = salePrice * quantity;
    const cost = product.purchase_price * quantity;
    const profit = revenue - cost;
    const marginPercent = revenue > 0 ? (profit / revenue) * 100 : 0;

    return {
      revenue,
      cost,
      profit,
      marginPercent,
    };
  }

  getTransactionProfit(transactionId: string): {
    totalRevenue: number;
    totalCost: number;
    totalProfit: number;
    averageMarginPercent: number;
  } {
    const items = this.db.getTransactionItems(transactionId);
    
    let totalRevenue = 0;
    let totalCost = 0;

    for (const item of items) {
      const product = this.db.getProductById(item.product_id);
      if (product) {
        totalRevenue += item.final_price * item.quantity;
        totalCost += product.purchase_price * item.quantity;
      }
    }

    const totalProfit = totalRevenue - totalCost;
    const averageMarginPercent = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalCost,
      totalProfit,
      averageMarginPercent,
    };
  }
}
