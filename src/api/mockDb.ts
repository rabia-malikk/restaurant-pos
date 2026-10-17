// In-browser demo backend. It mimics the real API's rules (roles, ownership,
// order locking, rounds, checkout, activity log) so the UI can be built and
// tried without a server. Data resets on page reload.
// Turn it off with VITE_USE_MOCK=false.

import { ApiError } from '@/lib/errors';
import { calcTotals } from '@/lib/orderRules';
import type {
  ActivityEntry,
  Category,
  CheckoutPayload,
  CreateMenuItemPayload,
  CreateInventoryPurchasePayload,
  DashboardData,
  DashboardRange,
  InventoryPurchase,
  InventoryResponse,
  MenuItem,
  MenuResponse,
  Order,
  OrderRound,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PeriodTotals,
  ProductionPlanEntry,
  SaveOrderPayload,
  SaveOrderResult,
  UpdateMenuItemPayload,
  User,
} from '@/types';

const LOCK_MS = 5 * 60 * 1000;
const LATENCY_MS = 120;
const SESSION_KEY = 'pos_mock_session';
const DAY_MS = 86_400_000;

interface MockUser extends User {
  password: string;
}

interface MockOrder extends Order {
  payments: { method: PaymentMethod; amount: number; reference?: string }[];
}

// ---------------------------------------------------------------- seed data

const users: MockUser[] = [
  { id: 1, name: 'Admin', username: 'admin', password: 'admin123', role: 'admin', is_active: true },
  { id: 2, name: 'Ayesha', username: 'ayesha', password: 'staff123', role: 'staff', is_active: true },
  { id: 3, name: 'Bilal', username: 'bilal', password: 'staff123', role: 'staff', is_active: true },
];

const categories: Category[] = [
  { id: 1, name: 'Starters', sort_order: 1 },
  { id: 2, name: 'Mains', sort_order: 2 },
  { id: 3, name: 'Sides', sort_order: 3 },
  { id: 4, name: 'Drinks', sort_order: 4 },
  { id: 5, name: 'Desserts', sort_order: 5 },
];

const menuItems: MenuItem[] = [
  { id: 1, category_id: 1, name: 'Crispy Calamari', price: 850, prep_time_minutes: 12, is_available: true },
  { id: 2, category_id: 1, name: 'Tomato Soup', price: 450, prep_time_minutes: 8, is_available: true },
  { id: 3, category_id: 1, name: 'Chicken Wings', price: 750, prep_time_minutes: 15, is_available: true },
  { id: 4, category_id: 2, name: 'Grilled Chicken', price: 1350, prep_time_minutes: 25, is_available: true },
  { id: 5, category_id: 2, name: 'Beef Burger', price: 1100, prep_time_minutes: 18, is_available: true },
  { id: 6, category_id: 2, name: 'Margherita Pizza', price: 1250, prep_time_minutes: 20, is_available: true },
  { id: 7, category_id: 2, name: 'Fettuccine Alfredo', price: 1150, prep_time_minutes: 16, is_available: true },
  { id: 8, category_id: 2, name: 'Grilled Fish', price: 1650, prep_time_minutes: 22, is_available: false },
  { id: 9, category_id: 3, name: 'French Fries', price: 350, prep_time_minutes: 8, is_available: true },
  { id: 10, category_id: 3, name: 'Garden Salad', price: 400, prep_time_minutes: 5, is_available: true },
  { id: 11, category_id: 3, name: 'Garlic Bread', price: 300, prep_time_minutes: 7, is_available: true },
  { id: 12, category_id: 4, name: 'Fresh Lime', price: 250, prep_time_minutes: 3, is_available: true },
  { id: 13, category_id: 4, name: 'Iced Tea', price: 280, prep_time_minutes: 3, is_available: true },
  { id: 14, category_id: 4, name: 'Cold Coffee', price: 420, prep_time_minutes: 5, is_available: true },
  { id: 15, category_id: 5, name: 'Chocolate Brownie', price: 550, prep_time_minutes: 6, is_available: true },
  { id: 16, category_id: 5, name: 'Cheesecake', price: 600, prep_time_minutes: 4, is_available: true },
];

const orders: MockOrder[] = [];
const activityLog: ActivityEntry[] = [];
const inventoryPurchases: InventoryPurchase[] = [];
let productionPlan: ProductionPlanEntry[] = [];

