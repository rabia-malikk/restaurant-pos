# Restaurant POS: frontend

React + TypeScript + Vite + Material UI. This is the frontend starter for the design doc
"Restaurant POS: Architecture and Database Design". It runs on its own with demo data, and
switches to the real Node/MySQL backend with one environment variable.

## Quick start

```bash
npm install
cp .env.example .env     # VITE_USE_MOCK=true runs without a backend
npm run dev              # http://localhost:5173
```

Demo logins (mock mode):

| Role  | Username | Password |
|-------|----------|----------|
| Admin | `admin`  | `admin123` |
| Staff | `ayesha` or `bilal` | `staff123` |

Try this: sign in as `ayesha`, open the table 4 order, add items, press **Save order** to see the
estimated ready time, resume it, then **Checkout**. Then sign in as `admin` to see the dashboard,
all orders, and the activity log. Mock data lives in memory and resets on reload, and each browser
tab has its own copy, so locking between two tabs needs the real backend.

## What is built

- **Login** with role-based routing (admin pages are blocked for staff).
- **POS screen**: left panel of open orders, centre order form and menu grid with - / + buttons,
  right panel with rounds, unsaved items, totals, **Save order** and **Checkout**.
- **Order flow**: create, add items, save as a round (shows estimated ready time), resume to add
  more rounds, checkout with a payment method.
- **Locking**: opening an order locks it. Others do not see it. A heartbeat renews the lock every
  60 s, it is released on save, checkout, switching orders, leaving the page and sign out. Admin can
  force-unlock.
- **Admin**: dashboard (sales, orders, average order, by hour, by staff, payment methods, order
  types, top items), all-orders grid with Resume / Force unlock, activity log drawer, menu
  availability toggles, users list.

## Structure

```
src/
  api/          axios client, one file per resource, mockDb.ts (demo backend)
  components/
    layout/     AppLayout (top bar + nav), ProtectedRoute (role guard)
    pos/        DraftsPanel, OrderTypeToggle, CustomerFields, MenuGrid,
                OrderSummary, PaymentDialog, SavedRoundDialog
    admin/      StatCard, ActivityLogDrawer
  context/      NotifyContext (toasts)
  hooks/        useMenu, useOpenOrders/useAllOrders, useOrderLock, useSocket
  lib/          format, orderRules (validation + totals), errors
  pages/        LoginPage, PosPage, NotFoundPage, admin/*
  store/        authStore, posStore (open order + unsaved cart)
  types/        shared types matching the DB schema
  theme.ts      MUI theme
```

## Connecting the real backend

1. Set `VITE_USE_MOCK=false` in `.env`.
2. Run the backend on port 3000 (Vite proxies `/api` and `/socket.io` to it), or set `VITE_API_URL`.
3. The backend must serve these endpoints and set an httpOnly session cookie on login:

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | body `{username, password}` returns `{user}` |
| POST | `/auth/logout` | |
| GET | `/auth/me` | returns `{user}` or 401 |
| GET | `/menu` | returns `{categories, items}`; each item may include `image_url` |
| POST | `/menu/items` | admin, body `{category_id, name, description?, price, prep_time_minutes}`; multipart with an `image` file when uploading |
| PATCH | `/menu/items/:id` | admin, updates item fields and/or `{is_available}`; multipart with an `image` file when uploading |
| GET | `/inventory` | admin, returns `{purchases, production_plan}` |
| POST | `/inventory/purchases` | admin, body `{item_name, quantity, unit, unit_cost}` where `unit_cost` is per unit |
| PUT | `/inventory/production-plan` | admin, body `{items:[{menu_item_id, quantity}]}`; manually saves tentative production quantities |
| GET | `/orders` | resumable orders. Staff: own. Admin: all. Hide orders locked by others |
| GET | `/orders/all` | admin, all statuses |
| POST | `/orders` | body `{order_type}`, returns a draft locked to the caller |
| GET | `/orders/:id` | |
| POST | `/orders/:id/open` | takes the lock, 409 if held by someone else |
| POST | `/orders/:id/heartbeat` | extends the lock |
| POST | `/orders/:id/release` | |
| POST | `/orders/:id/save` | body: order details + `items[]`, returns `{order, round}`. Creates a round, releases the lock |
| POST | `/orders/:id/checkout` | body `{payments:[{method, amount, reference?}]}` |
| POST | `/orders/:id/cancel` | |
| POST | `/orders/:id/serve` | admin, marks all preparing rounds as served; logs rounds more than 5 minutes overdue |
| POST | `/orders/:id/force-unlock` | admin |
| GET | `/orders/:id/activity` | admin only |
| GET | `/reports/dashboard?range=today|7d|30d` | admin, shape in `src/types` (`DashboardData`) |
| GET | `/users` | admin |

Error responses should be JSON `{ "message": "..." }`. The message is shown to the user.

Socket.IO events the UI listens for: `order:locked`, `order:unlocked`, `order:updated`, `menu:updated`.

The server must recalculate prices and totals itself. The browser's totals are for display only.

## Not built yet

- Menu category and item delete, user create / edit
- Split payments (the API shape already supports several payments)
- Receipt and kitchen ticket printing
- Kitchen display screen (marking rounds ready)
- PWA install and offline caching (add `vite-plugin-pwa`)
- Tests

## Notes

- Currency and tax are set in `.env` (`VITE_CURRENCY`, `VITE_TAX_PERCENT`).
- `npm run build` runs the type check first.
