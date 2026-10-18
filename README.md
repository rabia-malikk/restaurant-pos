# HAWT POS

React + TypeScript + Vite + Material UI frontend for HAWT POS. The application uses its
Node.js API and MySQL database for all authentication and business data.

## Quick start

```bash
npm install
cp .env.example .env
```

Set the local DB password, then run `npm run api` and `npm run dev` in separate terminals.

The `.env` file is local and ignored by Git. Set `DB_PASSWORD` there to the password for
your `hawt_pos` application database user. Do not put database credentials in a `VITE_`
variable; Vite exposes those values to browser code.

Before starting the API, run
[`server/migrations/001_inventory.sql`](./server/migrations/001_inventory.sql) once against
`hawt_pos` using the database migration account. If you have not created an admin account,
run `npm run create-admin` in an interactive terminal. Then run `npm run api` and `npm run dev`
in separate terminals. If you forget the password, run `npm run reset-admin-password` to set
a new one without displaying it; active sessions for that admin will be revoked. Check the
connection at `http://localhost:3000/api/health`.

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
  availability toggles, and user create/edit/delete with an active-user limit.

## Structure

```
src/
  api/          axios client and one file per API resource
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

## API server and database

The included Node API connects to MySQL using server-only `DB_HOST`, `DB_PORT`, `DB_NAME`,
`DB_USER`, and `DB_PASSWORD` values from `.env`. The default database name is `hawt_pos`.
Vite proxies `/api` and `/socket.io` to port 3000 during development. The API uses an
httpOnly session cookie.

The API implements these endpoints:

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | body `{username, password, replace_session?}` returns `{user}`; when another active session exists, returns 409 with code `SESSION_EXISTS` unless `replace_session: true` |
| POST | `/auth/logout` | |
| GET | `/auth/me` | returns `{user}` or 401 |
| GET | `/menu` | returns `{categories, items}`; each item may include `image_url` |
| POST | `/menu/categories` | admin, body `{name}`; creates a category |
| PATCH | `/menu/categories/:id` | admin, updates `{name}` and/or `{is_active}` |
| DELETE | `/menu/categories/:id` | admin; archives the category so its items are unavailable on the POS; it can be restored from Menu |
| POST | `/menu/items` | admin, body `{category_id, name, description?, price, prep_time_minutes}`; multipart with an `image` file when uploading |
| PATCH | `/menu/items/:id` | admin, updates item fields and/or `{is_available}`; multipart with an `image` file when uploading |
| DELETE | `/menu/items/:id` | admin; archives the item from the active menu and removes it from the production plan while retaining historical order snapshots |
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
| DELETE | `/orders/:id/items/:itemId` | removes a saved item from an open order (requires its lock); records a void and recalculates totals; served rounds cannot be changed |
| POST | `/orders/:id/checkout` | body `{payments:[{method, amount, reference?}]}` |
| POST | `/orders/:id/cancel` | |
| POST | `/orders/:id/serve` | admin, marks all preparing rounds as served; logs rounds more than 5 minutes overdue |
| POST | `/orders/:id/force-unlock` | admin |
| GET | `/orders/:id/activity` | admin only |
| GET | `/reports/dashboard?range=today|7d|30d` | admin, shape in `src/types` (`DashboardData`) |
| GET | `/users` | admin, returns `User[]` |
| GET | `/users/capacity` | admin; returns total and per-role active counts and limits from `app_config`; `-1` means unlimited |
| POST | `/users` | admin, body `{name, username, password, role, is_active}`; reject creation that would exceed the database's active-user limit |
| PATCH | `/users/:id` | admin, body contains updated user fields; `password` is optional; reject activating a user beyond the database limit |
| DELETE | `/users/:id` | admin; reject deleting the signed-in admin |

Error responses are JSON `{ "message": "...", "code?": "..." }`. The message is shown to the user.

Each account may have only one active session. A new login prompts before replacing the current session; confirming revokes it, releases its order locks, and signs out its connected browser through `session:revoked`. Socket.IO events the UI listens for: `order:locked`, `order:unlocked`, `order:updated`, `menu:updated`, `session:revoked`.

User capacity is read from `app_config` (`limit.max_admin_users` and
`limit.max_staff_users`) and enforced by the API. The server recalculates prices and totals;
the browser's totals are for display only. User deletion is a soft delete so historical
orders and audit references remain intact. Users, categories, and menu items use the existing
`is_active` flag for deactivation; deleting one in the app archives it by setting
`is_active = 0`, without physically removing its database row.

## Not built yet

- Menu category delete
- Split payments (the API shape already supports several payments)
- Receipt and kitchen ticket printing
- Kitchen display screen (marking rounds ready)
- PWA install and offline caching (add `vite-plugin-pwa`)
- Tests

## Notes

- Currency and tax are set in `.env` (`VITE_CURRENCY`, `VITE_TAX_PERCENT`).
- `npm run build` runs the type check first.