let idSeq = 1000;
const nextId = () => ++idSeq;
let orderCounter = 0;

// Small deterministic random generator so the demo data is stable.
let rndState = 42;
const rand = () => {
  rndState = (rndState * 1664525 + 1013904223) % 4294967296;
  return rndState / 4294967296;
};
const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)];

// ------------------------------------------------------------------ helpers

const toPublicUser = (u: MockUser): User => ({
  id: u.id,
  name: u.name,
  username: u.username,
  role: u.role,
  is_active: u.is_active,
});

function sessionUser(): User | null {
  const id = Number(localStorage.getItem(SESSION_KEY));
  const user = users.find((u) => u.id === id && u.is_active);
  return user ? toPublicUser(user) : null;
}

function requireUser(): User {
  const user = sessionUser();
  if (!user) throw new ApiError(401, 'Please sign in.');
  return user;
}

function requireAdmin(): User {
  const user = requireUser();
  if (user.role !== 'admin') throw new ApiError(403, 'Only admins can do this.');
  return user;
}

const isOpenStatus = (status: OrderStatus) => status === 'draft' || status === 'in_progress';

const isLockActive = (o: Order) =>
  o.locked_by !== null && o.lock_expires_at !== null && new Date(o.lock_expires_at).getTime() > Date.now();

function setLock(o: Order, user: User) {
  o.locked_by = user.id;
  o.locked_by_name = user.name;
  o.lock_expires_at = new Date(Date.now() + LOCK_MS).toISOString();
}

function clearLock(o: Order) {
  o.locked_by = null;
  o.locked_by_name = null;
  o.lock_expires_at = null;
}

function findOrder(id: number): MockOrder {
  const order = orders.find((o) => o.id === id);
  if (!order) throw new ApiError(404, 'Order not found.');
  return order;
}

function assertAccess(o: Order, user: User) {
  if (user.role !== 'admin' && o.created_by !== user.id) {
    throw new ApiError(403, 'This order belongs to another user.');
  }
}

function assertHoldsLock(o: Order, user: User) {
  if (!(o.locked_by === user.id && isLockActive(o))) {
    throw new ApiError(409, 'Your hold on this order expired. Open it again.');
  }
}

function log(order: Order, user: User, action: string, details: Record<string, unknown> | null = null) {
  activityLog.push({
    id: nextId(),
    order_id: order.id,
    user_id: user.id,
    user_name: user.name,
    action,
    details,
    created_at: new Date().toISOString(),
  });
}

function recalc(o: Order) {
  o.subtotal = o.rounds.reduce((s, r) => s + r.items.reduce((x, i) => x + i.line_total, 0), 0);
  const { tax, total } = calcTotals(o.subtotal, o.discount, o.delivery_fee);
  o.tax = tax;
  o.total = total;
}

function makeOrderNo(date: Date) {
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, '');
  orderCounter += 1;
  return `${ymd}-${String(orderCounter).padStart(4, '0')}`;
}

function newOrder(creator: User, type: OrderType, createdAt: Date): MockOrder {
  const iso = createdAt.toISOString();
  return {
    id: nextId(),
    order_no: makeOrderNo(createdAt),
    order_type: type,
    status: 'draft',
    customer_name: '',
    customer_phone: '',
    delivery_address: '',
    table_no: '',
    notes: '',
    created_by: creator.id,
    created_by_name: creator.name,
    locked_by: null,
    locked_by_name: null,
    lock_expires_at: null,
    rounds: [],
    subtotal: 0,
    discount: 0,
    tax: 0,
    delivery_fee: 0,
    total: 0,
    created_at: iso,
    updated_at: iso,
    checked_out_at: null,
    payments: [],
  };
}

/** Turns a list of [menuItemId, quantity] pairs into the next round of an order. */
function addRound(o: Order, lines: [number, number][], at: Date, creator: User): OrderRound {
  const roundId = nextId();
  const items = lines.map(([menuId, quantity]) => {
    const menu = menuItems.find((m) => m.id === menuId)!;
    return {
      id: nextId(),
      round_id: roundId,
      menu_item_id: menu.id,
      item_name: menu.name,
      unit_price: menu.price,
      prep_time_minutes: menu.prep_time_minutes,
      quantity,
      line_total: Math.round(menu.price * quantity * 100) / 100,
    };
  });
  const minutes = Math.max(...items.map((i) => i.prep_time_minutes));
  const round: OrderRound = {
    id: roundId,
    round_no: o.rounds.length + 1,
    status: 'preparing',
    estimated_minutes: minutes,
    estimated_ready_at: new Date(at.getTime() + minutes * 60_000).toISOString(),
    created_at: at.toISOString(),
    items,
  };
  o.rounds.push(round);
  o.status = 'in_progress';
  o.updated_at = at.toISOString();
  recalc(o);
  log(o, creator, 'round_saved', {
    round_no: round.round_no,
    items: items.map((i) => ({ name: i.item_name, qty: i.quantity })),
    estimated_minutes: minutes,
  });
  return round;
}

