import { z } from 'zod';

export const ProductSchema = z.object({
  id: z.number().optional(),
  code: z.string().min(1, 'Kode produk wajib diisi'),
  // Spesifikasi final pemilik toko: kolom `name` di-rename jadi `description`.
  description: z.string().min(1, 'Deskripsi produk wajib diisi'),
  brand: z.string().nullable().default(null),
  status: z.enum(['Aktif', 'Tidak Aktif']).default('Aktif'),
  note: z.string().nullable().default(null),
  ext01: z.string().nullable().default(null),
  ext02: z.string().nullable().default(null),
  category: z.string().nullable(),
  variant: z.string().nullable(),
  thickness: z.string().nullable(),
  unit: z.string().default('pcs'),
  purchase_price: z.number().positive('Harga beli harus positif'),
  selling_price: z.number().positive('Harga jual harus positif'),
  stock: z.number().int().nonnegative('Stok tidak boleh negatif'),
  minimum_stock: z.number().int().nonnegative('Minimum stok tidak boleh negatif'),
  barcode: z.string().nullable(),
  qr_code: z.string().nullable(),
  active: z.boolean().default(true),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export const TransactionItemSchema = z.object({
  id: z.string().uuid().optional(),
  transaction_id: z.string().uuid(),
  product_id: z.number(),
  product_code: z.string(),
  product_name: z.string(),
  quantity: z.number().int().positive('Quantity harus lebih dari 0'),
  unit_price: z.number().positive('Unit price harus positif'),
  subtotal: z.number().nonnegative('Subtotal tidak boleh negatif'),
  discount_amount: z.number().nonnegative('Discount tidak boleh negatif'),
  final_price: z.number().nonnegative('Final price tidak boleh negatif'),
});

export const TransactionSchema = z.object({
  id: z.string().uuid().optional(),
  reference_no: z.string().min(1, 'Reference number wajib diisi'),
  date_time: z.string().datetime(),
  subtotal: z.number().nonnegative('Subtotal tidak boleh negatif'),
  discount_amount: z.number().nonnegative('Discount tidak boleh negatif'),
  discount_type: z.enum(['percentage', 'fixed', 'none']).default('none'),
  tax_amount: z.number().nonnegative('Tax tidak boleh negatif'),
  grand_total: z.number().nonnegative('Grand total tidak boleh negatif'),
  payment_amount: z.number().nonnegative('Payment amount tidak boleh negatif'),
  change_amount: z.number().nonnegative('Change tidak boleh negatif'),
  status: z.enum(['pending', 'completed', 'cancelled']).default('completed'),
  user_id: z.string().optional().nullable(),
  cashier_name: z.string().default('Unknown User'),
});

export const StockMovementSchema = z.object({
  id: z.number().optional(),
  product_id: z.number(),
  type: z.enum(['IN', 'OUT', 'SALE', 'RETURN', 'ADJUSTMENT']),
  quantity: z.number().int(),
  stock_before: z.number().int(),
  stock_after: z.number().int(),
  reference_id: z.string().nullable(),
  user_id: z.string().nullable(),
  note: z.string().nullable(),
  created_at: z.string().datetime().optional(),
});

export type Product = z.infer<typeof ProductSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
export type TransactionItem = z.infer<typeof TransactionItemSchema>;
export type StockMovement = z.infer<typeof StockMovementSchema>;
