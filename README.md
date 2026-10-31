# HAWT POS

React + TypeScript + Vite + Material UI frontend for HAWT POS. The application uses its
Node.js API and MySQL database for all authentication and business data.

## Quick start

```bash
npm ci
```

On Windows PowerShell, create the local environment file and edit the database password:

```powershell
Copy-Item .env.example .env
```

The `.env` file is local and ignored by Git. Set `DB_PASSWORD` there to the password for
your `hawt_pos` application database user. Do not put database credentials in a `VITE_`
variable; Vite exposes those values to browser code.

Before starting the API, run [`server/schema.sql`](./server/schema.sql) once using a MySQL
account that can create databases and tables. It creates `hawt_pos`, all application tables,
and the initial configuration values. Separately create/grant the application database account
configured by `DB_USER` in `.env`; the schema script does not create database users. Use
`server/schema.sql` only for a fresh database. For an existing database, back it up and apply
the versioned upgrade scripts for the release you are deploying. This checkout does not include
a `server/migrations` directory, so verify an existing database has all columns and tables in
`server/schema.sql` before starting the API. Admins can assign Orders, Menu, and Kitchen to
individual staff users. Staff see only their own orders in Orders, while Kitchen remains a
shared queue.
On first app load, the browser checks for an admin account and presents a one-time setup page if
none exists. The setup endpoint also checks for an existing admin under a database lock so
concurrent requests cannot create multiple first admins. You can alternatively run
`npm run create-admin` in an interactive terminal.
Then run `npm run api` and `npm run dev` in separate terminals. If you forget the password,
run `npm run reset-admin-password` to set a new one without displaying it; active sessions
for that admin will be revoked. Check the connection at `http://localhost:3000/api/health`.

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
  availability and meal add-on pricing, and user create/edit/delete with an active-user limit.
  POS order items support per-unit meal selection and saved kitchen remarks.

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
| GET | `/auth/setup-status` | public; returns `{adminExists}` |
| POST | `/auth/setup-admin` | public, one-time bootstrap; body `{username, name, password}`; creates the first admin only |
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
| GET | `/customers?contact_number=...` | authenticated, looks up a customer by contact number |
| GET | `/orders/:id/receipt` | admin, paid order details and payment records for printing a receipt |
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
| POST | `/orders/:id/items/:itemId/serve` | admin, marks one preparing item as served; completes its round when all items are served |
| POST | `/orders/:id/force-unlock` | admin |
| GET | `/orders/:id/activity` | admin only |
| GET | `/reports/dashboard?range=today|7d|30d` | admin, shape in `src/types` (`DashboardData`) |
| GET | `/users` | admin, returns `User[]` |
| GET | `/users/capacity` | admin; returns total and per-role active counts and limits from `app_config`; `-1` means unlimited |
| POST | `/users` | admin, body `{name, username, password, role, is_active}`; reject creation that would exceed the database's active-user limit |
| PATCH | `/users/:id` | admin, body contains updated user fields; `password` is optional; reject activating a user beyond the database limit |
| DELETE | `/users/:id` | admin; reject deleting the signed-in admin |

Error responses are JSON `{ "message": "...", "code?": "..." }`. The message is shown to the user.

## Production deployment on Windows Server

This deployment uses IIS for the static frontend and same-origin HTTPS, and runs the Node API
as a Windows service. IIS proxies `/api` and `/socket.io` to the API on loopback so session
cookies and WebSocket connections use the same site origin.

### Requirements

- Windows Server with IIS, IIS URL Rewrite, Application Request Routing (ARR), and the WebSocket
  Protocol role service enabled.
- Node.js 22 or newer LTS and MySQL 8.
- A TLS certificate bound to the IIS site. Do not expose the Node API port to the public internet.
- NSSM installed on the server to run Node as a restartable Windows service.

In IIS Manager, enable ARR proxying at the server level. Set the IIS site physical path to the
frontend deployment directory. The [web.config](./public/web.config) copied into `dist` routes
API and Socket.IO traffic to `127.0.0.1:3000` and provides SPA route fallback.

### Initial setup

1. Back up the database and create an application database account. For a new installation,
   run [`server/schema.sql`](./server/schema.sql) using a MySQL administrative account. Do not
   run this fresh-install schema over an existing production database.
2. Copy the application to a protected deployment directory, for example `C:\HAWT\api`.
   Include `package.json`, `package-lock.json`, and the `server` directory. From that directory,
   run `npm ci --omit=dev`.
3. Copy [`api.production.env.example`](./deployment/windows/api.production.env.example) to
   `C:\HAWT\api\.env` and fill in the production database credentials. Restrict access to this
   file to administrators and the Windows account that runs the API service. Keep it out of
   source control and backups that are not protected.
4. Install NSSM and run PowerShell as Administrator:

   ```powershell
   .\deployment\windows\install-api-service.ps1 `
     -NssmPath 'C:\Tools\nssm\win64\nssm.exe' `
     -ApiDirectory 'C:\HAWT\api'
   ```

   The installer starts the service as the default Windows service identity. For production,
   configure a dedicated least-privilege service account in Windows Services and grant it
   read/execute access to the API directory and modify access only to `C:\HAWT\api\logs`.
5. From the project root on a build machine, install dependencies, configure the frontend
   production values, and build:

   ```powershell
   npm ci
   Copy-Item deployment\windows\frontend.production.env.example .env.production
   # Edit .env.production; VITE_TAX_PERCENT should match setting.tax_percent in MySQL.
   npm run build
   ```

   `VITE_API_URL=/api` and a blank `VITE_SOCKET_URL` are intentional for the same-origin IIS
   proxy. Never put database credentials or private secrets in Vite environment variables.
6. Copy the contents of `dist` to the IIS site directory, including `web.config`. Bind the
   TLS certificate in IIS, then browse to the site. On a new database, the app presents the
   one-time admin setup page.

Verify the API locally on the server with
`Invoke-RestMethod http://127.0.0.1:3000/api/health`, then verify login, API requests, and
live order updates through the HTTPS IIS site. The service installer writes rotating logs
under `C:\HAWT\api\logs`.

### Updating an installation

Back up MySQL before applying schema changes. Stop the API service, deploy the matching backend
release and dependencies, start the service, then publish the new frontend `dist` files to IIS.
Preserve the server's `.env`, database data, and log files. Apply only the database migration
scripts supplied for that release; the fresh-install `schema.sql` is not an upgrade script.
After deployment, check `/api/health`, authenticate through HTTPS, and confirm Socket.IO
updates work through IIS.

Each account may have only one active session. A new login prompts before replacing the current session; confirming revokes it, releases its order locks, and signs out its connected browser through `session:revoked`. Socket.IO events the UI listens for: `order:locked`, `order:unlocked`, `order:updated`, `menu:updated`, `session:revoked`.

User capacity is read from `app_config` (`limit.max_admin_users` and
`limit.max_staff_users`) and enforced by the API. The server recalculates prices and totals;
the browser's totals are for display only. User deletion is a soft delete so historical
orders and audit references remain intact. Users, categories, and menu items use the existing
`is_active` flag for deactivation; deleting one in the app archives it by setting
`is_active = 0`, without physically removing its database row.

## Remaining deployment-independent work

- PWA install and offline caching
- Automated tests

## Notes

- Currency and tax are set in `.env` (`VITE_CURRENCY`, `VITE_TAX_PERCENT`).
- `npm run build` runs the type check first.