function seed() {
  const staff = users.filter((u) => u.role === 'staff').map(toPublicUser);
  const sellable = menuItems.filter((m) => m.is_available);
  const methods: PaymentMethod[] = ['cash', 'cash', 'card', 'card', 'online'];
  const types: OrderType[] = ['dine_in', 'dine_in', 'takeaway', 'delivery'];

  // Paid orders over the last two weeks, for the dashboard.
  for (let n = 0; n < 70; n++) {
    const creator = pick(staff);
    const type = pick(types);
    const when = new Date(Date.now() - Math.floor(rand() * 14) * DAY_MS);
    when.setHours(12 + Math.floor(rand() * 10), Math.floor(rand() * 60), 0, 0);
    if (when.getTime() > Date.now()) when.setTime(Date.now() - 3_600_000);

    const o = newOrder(creator, type, when);
    o.created_at = when.toISOString();
    log(o, creator, 'order_created');
    o.table_no = type === 'dine_in' ? String(1 + Math.floor(rand() * 12)) : '';
    o.customer_name = type === 'dine_in' ? '' : pick(['Sara', 'Omar', 'Hina', 'Daniyal', 'Maryam']);
    o.customer_phone = type === 'delivery' ? '0300 5550101' : '';
    o.delivery_address = type === 'delivery' ? 'House 12, Street 4' : '';

    const roundCount = rand() > 0.7 ? 2 : 1;
    for (let r = 0; r < roundCount; r++) {
      const lineCount = 1 + Math.floor(rand() * 4);
      const chosen = new Set<number>();
      while (chosen.size < lineCount) chosen.add(pick(sellable).id);
      addRound(o, [...chosen].map((id) => [id, 1 + Math.floor(rand() * 3)] as [number, number]), when, creator);
    }

    const paidAt = new Date(when.getTime() + 45 * 60_000);
    o.status = 'checked_out';
    o.checked_out_at = (paidAt.getTime() > Date.now() ? new Date() : paidAt).toISOString();
    o.updated_at = o.checked_out_at;
    const method = pick(methods);
    o.payments = [{ method, amount: o.total }];
    log(o, creator, 'checkout', { method, amount: o.total });
    orders.push(o);
  }

  // A few open orders so the drafts panel has something in it.
  const ayesha = staff[0];
  const bilal = staff[1];

  const open1 = newOrder(ayesha, 'dine_in', new Date(Date.now() - 20 * 60_000));
  open1.table_no = '4';
  log(open1, ayesha, 'order_created');
  addRound(open1, [[5, 2], [9, 2], [12, 2]], new Date(Date.now() - 15 * 60_000), ayesha);
  orders.push(open1);

  const open2 = newOrder(bilal, 'takeaway', new Date(Date.now() - 8 * 60_000));
  open2.customer_name = 'Sara';
  log(open2, bilal, 'order_created');
  orders.push(open2);

  const open3 = newOrder(ayesha, 'delivery', new Date(Date.now() - 5 * 60_000));
  open3.customer_name = 'Omar';
  open3.customer_phone = '0300 5550142';
  open3.delivery_address = 'House 7, Street 9';
  log(open3, ayesha, 'order_created');
  addRound(open3, [[6, 1], [3, 1]], new Date(Date.now() - 4 * 60_000), ayesha);
  orders.push(open3);
}

seed();

/** Runs a mock operation with simulated latency. Throws become rejected promises. */
function run<T>(fn: () => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(structuredClone(fn()));
      } catch (error) {
        reject(error);
      }
    }, LATENCY_MS);
  });
}

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Could not read the selected image.'));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the selected image.'));
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------- mock API

