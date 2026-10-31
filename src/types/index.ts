// Shared types. They mirror the MySQL schema in the design doc.

export type Role = 'admin' | 'staff';
export type UserFeature = 'orders' | 'menu' | 'kitchen';
export type OrderType = 'dine_in' | 'takeaway' | 'delivery';
export type OrderStatus = 'draft' | 'in_progress' | 'checked_out' | 'cancelled';
export type PaymentMethod = 'cash' | 'card' | 'online' | 'other';
export type RoundStatus = 'preparing' | 'ready' | 'served';
export type DiscountType = 'amount' | 'percentage';

export interface User {
  id: number;
  name: string;
  username: string;
  role: Role;
  is_active: boolean;
  features: UserFeature[];
}

export interface UserCapacity {
  active_users: number;
  max_users: number;
  active_admins: number;
  max_admins: number;
  active_staff: number;
  max_staff: number;
}

export interface CreateUserPayload {
  name: string;
  username: string;
  password: string;
  role: Role;
  is_active: boolean;
  features: UserFeature[];
}

export interface UpdateUserPayload extends Partial<Omit<CreateUserPayload, 'password'>> {
  password?: string;
}

export interface Category {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface MenuItem {
  id: number;
  category_id: number;
  name: string;
  description?: string;
  image_url?: string;
  price: number;
  meal_available: boolean;
  meal_price: number;
  prep_time_minutes: number;
  is_available: boolean;
}

export interface CreateMenuItemPayload {
  category_id: number;
  name: string;
  description?: string;
  price: number;
  meal_available: boolean;
  meal_price: number;
  prep_time_minutes: number;
  image?: File;
}

export interface UpdateMenuItemPayload extends Partial<Omit<CreateMenuItemPayload, 'image'>> {
  image?: File;
}

export interface MenuResponse {
  categories: Category[];
  items: MenuItem[];
}

export interface InventoryPurchase {
  id: number;
  item_name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  purchased_at: string;
}

export interface ProductionPlanEntry {
  menu_item_id: number;
  quantity: number;
}

export interface InventoryResponse {
  purchases: InventoryPurchase[];
  production_plan: ProductionPlanEntry[];
}

export interface CreateInventoryPurchasePayload {
  item_name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
}

/** A line on an order. Name and price are snapshots taken when the round was saved. */
export interface OrderItem {
  id: number;
  round_id: number | null;
  menu_item_id: number;
  item_name: string;
  unit_price: number;
  prep_time_minutes: number;
  quantity: number;
  line_total: number;
  is_meal: boolean;
  remarks: string | null;
  served_at: string | null;
}

/** One saved iteration of an order ("Round 1", "Round 2", ...). */
export interface OrderRound {
  id: number;
  round_no: number;
  status: RoundStatus;
  estimated_minutes: number;
  estimated_ready_at: string; // ISO timestamp
  created_at: string;
  items: OrderItem[];
}

/** The editable header fields of an order. */
export interface OrderDetails {
  order_type: OrderType;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  table_no: string;
  notes: string;
}

export interface CustomerMasterRecord {
  contact_number: string;
  full_name: string;
}

export interface Order extends OrderDetails {
  id: number;
  order_no: string;
  status: OrderStatus;
  created_by: number;
  created_by_name: string;
  locked_by: number | null;
  locked_by_name: string | null;
  lock_expires_at: string | null;
  rounds: OrderRound[];
  subtotal: number;
  discount: number;
  discount_type: DiscountType;
  discount_value: number;
  tax: number;
  delivery_fee: number;
  total: number;
  created_at: string;
  updated_at: string;
  checked_out_at: string | null;
}

export interface ReceiptPayment {
  method: PaymentMethod;
  amount: number;
  reference: string | null;
}

export interface OrderReceipt {
  order: Order;
  payments: ReceiptPayment[];
}

export interface SaveOrderPayload extends OrderDetails {
  /** The unsaved cart. Becomes the next round. May be empty to save only the details. */
  items: { menu_item_id: number; quantity: number; is_meal: boolean; remarks: string }[];
  discount_type: DiscountType;
  discount_value: number;
}

export interface SaveOrderResult {
  order: Order;
  /** The round that was created, or null when only the details were saved. */
  round: OrderRound | null;
}

export interface CheckoutPayload {
  payments: { method: PaymentMethod; amount: number; reference?: string }[];
}

export interface ActivityEntry {
  id: number;
  order_id: number;
  user_id: number;
  user_name: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export type DashboardRange = 'today' | '7d' | '30d';

export interface PeriodTotals {
  orders: number;
  sales: number;
  avg_order_value: number;
}

export interface DashboardData {
  totals: PeriodTotals;
  previous: PeriodTotals;
  open_orders: number;
  cancelled_orders: number;
  by_staff: { name: string; orders: number; sales: number }[];
  top_items: { item_name: string; qty: number; revenue: number }[];
  payment_methods: { method: PaymentMethod; total: number }[];
  by_type: { order_type: OrderType; orders: number; sales: number }[];
  by_hour: { hour: number; orders: number; sales: number }[];
}