export const mock = {
  // Auth
  login: (username: string, password: string) =>
    run(() => {
      const user = users.find(
        (u) => u.username === username.trim().toLowerCase() && u.password === password && u.is_active,
      );
      if (!user) throw new ApiError(401, 'Wrong username or password.');
      localStorage.setItem(SESSION_KEY, String(user.id));
      return toPublicUser(user);
    }),

  logout: () =>
    run(() => {
      const user = sessionUser();
      if (user) {
        // Leaving releases anything this user still has open.
        orders.filter((o) => o.locked_by === user.id).forEach(clearLock);
      }
      localStorage.removeItem(SESSION_KEY);
    }),

  me: () => run(() => sessionUser()),

  // Menu
  getMenu: () => run<MenuResponse>(() => (requireUser(), { categories, items: menuItems })),

  createMenuItem: async (payload: CreateMenuItemPayload) => {
    const image_url = payload.image ? await readImage(payload.image) : undefined;
    return run(() => {
      requireAdmin();
      if (!categories.some((category) => category.id === payload.category_id)) {
        throw new ApiError(400, 'Category not found.');
      }
      const item: MenuItem = {
        id: nextId(),
        category_id: payload.category_id,
        name: payload.name,
        description: payload.description,
        price: payload.price,
        prep_time_minutes: payload.prep_time_minutes,
        image_url,
        is_available: true,
      };
      menuItems.push(item);
      return item;
    });
  },

  updateMenuItem: async (id: number, payload: UpdateMenuItemPayload) => {
    const image_url = payload.image ? await readImage(payload.image) : undefined;
    return run(() => {
      requireAdmin();
      const item = menuItems.find((menuItem) => menuItem.id === id);
      if (!item) throw new ApiError(404, 'Menu item not found.');
      if (payload.category_id !== undefined && !categories.some((category) => category.id === payload.category_id)) {
        throw new ApiError(400, 'Category not found.');
      }
      const { image: _, ...fields } = payload;
      Object.assign(item, fields);
      if (image_url) item.image_url = image_url;
      return item;
    });
  },

  setAvailability: (id: number, available: boolean) =>
    run(() => {
      requireAdmin();
      const item = menuItems.find((m) => m.id === id);
      if (!item) throw new ApiError(404, 'Menu item not found.');
      item.is_available = available;
      return item;
    }),

  // Inventory and production planning
  getInventory: () =>
    run<InventoryResponse>(() => {
      requireAdmin();
      return { purchases: [...inventoryPurchases].reverse(), production_plan: productionPlan };
    }),

  addInventoryPurchase: (payload: CreateInventoryPurchasePayload) =>
    run(() => {
      requireAdmin();
      if (!payload.item_name.trim() || !payload.unit.trim()) {
        throw new ApiError(400, 'Item name and unit are required.');
      }
      if (!Number.isFinite(payload.quantity) || payload.quantity <= 0) {
        throw new ApiError(400, 'Quantity must be greater than zero.');
      }
      if (!Number.isFinite(payload.unit_cost) || payload.unit_cost < 0) {
        throw new ApiError(400, 'Unit cost cannot be negative.');
      }
      const purchase: InventoryPurchase = {
        id: nextId(),
        item_name: payload.item_name.trim(),
        quantity: payload.quantity,
        unit: payload.unit.trim(),
        unit_cost: payload.unit_cost,
        purchased_at: new Date().toISOString(),
      };
      inventoryPurchases.push(purchase);
      return purchase;
    }),

  saveProductionPlan: (plan: ProductionPlanEntry[]) =>
    run(() => {
      requireAdmin();
      for (const entry of plan) {
        if (!menuItems.some((item) => item.id === entry.menu_item_id)) {
          throw new ApiError(400, 'Production plan contains an unknown menu item.');
        }
        if (!Number.isInteger(entry.quantity) || entry.quantity < 0) {
          throw new ApiError(400, 'Planned production quantities must be whole numbers of zero or more.');
        }
      }
      productionPlan = plan.map((entry) => ({ ...entry }));
      return productionPlan;
    }),

  // Orders
  listOrders: () =>
    run<Order[]>(() => {
      const user = requireUser();
      return orders
        .filter((o) => isOpenStatus(o.status))
        .filter((o) => user.role === 'admin' || o.created_by === user.id)
        .filter((o) => !isLockActive(o) || o.locked_by === user.id)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    }),

  listAllOrders: () =>
    run<Order[]>(() => {
      requireAdmin();
      return [...orders].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    }),

  markOrderServed: (id: number) =>
    run<Order>(() => {
      const user = requireAdmin();
      const order = findOrder(id);
      const activeRounds = order.rounds.filter((round) => round.status === 'preparing');
      if (activeRounds.length === 0) throw new ApiError(409, 'This order has no rounds being prepared.');

      const now = new Date();
      const overdueRounds = activeRounds
        .map((round) => ({
          round,
          overdueMinutes: Math.floor((now.getTime() - new Date(round.estimated_ready_at).getTime()) / 60_000),
        }))
        .filter(({ overdueMinutes }) => overdueMinutes > 5);

      activeRounds.forEach((round) => {
        round.status = 'served';
      });
      order.updated_at = now.toISOString();
      log(order, user, 'round_served', {
        round_nos: activeRounds.map((round) => round.round_no),
      });
      if (overdueRounds.length > 0) {
        log(order, user, 'kitchen_overdue', {
          rounds: overdueRounds.map(({ round, overdueMinutes }) => ({
            round_no: round.round_no,
            overdue_minutes: overdueMinutes,
          })),
        });
      }
      return order;
    }),

  createOrder: (orderType: OrderType) =>
    run<Order>(() => {
      const user = requireUser();
      const order = newOrder(user, orderType, new Date());
      setLock(order, user);
      log(order, user, 'order_created');
      orders.push(order);
      return order;
    }),

  getOrder: (id: number) =>
    run<Order>(() => {
      const user = requireUser();
      const order = findOrder(id);
      assertAccess(order, user);
      return order;
    }),

  openOrder: (id: number) =>
    run<Order>(() => {
      const user = requireUser();
      const order = findOrder(id);
      assertAccess(order, user);
      if (!isOpenStatus(order.status)) throw new ApiError(409, 'This order is already closed.');
      if (isLockActive(order) && order.locked_by !== user.id) {
        throw new ApiError(409, 'This order is open on another screen.');
      }
      setLock(order, user);
      log(order, user, 'order_opened');
      return order;
    }),

  heartbeat: (id: number) =>
    run(() => {
      const user = requireUser();
      const order = findOrder(id);
      assertHoldsLock(order, user);
      setLock(order, user);
    }),

  releaseOrder: (id: number) =>
    run(() => {
      const user = requireUser();
      const order = findOrder(id);
      if (order.locked_by === user.id) {
        clearLock(order);
        log(order, user, 'order_released');
      }
    }),

  saveOrder: (id: number, payload: SaveOrderPayload) =>
    run<SaveOrderResult>(() => {
      const user = requireUser();
      const order = findOrder(id);
      assertAccess(order, user);
      assertHoldsLock(order, user);

      if (payload.items.length === 0 && order.rounds.length === 0 && !payload.table_no && !payload.customer_name) {
        throw new ApiError(400, 'Add an item or customer details before saving.');
      }

      const { items, ...details } = payload;
      Object.assign(order, details);

      let round: OrderRound | null = null;
      if (items.length > 0) {
        const lines = items.map((line) => {
          const menu = menuItems.find((m) => m.id === line.menu_item_id);
          if (!menu) throw new ApiError(400, 'An item on this order no longer exists.');
          if (!menu.is_available) throw new ApiError(409, `${menu.name} is sold out.`);
          if (line.quantity < 1) throw new ApiError(400, 'Quantities must be at least 1.');
          return [menu.id, line.quantity] as [number, number];
        });
        round = addRound(order, lines, new Date(), user);
      } else {
        log(order, user, 'draft_saved');
      }

      order.updated_at = new Date().toISOString();
      clearLock(order);
      return { order, round };
    }),

  checkout: (id: number, payload: CheckoutPayload) =>
    run<Order>(() => {
      const user = requireUser();
      const order = findOrder(id);
      assertAccess(order, user);
      assertHoldsLock(order, user);
      if (order.rounds.length === 0) throw new ApiError(400, 'Save at least one round before checkout.');
      const paid = payload.payments.reduce((s, p) => s + p.amount, 0);
      if (Math.abs(paid - order.total) > 0.01) {
        throw new ApiError(400, 'The payment must equal the order total.');
      }
      order.payments = payload.payments;
      order.status = 'checked_out';
      order.checked_out_at = new Date().toISOString();
      order.updated_at = order.checked_out_at;
      clearLock(order);
      log(order, user, 'checkout', {
        method: payload.payments.map((p) => p.method).join(', '),
        amount: order.total,
      });
      return order;
    }),

  cancelOrder: (id: number) =>
    run<Order>(() => {
      const user = requireUser();
      const order = findOrder(id);
      assertAccess(order, user);
      if (!isOpenStatus(order.status)) throw new ApiError(409, 'This order is already closed.');
      if (isLockActive(order) && order.locked_by !== user.id) {
        throw new ApiError(409, 'This order is open on another screen.');
      }
      order.status = 'cancelled';
      order.updated_at = new Date().toISOString();
      clearLock(order);
      log(order, user, 'order_cancelled');
      return order;
    }),

  forceUnlock: (id: number) =>
    run(() => {
      const user = requireAdmin();
      const order = findOrder(id);
      const previous = order.locked_by_name;
      clearLock(order);
      log(order, user, 'force_unlock', { previous_holder: previous });
    }),

  activity: (orderId: number) =>
    run<ActivityEntry[]>(() => {
      requireAdmin();
      return activityLog
        .filter((a) => a.order_id === orderId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    }),

  // Reports
  dashboard: (range: DashboardRange) =>
    run<DashboardData>(() => {
      requireAdmin();
      const now = Date.now();
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const from = range === 'today' ? startOfToday.getTime() : now - (range === '7d' ? 7 : 30) * DAY_MS;
      const span = now - from;
      const prevFrom = from - span;

      const paidBetween = (a: number, b: number) =>
        orders.filter((o) => {
          if (o.status !== 'checked_out' || !o.checked_out_at) return false;
          const t = new Date(o.checked_out_at).getTime();
          return t >= a && t < b;
        });

      const totalsOf = (list: MockOrder[]): PeriodTotals => {
        const sales = list.reduce((s, o) => s + o.total, 0);
        return {
          orders: list.length,
          sales,
          avg_order_value: list.length ? sales / list.length : 0,
        };
      };

      const current = paidBetween(from, now + 1);
      const previous = paidBetween(prevFrom, from);

      const byStaff = new Map<string, { name: string; orders: number; sales: number }>();
      const byType = new Map<OrderType, { order_type: OrderType; orders: number; sales: number }>();
      const byHour = new Map<number, { hour: number; orders: number; sales: number }>();
      const payments = new Map<PaymentMethod, number>();
      const itemsMap = new Map<string, { item_name: string; qty: number; revenue: number }>();

      for (const o of current) {
        const s = byStaff.get(o.created_by_name) ?? { name: o.created_by_name, orders: 0, sales: 0 };
        s.orders += 1;
        s.sales += o.total;
        byStaff.set(o.created_by_name, s);

        const t = byType.get(o.order_type) ?? { order_type: o.order_type, orders: 0, sales: 0 };
        t.orders += 1;
        t.sales += o.total;
        byType.set(o.order_type, t);

        const hour = new Date(o.checked_out_at!).getHours();
        const h = byHour.get(hour) ?? { hour, orders: 0, sales: 0 };
        h.orders += 1;
        h.sales += o.total;
        byHour.set(hour, h);

        o.payments.forEach((p) => payments.set(p.method, (payments.get(p.method) ?? 0) + p.amount));

        o.rounds
          .flatMap((r) => r.items)
          .forEach((i) => {
            const row = itemsMap.get(i.item_name) ?? { item_name: i.item_name, qty: 0, revenue: 0 };
            row.qty += i.quantity;
            row.revenue += i.line_total;
            itemsMap.set(i.item_name, row);
          });
      }

      return {
        totals: totalsOf(current),
        previous: totalsOf(previous),
        open_orders: orders.filter((o) => isOpenStatus(o.status)).length,
        cancelled_orders: orders.filter(
          (o) => o.status === 'cancelled' && new Date(o.updated_at).getTime() >= from,
        ).length,
        by_staff: [...byStaff.values()].sort((a, b) => b.sales - a.sales),
        top_items: [...itemsMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 8),
        payment_methods: [...payments.entries()].map(([method, total]) => ({ method, total })),
        by_type: [...byType.values()],
        by_hour: [...byHour.values()].sort((a, b) => a.hour - b.hour),
      };
    }),

  // Users
  listUsers: () => run<User[]>(() => (requireAdmin(), users.map(toPublicUser))),
};
