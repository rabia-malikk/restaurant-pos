import 'dotenv/config';
import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import bcrypt from 'bcryptjs';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import mysql from 'mysql2/promise';
import { Server as SocketServer } from 'socket.io';

const API_PORT = Number(process.env.API_PORT ?? 3000);
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

if (!process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME) {
  throw new Error('Set DB_USER, DB_PASSWORD, and DB_NAME in the root .env file.');
}
if (process.env.DB_NAME !== 'hawt_pos') {
  throw new Error('DB_NAME must be hawt_pos for this database setup.');
}

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: 'Z',
  dateStrings: true,
  supportBigNumbers: true,
});

const app = express();
const server = http.createServer(app);
const io = new SocketServer(server, { serveClient: false });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const route = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const rows = async (sql, values = [], connection = pool) => {
  const [result] = await connection.execute(sql, values);
  return result;
};

async function transaction(callback) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function dateIso(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const source = String(value);
  const normalized = source.includes('T') ? source : source.replace(' ', 'T');
  return new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}Z`).toISOString();
}

function number(value) {
  return Number(value ?? 0);
}

function publicUser(row) {
  return {
    id: number(row.id),
    name: row.name,
    username: row.username,
    role: row.role,
    is_active: Boolean(row.is_active),
  };
}

function parseId(value, label = 'id') {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, `Invalid ${label}.`);
  return id;
}

function requiredText(value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new HttpError(400, `${label} is required and must be at most ${maxLength} characters.`);
  }
  return value.trim();
}

function setSessionCookie(res, token) {
  res.cookie('pos_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MS,
  });
}

function clearSessionCookie(res) {
  res.clearCookie('pos_session', { httpOnly: true, sameSite: 'lax', path: '/' });
}

function cookieValue(req, name) {
  const prefix = `${name}=`;
  const pair = (req.headers.cookie ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return pair ? pair.slice(prefix.length) : null;
}

async function sessionForToken(token) {
  if (!token) return null;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const result = await rows(
    `SELECT u.id, u.name, u.username, u.role, u.is_active
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.revoked_at IS NULL
        AND s.expires_at > UTC_TIMESTAMP() AND u.is_active = 1
      LIMIT 1`,
    [tokenHash],
  );
  return result[0] ? publicUser(result[0]) : null;
}

const requireAuth = route(async (req, _res, next) => {
  const token = cookieValue(req, 'pos_session');
  const user = await sessionForToken(token);
  if (!user) throw new HttpError(401, 'Please sign in.');
  req.user = user;
  next();
});

function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'admin') return next(new HttpError(403, 'Only admins can do this.'));
  next();
}

function isOpenStatus(status) {
  return status === 'draft' || status === 'in_progress';
}

function hasActiveLock(order) {
  return order.lock_expires_at && new Date(dateIso(order.lock_expires_at)).getTime() > Date.now();
}

function assertOrderAccess(order, user) {
  if (user.role !== 'admin' && number(order.created_by) !== user.id) {
    throw new HttpError(403, 'This order belongs to another user.');
  }
}

function assertOrderLock(order, user) {
  if (number(order.locked_by) !== user.id || !hasActiveLock(order)) {
    throw new HttpError(409, 'Your hold on this order expired. Open it again.');
  }
}

async function logActivity(orderId, userId, action, details = null, connection = pool) {
  await rows(
    `INSERT INTO activity_log (order_id, user_id, action, details, ip_address)
     VALUES (?, ?, ?, ?, ?)`,
    [orderId, userId, action, details ? JSON.stringify(details) : null, null],
    connection,
  );
}

async function emitOrderEvent(event) {
  io.emit(event);
}

function mapOrder(row, rounds) {
  return {
    id: number(row.id),
    order_no: row.order_no,
    order_type: row.order_type,
    status: row.status,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    delivery_address: row.delivery_address,
    table_no: row.table_no,
    notes: row.notes,
    created_by: number(row.created_by),
    created_by_name: row.created_by_name,
    locked_by: row.locked_by === null ? null : number(row.locked_by),
    locked_by_name: row.locked_by_name ?? null,
    lock_expires_at: dateIso(row.lock_expires_at),
    rounds,
    subtotal: number(row.subtotal),
    discount: number(row.discount),
    tax: number(row.tax),
    delivery_fee: number(row.delivery_fee),
    total: number(row.total),
    created_at: dateIso(row.created_at),
    updated_at: dateIso(row.updated_at),
    checked_out_at: dateIso(row.checked_out_at),
  };
}

async function getOrder(id, connection = pool) {
  const result = await rows(
    `SELECT o.*, creator.name AS created_by_name, locker.name AS locked_by_name
       FROM orders o
       JOIN users creator ON creator.id = o.created_by
       LEFT JOIN users locker ON locker.id = o.locked_by
      WHERE o.id = ?`,
    [id],
    connection,
  );
  const order = result[0];
  if (!order) throw new HttpError(404, 'Order not found.');

  const roundRows = await rows(
    `SELECT id, round_no, status, estimated_minutes, estimated_ready_at, created_at
       FROM order_rounds WHERE order_id = ? ORDER BY round_no`,
    [id],
    connection,
  );
  const rounds = [];
  for (const round of roundRows) {
    const itemRows = await rows(
      `SELECT id, round_id, menu_item_id, item_name, unit_price, prep_time_minutes,
              quantity, line_total
         FROM order_items
        WHERE round_id = ? AND voided_at IS NULL
        ORDER BY id`,
      [round.id],
      connection,
    );
    if (itemRows.length === 0) continue;
    rounds.push({
      id: number(round.id),
      round_no: number(round.round_no),
      status: round.status,
      estimated_minutes: number(round.estimated_minutes),
      estimated_ready_at: dateIso(round.estimated_ready_at),
      created_at: dateIso(round.created_at),
      items: itemRows.map((item) => ({
        id: number(item.id),
        round_id: number(item.round_id),
        menu_item_id: number(item.menu_item_id),
        item_name: item.item_name,
        unit_price: number(item.unit_price),
        prep_time_minutes: number(item.prep_time_minutes),
        quantity: number(item.quantity),
        line_total: number(item.line_total),
      })),
    });
  }
  return mapOrder(order, rounds);
}

async function readLockTimeout(connection = pool) {
  const result = await rows(
    "SELECT value FROM app_config WHERE config_key = 'setting.lock_timeout_minutes'",
    [],
    connection,
  );
  const configured = Number(result[0]?.value ?? 5);
  return Number.isInteger(configured) && configured > 0 ? configured : 5;
}

async function updateLock(orderId, userId, connection) {
  const minutes = await readLockTimeout(connection);
  await rows(
    `UPDATE orders
        SET locked_by = ?, locked_at = UTC_TIMESTAMP(),
            lock_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${minutes} MINUTE)
      WHERE id = ?`,
    [userId, orderId],
    connection,
  );
}

async function userCapacity(role, connection) {
  const key = role === 'admin' ? 'limit.max_admin_users' : 'limit.max_staff_users';
  const result = await rows('SELECT value FROM app_config WHERE config_key = ? FOR UPDATE', [key], connection);
  if (!result[0]) throw new Error(`Required user limit setting ${key} is missing from app_config.`);
  const limit = Number(result[0].value);
  if (!Number.isInteger(limit) || limit < -1) throw new Error(`Invalid user limit setting ${key}.`);
  return limit;
}

async function assertUserCapacity(role, connection) {
  const maximum = await userCapacity(role, connection);
  if (maximum === -1) return;
  const result = await rows(
    'SELECT COUNT(*) AS total FROM users WHERE role = ? AND is_active = 1',
    [role],
    connection,
  );
  if (number(result[0].total) >= maximum) {
    throw new HttpError(409, `The allowed number of active ${role} users has been reached.`);
  }
}

async function assertNotLastAdmin(userId, nextRole, nextActive, connection) {
  const [current] = await rows('SELECT role, is_active FROM users WHERE id = ? FOR UPDATE', [userId], connection);
  if (!current || current.role !== 'admin' || !current.is_active || (nextRole === 'admin' && nextActive)) return;
  await rows(
    "SELECT config_key FROM app_config WHERE config_key = 'limit.max_admin_users' FOR UPDATE",
    [],
    connection,
  );
  const [result] = await rows(
    "SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND is_active = 1",
    [],
    connection,
  );
  if (number(result.total) <= 1) throw new HttpError(409, 'At least one active admin account must remain.');
}

function userCapacityResponse(adminCount, staffCount, adminMax, staffMax) {
  return {
    active_users: number(adminCount) + number(staffCount),
    max_users: adminMax === -1 || staffMax === -1 ? -1 : adminMax + staffMax,
    active_admins: number(adminCount),
    max_admins: adminMax,
    active_staff: number(staffCount),
    max_staff: staffMax,
  };
}

function getImageMime(buffer) {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) return 'image/webp';
  if (buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.toString('ascii', 0, 6))) return 'image/gif';
  return null;
}

async function saveImage(file, userId, menuItemId = null) {
  const mime = getImageMime(file.buffer);
  if (!mime) throw new HttpError(400, 'Choose a valid PNG, JPEG, GIF, or WebP image.');
  const uploadLimit = await rows(
    "SELECT value FROM app_config WHERE config_key = 'limit.max_upload_mb'",
  );
  const maxMb = Number(uploadLimit[0]?.value ?? 5);
  if (!Number.isFinite(maxMb) || file.size > maxMb * 1024 * 1024) {
    throw new HttpError(400, `Image must be ${maxMb} MB or smaller.`);
  }
  return transaction(async (connection) => {
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const result = await rows(
      `INSERT INTO documents
         (doc_type, entity_type, entity_id, original_name, mime_type, size_bytes, sha256, uploaded_by)
       VALUES ('item_photo', 'menu_item', ?, ?, ?, ?, ?, ?)`,
      [menuItemId, file.originalname.slice(0, 255), mime, file.size, sha256, userId],
      connection,
    );
    await rows(
      'INSERT INTO document_blobs (document_id, content) VALUES (?, ?)',
      [result.insertId, file.buffer],
      connection,
    );
    return number(result.insertId);
  });
}

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', route(async (_req, res) => {
  await rows('SELECT 1');
  res.json({ status: 'ok', database: 'hawt_pos' });
}));

// Authentication
app.post('/api/auth/login', route(async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!username || !password || username.length > 50) {
    throw new HttpError(400, 'Enter your username and password.');
  }

  const results = await rows(
    `SELECT id, name, username, password_hash, role, is_active, failed_login_count, locked_until
       FROM users WHERE username = ? LIMIT 1`,
    [username],
  );
  const found = results[0];
  const locked = found?.locked_until && new Date(dateIso(found.locked_until)).getTime() > Date.now();
  const passwordMatches = found ? await bcrypt.compare(password, found.password_hash) : false;
  const valid = Boolean(found && found.is_active && !locked && passwordMatches);

  await transaction(async (connection) => {
    await rows(
      `INSERT INTO login_attempts
         (username, user_id, success, failure_reason, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        username,
        found?.id ?? null,
        valid ? 1 : 0,
        valid ? null : !found ? 'unknown_user' : locked ? 'locked' : !found.is_active ? 'inactive' : 'bad_password',
        req.ip,
        (req.get('user-agent') ?? '').slice(0, 255),
      ],
      connection,
    );
    if (found && valid) {
      await rows(
        'UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP() WHERE id = ?',
        [found.id],
        connection,
      );
    } else if (found && found.is_active && !locked) {
      const nextFailures = number(found.failed_login_count) + 1;
      const lockedUntil = nextFailures >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await rows(
        'UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?',
        [nextFailures, lockedUntil, found.id],
        connection,
      );
    }
  });

  if (!valid) throw new HttpError(401, 'Wrong username or password.');

  const replaceSession = req.body?.replace_session === true;
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { previousSessions, authenticatedUser } = await transaction(async (connection) => {
    const [lockedUser] = await rows(
      `SELECT id, name, username, password_hash, role, is_active, locked_until
         FROM users WHERE id = ? FOR UPDATE`,
      [found.id],
      connection,
    );
    if (
      !lockedUser ||
      !lockedUser.is_active ||
      (lockedUser.locked_until && new Date(dateIso(lockedUser.locked_until)).getTime() > Date.now()) ||
      !(await bcrypt.compare(password, lockedUser.password_hash))
    ) {
      throw new HttpError(401, 'Wrong username or password.');
    }
    const activeSessions = await rows(
      `SELECT id, token_hash FROM user_sessions
        WHERE user_id = ? AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()
        FOR UPDATE`,
      [found.id],
      connection,
    );
    if (activeSessions.length && !replaceSession) {
      throw new HttpError(
        409,
        'This account is already signed in elsewhere.',
        'SESSION_EXISTS',
      );
    }
    if (activeSessions.length) {
      await rows(
        `UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP()
          WHERE user_id = ? AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()`,
        [found.id],
        connection,
      );
      await rows(
        `UPDATE orders SET locked_by = NULL, locked_at = NULL, lock_expires_at = NULL
          WHERE locked_by = ?`,
        [found.id],
        connection,
      );
    }
    await rows(
      `INSERT INTO user_sessions (user_id, token_hash, user_agent, ip_address, expires_at)
       VALUES (?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY))`,
      [found.id, tokenHash, (req.get('user-agent') ?? '').slice(0, 255), req.ip],
      connection,
    );
    return { previousSessions: activeSessions, authenticatedUser: lockedUser };
  });
  if (previousSessions.length) {
    io.to(`user:${number(found.id)}`).emit('session:revoked');
    emitOrderEvent('order:unlocked');
  }
  setSessionCookie(res, token);
  res.json({ user: publicUser(authenticatedUser) });
}));

app.post('/api/auth/logout', requireAuth, route(async (req, res) => {
  const token = cookieValue(req, 'pos_session');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await rows('UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP() WHERE token_hash = ?', [tokenHash]);
  await rows(
    `UPDATE orders SET locked_by = NULL, locked_at = NULL, lock_expires_at = NULL
      WHERE locked_by = ?`,
    [req.user.id],
  );
  clearSessionCookie(res);
  emitOrderEvent('order:unlocked');
  res.status(204).end();
}));

app.get('/api/auth/me', requireAuth, route(async (req, res) => {
  res.json({ user: req.user });
}));

// User management
app.get('/api/users', requireAuth, requireAdmin, route(async (_req, res) => {
  const result = await rows(
    'SELECT id, name, username, role, is_active FROM users ORDER BY role, name',
  );
  res.json(result.map(publicUser));
}));

app.get('/api/users/capacity', requireAuth, requireAdmin, route(async (_req, res) => {
  const result = await rows(
    `SELECT role, COUNT(*) AS total
       FROM users WHERE is_active = 1 GROUP BY role`,
  );
  const counts = Object.fromEntries(result.map((row) => [row.role, number(row.total)]));
  const adminMax = await userCapacity('admin', pool);
  const staffMax = await userCapacity('staff', pool);
  res.json(userCapacityResponse(counts.admin ?? 0, counts.staff ?? 0, adminMax, staffMax));
}));

app.post('/api/users', requireAuth, requireAdmin, route(async (req, res) => {
  const name = requiredText(req.body?.name, 'Name', 100);
  const username = requiredText(req.body?.username, 'Username', 50).toLowerCase();
  const password = req.body?.password;
  if (typeof password !== 'string' || password.length > 200) {
    throw new HttpError(400, 'Password is required and must be at most 200 characters.');
  }
  const role = req.body?.role;
  const isActive = req.body?.is_active !== false;
  if (!['admin', 'staff'].includes(role)) throw new HttpError(400, 'Role must be admin or staff.');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  const passwordHash = await bcrypt.hash(password, 12);

  const id = await transaction(async (connection) => {
    if (isActive) await assertUserCapacity(role, connection);
    const result = await rows(
      `INSERT INTO users (name, username, password_hash, role, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, username, passwordHash, role, isActive ? 1 : 0, req.user.id],
      connection,
    );
    return number(result.insertId);
  });
  const [created] = await rows(
    'SELECT id, name, username, role, is_active FROM users WHERE id = ?',
    [id],
  );
  res.status(201).json(publicUser(created));
}));

app.patch('/api/users/:id', requireAuth, requireAdmin, route(async (req, res) => {
  const id = parseId(req.params.id);
  const [existing] = await rows(
    'SELECT id, name, username, role, is_active FROM users WHERE id = ?',
    [id],
  );
  if (!existing) throw new HttpError(404, 'User not found.');
  if (id === req.user.id && (req.body?.is_active === false || req.body?.role === 'staff')) {
    throw new HttpError(400, 'You cannot deactivate or demote your own account.');
  }
  const name = req.body?.name === undefined ? existing.name : requiredText(req.body.name, 'Name', 100);
  const username = req.body?.username === undefined
    ? existing.username
    : requiredText(req.body.username, 'Username', 50).toLowerCase();
  const role = req.body?.role === undefined ? existing.role : req.body.role;
  const isActive = req.body?.is_active === undefined ? Boolean(existing.is_active) : req.body.is_active;
  const password = req.body?.password;
  if (!['admin', 'staff'].includes(role)) throw new HttpError(400, 'Role must be admin or staff.');
  if (typeof isActive !== 'boolean') throw new HttpError(400, 'is_active must be true or false.');
  if (password !== undefined && (typeof password !== 'string' || password.length < 8)) {
    throw new HttpError(400, 'Password must be at least 8 characters.');
  }
  const hash = password ? await bcrypt.hash(password, 12) : null;

  await transaction(async (connection) => {
    if (isActive && (!existing.is_active || role !== existing.role)) {
      await assertUserCapacity(role, connection);
    }
    await assertNotLastAdmin(id, role, isActive, connection);
    await rows(
      `UPDATE users
          SET name = ?, username = ?, role = ?, is_active = ?,
              password_hash = COALESCE(?, password_hash)
        WHERE id = ?`,
      [name, username, role, isActive ? 1 : 0, hash, id],
      connection,
    );
    if (hash) {
      const token = id === req.user.id ? cookieValue(req, 'pos_session') : null;
      const currentTokenHash = token ? createHash('sha256').update(token).digest('hex') : '';
      await rows(
        `UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP()
          WHERE user_id = ? AND revoked_at IS NULL AND token_hash <> ?`,
        [id, currentTokenHash],
        connection,
      );
      await rows(
        `UPDATE orders SET locked_by = NULL, locked_at = NULL, lock_expires_at = NULL
          WHERE locked_by = ?`,
        [id],
        connection,
      );
    }
    if (!isActive) {
      await rows(
        'UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL',
        [id],
        connection,
      );
      await rows(
        `UPDATE orders SET locked_by = NULL, locked_at = NULL, lock_expires_at = NULL
          WHERE locked_by = ?`,
        [id],
        connection,
      );
    }
  });
  const [updated] = await rows(
    'SELECT id, name, username, role, is_active FROM users WHERE id = ?',
    [id],
  );
  res.json(publicUser(updated));
}));

app.delete('/api/users/:id', requireAuth, requireAdmin, route(async (req, res) => {
  const id = parseId(req.params.id);
  if (id === req.user.id) throw new HttpError(400, 'You cannot delete your own account.');
  await transaction(async (connection) => {
    const [user] = await rows('SELECT id, role, is_active FROM users WHERE id = ? FOR UPDATE', [id], connection);
    if (!user) throw new HttpError(404, 'User not found.');
    await assertNotLastAdmin(id, 'staff', false, connection);
    await rows('UPDATE users SET is_active = 0 WHERE id = ?', [id], connection);
    await rows(
      'UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL',
      [id],
      connection,
    );
    await rows(
      'UPDATE orders SET locked_by = NULL, locked_at = NULL, lock_expires_at = NULL WHERE locked_by = ?',
      [id],
      connection,
    );
  });
  emitOrderEvent('order:unlocked');
  res.status(204).end();
}));

// Menu and images
app.get('/api/documents/:id', requireAuth, route(async (req, res) => {
  const id = parseId(req.params.id, 'document id');
  const [file] = await rows(
    `SELECT d.mime_type, d.original_name, b.content
       FROM documents d JOIN document_blobs b ON b.document_id = d.id
      WHERE d.id = ? AND d.deleted_at IS NULL`,
    [id],
  );
  if (!file) throw new HttpError(404, 'Image not found.');
  res.type(file.mime_type).set('Cache-Control', 'private, max-age=3600').send(file.content);
}));

app.get('/api/menu', requireAuth, route(async (req, res) => {
  const adminView = req.user.role === 'admin';
  const categories = await rows(
    `SELECT id, name, sort_order, is_active FROM categories
      ${adminView ? '' : 'WHERE is_active = 1'}
      ORDER BY sort_order, name`,
  );
  const items = await rows(
    `SELECT mi.id, mi.category_id, mi.name, mi.description, mi.price,
            mi.prep_time_minutes, mi.image_document_id, mi.is_available, c.is_active AS category_is_active
       FROM menu_items mi
       JOIN categories c ON c.id = mi.category_id
      WHERE mi.is_active = 1 ${adminView ? '' : 'AND c.is_active = 1'}
      ORDER BY mi.sort_order, mi.name`,
  );
  res.json({
    categories: categories.map((category) => ({
      id: number(category.id),
      name: category.name,
      sort_order: number(category.sort_order),
      is_active: Boolean(category.is_active),
    })),
    items: items.map((item) => ({
      id: number(item.id),
      category_id: number(item.category_id),
      name: item.name,
      description: item.description ?? undefined,
      image_url: item.image_document_id ? `/api/documents/${number(item.image_document_id)}` : undefined,
      price: number(item.price),
      prep_time_minutes: number(item.prep_time_minutes),
      is_available: Boolean(item.is_available),
      category_is_active: Boolean(item.category_is_active),
    })),
  });
}));

app.post('/api/menu/categories', requireAuth, requireAdmin, route(async (req, res) => {
  const name = requiredText(req.body?.name, 'Category name', 100);
  const [nextSort] = await rows('SELECT COALESCE(MAX(sort_order), 0) + 1 AS sort_order FROM categories');
  const result = await rows(
    'INSERT INTO categories (name, sort_order) VALUES (?, ?)',
    [name, number(nextSort.sort_order)],
  );
  const category = {
    id: number(result.insertId),
    name,
    sort_order: number(nextSort.sort_order),
    is_active: true,
  };
  emitOrderEvent('menu:updated');
  res.status(201).json(category);
}));

app.patch('/api/menu/categories/:id', requireAuth, requireAdmin, route(async (req, res) => {
  const id = parseId(req.params.id, 'category id');
  const hasName = req.body?.name !== undefined;
  const hasActive = req.body?.is_active !== undefined;
  if (!hasName && !hasActive) throw new HttpError(400, 'Provide a category name or is_active value.');
  const name = hasName ? requiredText(req.body.name, 'Category name', 100) : undefined;
  if (hasActive && typeof req.body.is_active !== 'boolean') {
    throw new HttpError(400, 'is_active must be true or false.');
  }
  const [existing] = await rows(
    'SELECT id, name, sort_order, is_active FROM categories WHERE id = ?',
    [id],
  );
  if (!existing) throw new HttpError(404, 'Category not found.');
  await rows(
    'UPDATE categories SET name = ?, is_active = ? WHERE id = ?',
    [name ?? existing.name, hasActive ? (req.body.is_active ? 1 : 0) : existing.is_active, id],
  );
  const category = {
    id,
    name: name ?? existing.name,
    sort_order: number(existing.sort_order),
    is_active: hasActive ? req.body.is_active : Boolean(existing.is_active),
  };
  emitOrderEvent('menu:updated');
  res.json(category);
}));

app.delete('/api/menu/categories/:id', requireAuth, requireAdmin, route(async (req, res) => {
  const id = parseId(req.params.id, 'category id');
  const result = await rows(
    'UPDATE categories SET is_active = 0 WHERE id = ? AND is_active = 1',
    [id],
  );
  if (!result.affectedRows) throw new HttpError(404, 'Active category not found.');
  emitOrderEvent('menu:updated');
  res.status(204).end();
}));

app.post('/api/menu/items', requireAuth, requireAdmin, upload.single('image'), route(async (req, res) => {
  const categoryId = parseId(req.body?.category_id, 'category id');
  const name = requiredText(req.body?.name, 'Item name', 150);
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : null;
  const price = Number(req.body?.price);
  const prepTime = Number(req.body?.prep_time_minutes);
  if (!Number.isFinite(price) || price <= 0) throw new HttpError(400, 'Price must be greater than zero.');
  if (!Number.isInteger(prepTime) || prepTime < 0 || prepTime > 65535) {
    throw new HttpError(400, 'Prep time must be a whole number of minutes.');
  }
  const [category] = await rows('SELECT id FROM categories WHERE id = ? AND is_active = 1', [categoryId]);
  if (!category) throw new HttpError(400, 'Category not found.');
  const imageId = req.file ? await saveImage(req.file, req.user.id) : null;
  const result = await rows(
    `INSERT INTO menu_items
       (category_id, name, description, price, prep_time_minutes, image_document_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [categoryId, name, description, price, prepTime, imageId, req.user.id],
  );
  const item = {
    id: number(result.insertId),
    category_id: categoryId,
    name,
    description: description ?? undefined,
    image_url: imageId ? `/api/documents/${imageId}` : undefined,
    price,
    prep_time_minutes: prepTime,
    is_available: true,
  };
  if (imageId) {
    await rows(
      "UPDATE documents SET entity_id = ? WHERE id = ?",
      [item.id, imageId],
    );
  }
  emitOrderEvent('menu:updated');
  res.status(201).json(item);
}));

app.patch('/api/menu/items/:id', requireAuth, requireAdmin, upload.single('image'), route(async (req, res) => {
  const id = parseId(req.params.id);
  const [existing] = await rows(
    `SELECT id, category_id, name, description, price, prep_time_minutes,
            image_document_id, is_available
       FROM menu_items WHERE id = ? AND is_active = 1`,
    [id],
  );
  if (!existing) throw new HttpError(404, 'Menu item not found.');
  const categoryId = req.body?.category_id === undefined ? number(existing.category_id) : parseId(req.body.category_id, 'category id');
  const name = req.body?.name === undefined ? existing.name : requiredText(req.body.name, 'Item name', 150);
  const description = req.body?.description === undefined
    ? existing.description
    : String(req.body.description).trim() || null;
  const price = req.body?.price === undefined ? number(existing.price) : Number(req.body.price);
  const prepTime = req.body?.prep_time_minutes === undefined
    ? number(existing.prep_time_minutes)
    : Number(req.body.prep_time_minutes);
  const isAvailable = req.body?.is_available === undefined
    ? Boolean(existing.is_available)
    : req.body.is_available === 'true' ? true
      : req.body.is_available === 'false' ? false
        : req.body.is_available;
  if (!Number.isFinite(price) || price <= 0) throw new HttpError(400, 'Price must be greater than zero.');
  if (!Number.isInteger(prepTime) || prepTime < 0 || prepTime > 65535) {
    throw new HttpError(400, 'Prep time must be a whole number of minutes.');
  }
  if (typeof isAvailable !== 'boolean' && isAvailable !== 0 && isAvailable !== 1) {
    throw new HttpError(400, 'is_available must be true or false.');
  }
  const [category] = await rows('SELECT id FROM categories WHERE id = ? AND is_active = 1', [categoryId]);
  if (!category) throw new HttpError(400, 'Category not found.');
  const imageId = req.file ? await saveImage(req.file, req.user.id, id) : existing.image_document_id;
  await rows(
    `UPDATE menu_items
        SET category_id = ?, name = ?, description = ?, price = ?,
            prep_time_minutes = ?, image_document_id = ?, is_available = ?
      WHERE id = ?`,
    [categoryId, name, description, price, prepTime, imageId, isAvailable ? 1 : 0, id],
  );
  if (req.file && existing.image_document_id) {
    await rows('UPDATE documents SET deleted_at = UTC_TIMESTAMP() WHERE id = ?', [existing.image_document_id]);
  }
  const item = {
    id,
    category_id: categoryId,
    name,
    description: description ?? undefined,
    image_url: imageId ? `/api/documents/${number(imageId)}` : undefined,
    price,
    prep_time_minutes: prepTime,
    is_available: Boolean(isAvailable),
  };
  emitOrderEvent('menu:updated');
  res.json(item);
}));

app.delete('/api/menu/items/:id', requireAuth, requireAdmin, route(async (req, res) => {
  const id = parseId(req.params.id);
  await transaction(async (connection) => {
    const [item] = await rows(
      'SELECT id FROM menu_items WHERE id = ? AND is_active = 1 FOR UPDATE',
      [id],
      connection,
    );
    if (!item) throw new HttpError(404, 'Menu item not found.');
    await rows(
      'UPDATE menu_items SET is_active = 0, is_available = 0 WHERE id = ?',
      [id],
      connection,
    );
    await rows('DELETE FROM production_plan WHERE menu_item_id = ?', [id], connection);
  });
  emitOrderEvent('menu:updated');
  res.status(204).end();
}));

// Inventory. The additional inventory tables are supplied in server/migrations/001_inventory.sql.
app.get('/api/inventory', requireAuth, requireAdmin, route(async (_req, res) => {
  const purchases = await rows(
    `SELECT id, item_name, quantity, unit, unit_cost, purchased_at
       FROM inventory_purchases ORDER BY purchased_at DESC, id DESC`,
  );
  const productionPlan = await rows(
    'SELECT menu_item_id, quantity FROM production_plan ORDER BY menu_item_id',
  );
  res.json({
    purchases: purchases.map((purchase) => ({
      id: number(purchase.id),
      item_name: purchase.item_name,
      quantity: number(purchase.quantity),
      unit: purchase.unit,
      unit_cost: number(purchase.unit_cost),
      purchased_at: dateIso(purchase.purchased_at),
    })),
    production_plan: productionPlan.map((entry) => ({
      menu_item_id: number(entry.menu_item_id),
      quantity: number(entry.quantity),
    })),
  });
}));

app.post('/api/inventory/purchases', requireAuth, requireAdmin, route(async (req, res) => {
  const itemName = requiredText(req.body?.item_name, 'Ingredient', 120);
  const unit = requiredText(req.body?.unit, 'Unit', 24);
  const quantity = Number(req.body?.quantity);
  const unitCost = Number(req.body?.unit_cost);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new HttpError(400, 'Quantity must be greater than zero.');
  if (!Number.isFinite(unitCost) || unitCost < 0) throw new HttpError(400, 'Unit cost cannot be negative.');
  const result = await rows(
    'INSERT INTO inventory_purchases (item_name, quantity, unit, unit_cost, purchased_by) VALUES (?, ?, ?, ?, ?)',
    [itemName, quantity, unit, unitCost, req.user.id],
  );
  const [purchase] = await rows(
    'SELECT id, item_name, quantity, unit, unit_cost, purchased_at FROM inventory_purchases WHERE id = ?',
    [result.insertId],
  );
  res.status(201).json({
    id: number(purchase.id),
    item_name: purchase.item_name,
    quantity: number(purchase.quantity),
    unit: purchase.unit,
    unit_cost: number(purchase.unit_cost),
    purchased_at: dateIso(purchase.purchased_at),
  });
}));

app.put('/api/inventory/production-plan', requireAuth, requireAdmin, route(async (req, res) => {
  const entries = req.body?.items;
  if (!Array.isArray(entries)) throw new HttpError(400, 'items must be an array.');
  const normalized = entries.map((entry) => ({
    menu_item_id: parseId(entry?.menu_item_id, 'menu item id'),
    quantity: Number(entry?.quantity),
  }));
  if (normalized.some((entry) => !Number.isInteger(entry.quantity) || entry.quantity < 0)) {
    throw new HttpError(400, 'Planned production quantities must be whole numbers of zero or more.');
  }
  await transaction(async (connection) => {
    const ids = normalized.map((entry) => entry.menu_item_id);
    if (ids.length) {
      const found = await rows(
        `SELECT mi.id FROM menu_items mi
         JOIN categories c ON c.id = mi.category_id AND c.is_active = 1
         WHERE mi.is_active = 1 AND mi.id IN (${ids.map(() => '?').join(',')})`,
        ids,
        connection,
      );
      if (found.length !== new Set(ids).size) {
        throw new HttpError(400, 'Production plan contains an unknown or disabled menu item.');
      }
    }
    await rows('DELETE FROM production_plan', [], connection);
    for (const entry of normalized) {
      await rows(
        `INSERT INTO production_plan (menu_item_id, quantity, updated_by)
         VALUES (?, ?, ?)`,
        [entry.menu_item_id, entry.quantity, req.user.id],
        connection,
      );
    }
  });
  res.json(normalized);
}));

// Order management
app.get('/api/orders', requireAuth, route(async (req, res) => {
  const filter = req.user.role === 'admin' ? '' : 'AND created_by = ?';
  const values = req.user.role === 'admin' ? [] : [req.user.id];
  const result = await rows(
    `SELECT id FROM orders
      WHERE status IN ('draft', 'in_progress')
        AND (locked_by IS NULL OR locked_by = ? OR lock_expires_at IS NULL
             OR lock_expires_at <= UTC_TIMESTAMP())
        ${filter}
      ORDER BY updated_at DESC`,
    [req.user.id, ...values],
  );
  res.json(await Promise.all(result.map((order) => getOrder(number(order.id)))));
}));

app.get('/api/orders/all', requireAuth, requireAdmin, route(async (_req, res) => {
  const result = await rows('SELECT id FROM orders ORDER BY updated_at DESC');
  res.json(await Promise.all(result.map((order) => getOrder(number(order.id)))));
}));

app.post('/api/orders', requireAuth, route(async (req, res) => {
  const orderType = req.body?.order_type;
  if (!['dine_in', 'takeaway', 'delivery'].includes(orderType)) {
    throw new HttpError(400, 'Choose a valid order type.');
  }
  const orderId = await transaction(async (connection) => {
    const [openCount] = await rows(
      `SELECT COUNT(*) AS total FROM orders
        WHERE created_by = ? AND status IN ('draft', 'in_progress')`,
      [req.user.id],
      connection,
    );
    const limitRows = await rows(
      "SELECT value FROM app_config WHERE config_key = 'limit.max_open_orders_per_user'",
      [],
      connection,
    );
    const maxOpen = Number(limitRows[0]?.value ?? 20);
    if (maxOpen !== -1 && number(openCount.total) >= maxOpen) {
      throw new HttpError(409, 'You have reached the maximum number of open orders.');
    }
    const today = new Date().toISOString().slice(0, 10);
    await rows(
      `INSERT INTO order_counters (counter_date, last_no)
       VALUES (?, 1)
       ON DUPLICATE KEY UPDATE last_no = LAST_INSERT_ID(last_no + 1)`,
      [today],
      connection,
    );
    const [counter] = await rows(
      'SELECT last_no FROM order_counters WHERE counter_date = ? FOR UPDATE',
      [today],
      connection,
    );
    const orderNo = `${today.replace(/-/g, '')}-${String(counter.last_no).padStart(4, '0')}`;
    const result = await rows(
      `INSERT INTO orders (order_no, order_type, created_by, locked_by, locked_at, lock_expires_at)
       VALUES (?, ?, ?, ?, UTC_TIMESTAMP(),
               DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${await readLockTimeout(connection)} MINUTE))`,
      [orderNo, orderType, req.user.id, req.user.id],
      connection,
    );
    const id = number(result.insertId);
    await logActivity(id, req.user.id, 'order_created', null, connection);
    return id;
  });
  const order = await getOrder(orderId);
  emitOrderEvent('order:updated');
  res.status(201).json(order);
}));

app.get('/api/orders/:id', requireAuth, route(async (req, res) => {
  const order = await getOrder(parseId(req.params.id));
  assertOrderAccess(order, req.user);
  res.json(order);
}));

app.post('/api/orders/:id/open', requireAuth, route(async (req, res) => {
  const id = parseId(req.params.id);
  await transaction(async (connection) => {
    const [order] = await rows('SELECT * FROM orders WHERE id = ? FOR UPDATE', [id], connection);
    if (!order) throw new HttpError(404, 'Order not found.');
    assertOrderAccess(order, req.user);
    if (!isOpenStatus(order.status)) throw new HttpError(409, 'This order is already closed.');
    if (order.locked_by && new Date(dateIso(order.lock_expires_at)).getTime() > Date.now() &&
        number(order.locked_by) !== req.user.id) {
      throw new HttpError(409, 'This order is open on another screen.');
    }
    await updateLock(id, req.user.id, connection);
    await logActivity(id, req.user.id, 'order_opened', null, connection);
  });
  emitOrderEvent('order:locked');
  res.json(await getOrder(id));
}));

app.post('/api/orders/:id/heartbeat', requireAuth, route(async (req, res) => {
  const id = parseId(req.params.id);
  await transaction(async (connection) => {
    const [order] = await rows('SELECT * FROM orders WHERE id = ? FOR UPDATE', [id], connection);
    if (!order) throw new HttpError(404, 'Order not found.');
    assertOrderLock(order, req.user);
    await updateLock(id, req.user.id, connection);
  });
  res.status(204).end();
}));

app.post('/api/orders/:id/release', requireAuth, route(async (req, res) => {
  const id = parseId(req.params.id);
  const result = await rows(
    'UPDATE orders SET locked_by = NULL, locked_at = NULL, lock_expires_at = NULL WHERE id = ? AND locked_by = ?',
    [id, req.user.id],
  );
  if (result.affectedRows) {
    await logActivity(id, req.user.id, 'order_released');
    emitOrderEvent('order:unlocked');
  }
  res.status(204).end();
}));

app.post('/api/orders/:id/save', requireAuth, route(async (req, res) => {
  const id = parseId(req.params.id);
  const details = req.body ?? {};
  if (!['dine_in', 'takeaway', 'delivery'].includes(details.order_type)) {
    throw new HttpError(400, 'Choose a valid order type.');
  }
  const items = details.items;
  if (!Array.isArray(items)) throw new HttpError(400, 'items must be an array.');
  const normalized = items.map((item) => ({
    menu_item_id: parseId(item?.menu_item_id, 'menu item id'),
    quantity: Number(item?.quantity),
  }));
  if (normalized.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 65535)) {
    throw new HttpError(400, 'Quantities must be whole numbers of at least 1.');
  }
  const orderDetails = {
    order_type: details.order_type,
    customer_name: String(details.customer_name ?? '').trim().slice(0, 100),
    customer_phone: String(details.customer_phone ?? '').trim().slice(0, 30),
    delivery_address: String(details.delivery_address ?? '').trim().slice(0, 500),
    table_no: String(details.table_no ?? '').trim().slice(0, 20),
    notes: String(details.notes ?? '').trim().slice(0, 500),
  };
  if (orderDetails.order_type === 'dine_in' && !orderDetails.table_no) {
    throw new HttpError(400, 'Enter a table number for dine-in orders.');
  }
  if (orderDetails.order_type === 'takeaway' && !orderDetails.customer_name) {
    throw new HttpError(400, 'Enter the customer name for takeaway orders.');
  }
  if (
    orderDetails.order_type === 'delivery' &&
    (!orderDetails.customer_name || !orderDetails.customer_phone || !orderDetails.delivery_address)
  ) {
    throw new HttpError(400, 'Delivery orders need a name, phone number and address.');
  }

  let newRoundId = null;
  await transaction(async (connection) => {
    const [order] = await rows('SELECT * FROM orders WHERE id = ? FOR UPDATE', [id], connection);
    if (!order) throw new HttpError(404, 'Order not found.');
    assertOrderAccess(order, req.user);
    assertOrderLock(order, req.user);
    const [existingRounds] = await rows(
      'SELECT COUNT(*) AS total FROM order_rounds WHERE order_id = ?',
      [id],
      connection,
    );
    if (
      normalized.length === 0 &&
      number(existingRounds.total) === 0 &&
      !orderDetails.table_no &&
      !orderDetails.customer_name
    ) {
      throw new HttpError(400, 'Add an item or customer details before saving.');
    }
    await rows(
      `UPDATE orders SET order_type = ?, customer_name = ?, customer_phone = ?,
             delivery_address = ?, table_no = ?, notes = ?
        WHERE id = ?`,
      [
        orderDetails.order_type,
        orderDetails.customer_name,
        orderDetails.customer_phone,
        orderDetails.delivery_address,
        orderDetails.table_no,
        orderDetails.notes,
        id,
      ],
      connection,
    );

    if (normalized.length) {
      const menuIds = normalized.map((item) => item.menu_item_id);
      const menuRows = await rows(
        `SELECT mi.id, mi.name, mi.price, mi.prep_time_minutes, mi.is_available
           FROM menu_items mi
           JOIN categories c ON c.id = mi.category_id AND c.is_active = 1
          WHERE mi.is_active = 1 AND mi.id IN (${menuIds.map(() => '?').join(',')})`,
        menuIds,
        connection,
      );
      const menuById = new Map(menuRows.map((menu) => [number(menu.id), menu]));
      if (menuById.size !== new Set(menuIds).size) throw new HttpError(400, 'An item on this order no longer exists.');
      for (const item of normalized) {
        if (!menuById.get(item.menu_item_id).is_available) {
          throw new HttpError(409, `${menuById.get(item.menu_item_id).name} is sold out.`);
        }
      }
      const minutes = Math.max(...normalized.map((item) => number(menuById.get(item.menu_item_id).prep_time_minutes)));
      const [roundCount] = await rows(
        'SELECT COALESCE(MAX(round_no), 0) AS total FROM order_rounds WHERE order_id = ?',
        [id],
        connection,
      );
      const roundNo = number(roundCount.total) + 1;
      const readyOffset = Math.max(0, minutes);
      const roundResult = await rows(
        `INSERT INTO order_rounds
           (order_id, round_no, status, estimated_minutes, estimated_ready_at, created_by)
         VALUES (?, ?, 'preparing', ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${readyOffset} MINUTE), ?)`,
        [id, roundNo, minutes, req.user.id],
        connection,
      );
      newRoundId = number(roundResult.insertId);
      for (const item of normalized) {
        const menu = menuById.get(item.menu_item_id);
        await rows(
          `INSERT INTO order_items
             (order_id, round_id, menu_item_id, item_name, unit_price, prep_time_minutes, quantity)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, newRoundId, item.menu_item_id, menu.name, menu.price, menu.prep_time_minutes, item.quantity],
          connection,
        );
      }
      await logActivity(id, req.user.id, 'round_saved', {
        round_no: roundNo,
        items: normalized.map((item) => ({ name: menuById.get(item.menu_item_id).name, qty: item.quantity })),
        estimated_minutes: minutes,
      }, connection);
    } else {
      await logActivity(id, req.user.id, 'draft_saved', null, connection);
    }

    const [totals] = await rows(
      `SELECT COALESCE(SUM(line_total), 0) AS subtotal
         FROM order_items WHERE order_id = ? AND voided_at IS NULL`,
      [id],
      connection,
    );
    const [taxConfig] = await rows(
      "SELECT value FROM app_config WHERE config_key = 'setting.tax_percent'",
      [],
      connection,
    );
    const subtotal = number(totals.subtotal);
    const discount = number(order.discount);
    const deliveryFee = number(order.delivery_fee);
    const taxPercent = Number(taxConfig?.value ?? 0);
    if (!Number.isFinite(taxPercent) || taxPercent < 0) throw new Error('Invalid setting.tax_percent in app_config.');
    const taxable = Math.max(0, subtotal - discount);
    const tax = Math.round(taxable * taxPercent) / 100;
    const total = Math.round((taxable + tax + deliveryFee) * 100) / 100;
    await rows(
      `UPDATE orders SET status = ?, subtotal = ?, tax = ?, total = ?,
             locked_by = NULL, locked_at = NULL, lock_expires_at = NULL
        WHERE id = ?`,
      [newRoundId ? 'in_progress' : order.status, subtotal, tax, total, id],
      connection,
    );
  });

  const order = await getOrder(id);
  emitOrderEvent('order:updated');
  emitOrderEvent('order:unlocked');
  const round = newRoundId ? order.rounds.find((entry) => entry.id === newRoundId) ?? null : null;
  res.json({ order, round });
}));

app.delete('/api/orders/:id/items/:itemId', requireAuth, route(async (req, res) => {
  const orderId = parseId(req.params.id, 'order id');
  const itemId = parseId(req.params.itemId, 'order item id');
  await transaction(async (connection) => {
    const [order] = await rows('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId], connection);
    if (!order) throw new HttpError(404, 'Order not found.');
    assertOrderAccess(order, req.user);
    assertOrderLock(order, req.user);
    if (!isOpenStatus(order.status)) throw new HttpError(409, 'This order is already closed.');
    const [item] = await rows(
      `SELECT oi.id, oi.round_id, oi.item_name, oi.quantity, oi.line_total,
              r.round_no, r.status AS round_status
         FROM order_items oi
         JOIN order_rounds r ON r.id = oi.round_id
        WHERE oi.id = ? AND oi.order_id = ? AND oi.voided_at IS NULL
        FOR UPDATE`,
      [itemId, orderId],
      connection,
    );
    if (!item) throw new HttpError(404, 'Saved order item not found.');
    if (item.round_status === 'served') {
      throw new HttpError(409, 'Items from a served round cannot be removed.');
    }
    await rows(
      'UPDATE order_items SET voided_at = UTC_TIMESTAMP() WHERE id = ? AND order_id = ?',
      [itemId, orderId],
      connection,
    );
    const [remainingRound] = await rows(
      `SELECT COALESCE(MAX(prep_time_minutes), 0) AS estimated_minutes
         FROM order_items WHERE round_id = ? AND voided_at IS NULL`,
      [item.round_id],
      connection,
    );
    const estimatedMinutes = number(remainingRound.estimated_minutes);
    await rows(
      `UPDATE order_rounds
          SET estimated_minutes = ?,
              estimated_ready_at = DATE_ADD(created_at, INTERVAL ? MINUTE)
        WHERE id = ?`,
      [estimatedMinutes, estimatedMinutes, item.round_id],
      connection,
    );
    const [subtotalResult] = await rows(
      `SELECT COALESCE(SUM(line_total), 0) AS subtotal
         FROM order_items WHERE order_id = ? AND voided_at IS NULL`,
      [orderId],
      connection,
    );
    const [taxConfig] = await rows(
      "SELECT value FROM app_config WHERE config_key = 'setting.tax_percent'",
      [],
      connection,
    );
    const subtotal = number(subtotalResult.subtotal);
    const discount = number(order.discount);
    const deliveryFee = number(order.delivery_fee);
    const taxPercent = Number(taxConfig?.value ?? 0);
    if (!Number.isFinite(taxPercent) || taxPercent < 0) {
      throw new Error('Invalid setting.tax_percent in app_config.');
    }
    const taxable = Math.max(0, subtotal - discount);
    const tax = Math.round(taxable * taxPercent) / 100;
    const total = Math.round((taxable + tax + deliveryFee) * 100) / 100;
    await rows(
      `UPDATE orders SET subtotal = ?, tax = ?, total = ?, updated_at = UTC_TIMESTAMP()
        WHERE id = ?`,
      [subtotal, tax, total, orderId],
      connection,
    );
    await logActivity(orderId, req.user.id, 'order_item_removed', {
      item_name: item.item_name,
      quantity: number(item.quantity),
      round_no: number(item.round_no),
      line_total: number(item.line_total),
    }, connection);
  });
  emitOrderEvent('order:updated');
  res.json(await getOrder(orderId));
}));

app.post('/api/orders/:id/checkout', requireAuth, route(async (req, res) => {
  const id = parseId(req.params.id);
  const payments = req.body?.payments;
  if (!Array.isArray(payments) || payments.length === 0) throw new HttpError(400, 'Add a payment.');
  const normalized = payments.map((payment) => ({
    method: payment?.method,
    amount: Number(payment?.amount),
    reference: typeof payment?.reference === 'string' ? payment.reference.trim().slice(0, 100) : null,
  }));
  if (normalized.some((payment) =>
    !['cash', 'card', 'online', 'other'].includes(payment.method) ||
    !Number.isFinite(payment.amount) ||
    payment.amount <= 0
  )) throw new HttpError(400, 'Enter valid payment methods and amounts.');

  await transaction(async (connection) => {
    const [order] = await rows('SELECT * FROM orders WHERE id = ? FOR UPDATE', [id], connection);
    if (!order) throw new HttpError(404, 'Order not found.');
    assertOrderAccess(order, req.user);
    assertOrderLock(order, req.user);
    const [itemCount] = await rows(
      'SELECT COUNT(*) AS total FROM order_items WHERE order_id = ? AND voided_at IS NULL',
      [id],
      connection,
    );
    if (number(itemCount.total) === 0) throw new HttpError(400, 'Save at least one item before checkout.');
    const paidCents = normalized.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0);
    const totalCents = Math.round(number(order.total) * 100);
    if (paidCents !== totalCents) throw new HttpError(400, 'The payment must equal the order total.');
    for (const payment of normalized) {
      await rows(
        'INSERT INTO payments (order_id, method, amount, reference, received_by) VALUES (?, ?, ?, ?, ?)',
        [id, payment.method, payment.amount, payment.reference, req.user.id],
        connection,
      );
    }
    await rows(
      `UPDATE orders SET status = 'checked_out', checked_out_by = ?, checked_out_at = UTC_TIMESTAMP(),
             locked_by = NULL, locked_at = NULL, lock_expires_at = NULL
        WHERE id = ?`,
      [req.user.id, id],
      connection,
    );
    await logActivity(id, req.user.id, 'checkout', {
      method: normalized.map((payment) => payment.method).join(', '),
      amount: number(order.total),
    }, connection);
  });
  emitOrderEvent('order:updated');
  emitOrderEvent('order:unlocked');
  res.json(await getOrder(id));
}));

app.post('/api/orders/:id/cancel', requireAuth, route(async (req, res) => {
  const id = parseId(req.params.id);
  await transaction(async (connection) => {
    const [order] = await rows('SELECT * FROM orders WHERE id = ? FOR UPDATE', [id], connection);
    if (!order) throw new HttpError(404, 'Order not found.');
    assertOrderAccess(order, req.user);
    if (!isOpenStatus(order.status)) throw new HttpError(409, 'This order is already closed.');
    if (hasActiveLock(order) && number(order.locked_by) !== req.user.id) {
      throw new HttpError(409, 'This order is open on another screen.');
    }
    await rows(
      `UPDATE orders SET status = 'cancelled', cancelled_by = ?, cancelled_at = UTC_TIMESTAMP(),
             locked_by = NULL, locked_at = NULL, lock_expires_at = NULL
        WHERE id = ?`,
      [req.user.id, id],
      connection,
    );
    await logActivity(id, req.user.id, 'order_cancelled', null, connection);
  });
  emitOrderEvent('order:updated');
  emitOrderEvent('order:unlocked');
  res.json(await getOrder(id));
}));

app.post('/api/orders/:id/serve', requireAuth, requireAdmin, route(async (req, res) => {
  const id = parseId(req.params.id);
  await transaction(async (connection) => {
    const [order] = await rows('SELECT id FROM orders WHERE id = ? FOR UPDATE', [id], connection);
    if (!order) throw new HttpError(404, 'Order not found.');
    const activeRounds = await rows(
      `SELECT id, round_no, estimated_ready_at FROM order_rounds
        WHERE order_id = ? AND status = 'preparing'
          AND EXISTS (
            SELECT 1 FROM order_items
             WHERE order_items.round_id = order_rounds.id
               AND order_items.voided_at IS NULL
          )`,
      [id],
      connection,
    );
    if (!activeRounds.length) throw new HttpError(409, 'This order has no rounds being prepared.');
    const now = Date.now();
    const overdue = activeRounds
      .map((round) => ({
        round_no: number(round.round_no),
        overdue_minutes: Math.floor((now - new Date(dateIso(round.estimated_ready_at)).getTime()) / 60_000),
      }))
      .filter((round) => round.overdue_minutes > 5);
    await rows(
      `UPDATE order_rounds SET status = 'served', ready_at = UTC_TIMESTAMP()
        WHERE order_id = ? AND status = 'preparing'
          AND EXISTS (
            SELECT 1 FROM order_items
             WHERE order_items.round_id = order_rounds.id
               AND order_items.voided_at IS NULL
          )`,
      [id],
      connection,
    );
    await rows('UPDATE orders SET updated_at = UTC_TIMESTAMP() WHERE id = ?', [id], connection);
    await logActivity(id, req.user.id, 'round_served', {
      round_nos: activeRounds.map((round) => number(round.round_no)),
    }, connection);
    if (overdue.length) await logActivity(id, req.user.id, 'kitchen_overdue', { rounds: overdue }, connection);
  });
  emitOrderEvent('order:updated');
  res.json(await getOrder(id));
}));

app.post('/api/orders/:id/force-unlock', requireAuth, requireAdmin, route(async (req, res) => {
  const id = parseId(req.params.id);
  await transaction(async (connection) => {
    const [order] = await rows(
      `SELECT o.id, u.name AS locked_by_name
         FROM orders o LEFT JOIN users u ON u.id = o.locked_by
        WHERE o.id = ? FOR UPDATE`,
      [id],
      connection,
    );
    if (!order) throw new HttpError(404, 'Order not found.');
    await rows(
      'UPDATE orders SET locked_by = NULL, locked_at = NULL, lock_expires_at = NULL WHERE id = ?',
      [id],
      connection,
    );
    await logActivity(id, req.user.id, 'force_unlock', { previous_holder: order.locked_by_name }, connection);
  });
  emitOrderEvent('order:unlocked');
  res.status(204).end();
}));

app.get('/api/orders/:id/activity', requireAuth, requireAdmin, route(async (req, res) => {
  const id = parseId(req.params.id);
  const result = await rows(
    `SELECT l.id, l.order_id, l.user_id, u.name AS user_name, l.action, l.details, l.created_at
       FROM activity_log l JOIN users u ON u.id = l.user_id
      WHERE l.order_id = ? ORDER BY l.created_at DESC`,
    [id],
  );
  res.json(result.map((entry) => ({
    id: number(entry.id),
    order_id: number(entry.order_id),
    user_id: number(entry.user_id),
    user_name: entry.user_name,
    action: entry.action,
    details: entry.details ? (typeof entry.details === 'string' ? JSON.parse(entry.details) : entry.details) : null,
    created_at: dateIso(entry.created_at),
  })));
}));

// Admin dashboard summaries
app.get('/api/reports/dashboard', requireAuth, requireAdmin, route(async (req, res) => {
  const range = req.query.range ?? 'today';
  if (!['today', '7d', '30d'].includes(range)) throw new HttpError(400, 'Invalid dashboard range.');
  const now = Date.now();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const from = range === 'today' ? today.getTime() : now - (range === '7d' ? 7 : 30) * 86_400_000;
  const previousFrom = from - (now - from);
  const sqlDate = (milliseconds) => new Date(milliseconds).toISOString().slice(0, 19).replace('T', ' ');
  const paidRows = await rows(
    `SELECT o.id, o.order_type, o.total, o.checked_out_at, u.name AS staff_name
       FROM orders o JOIN users u ON u.id = o.created_by
      WHERE o.status = 'checked_out' AND o.checked_out_at >= ? AND o.checked_out_at <= ?`,
    [sqlDate(previousFrom), sqlDate(now)],
  );
  const currentRows = paidRows.filter((order) => new Date(dateIso(order.checked_out_at)).getTime() >= from);
  const previousRows = paidRows.filter((order) => new Date(dateIso(order.checked_out_at)).getTime() < from);
  const totalsOf = (list) => {
    const sales = list.reduce((sum, order) => sum + number(order.total), 0);
    return { orders: list.length, sales, avg_order_value: list.length ? sales / list.length : 0 };
  };
  const byStaff = new Map();
  const byType = new Map();
  const byHour = new Map();
  for (const order of currentRows) {
    const staff = byStaff.get(order.staff_name) ?? { name: order.staff_name, orders: 0, sales: 0 };
    staff.orders += 1;
    staff.sales += number(order.total);
    byStaff.set(order.staff_name, staff);
    const type = byType.get(order.order_type) ?? { order_type: order.order_type, orders: 0, sales: 0 };
    type.orders += 1;
    type.sales += number(order.total);
    byType.set(order.order_type, type);
    const hour = new Date(dateIso(order.checked_out_at)).getUTCHours();
    const item = byHour.get(hour) ?? { hour, orders: 0, sales: 0 };
    item.orders += 1;
    item.sales += number(order.total);
    byHour.set(hour, item);
  }
  const currentIds = currentRows.map((order) => order.id);
  const paymentMethods = currentIds.length
    ? await rows(
      `SELECT method, SUM(amount) AS total FROM payments
        WHERE order_id IN (${currentIds.map(() => '?').join(',')}) GROUP BY method ORDER BY method`,
      currentIds,
    )
    : [];
  const topItems = currentIds.length
    ? await rows(
      `SELECT oi.item_name, SUM(oi.quantity) AS qty, SUM(oi.line_total) AS revenue
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE oi.order_id IN (${currentIds.map(() => '?').join(',')}) AND oi.voided_at IS NULL
        GROUP BY oi.item_name ORDER BY qty DESC LIMIT 8`,
      currentIds,
    )
    : [];
  const [openResult] = await rows(
    "SELECT COUNT(*) AS total FROM orders WHERE status IN ('draft', 'in_progress')",
  );
  const [cancelledResult] = await rows(
    `SELECT COUNT(*) AS total FROM orders
      WHERE status = 'cancelled' AND cancelled_at >= ? AND cancelled_at <= ?`,
    [sqlDate(from), sqlDate(now)],
  );
  res.json({
    totals: totalsOf(currentRows),
    previous: totalsOf(previousRows),
    open_orders: number(openResult.total),
    cancelled_orders: number(cancelledResult.total),
    by_staff: [...byStaff.values()].sort((a, b) => b.sales - a.sales),
    top_items: topItems.map((item) => ({
      item_name: item.item_name,
      qty: number(item.qty),
      revenue: number(item.revenue),
    })),
    payment_methods: paymentMethods.map((payment) => ({
      method: payment.method,
      total: number(payment.total),
    })),
    by_type: [...byType.values()],
    by_hour: [...byHour.values()].sort((a, b) => a.hour - b.hour),
  });
}));

io.use(async (socket, next) => {
  try {
    const cookieHeader = socket.request.headers.cookie ?? '';
    const tokenPart = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith('pos_session='));
    const token = tokenPart ? tokenPart.slice('pos_session='.length) : null;
    const user = await sessionForToken(token);
    if (!user) return next(new Error('Unauthorized'));
    socket.data.user = user;
    next();
  } catch (error) {
    next(error);
  }
});

io.on('connection', (socket) => {
  socket.join(`user:${socket.data.user.id}`);
});

app.use((_req, _res, next) => next(new HttpError(404, 'Not found.')));
app.use((error, req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'Image exceeds the upload size limit.' });
  }
  const status = Number.isInteger(error.status)
    ? error.status
    : error.code === 'ER_DUP_ENTRY' ? 409 : 500;
  const message = error.code === 'ER_DUP_ENTRY' ? 'A record with that value already exists.' : error.message;
  if (status >= 500) console.error('API error:', error.message);
  res.status(status).json({
    message: status >= 500 ? 'The server could not complete the request.' : message,
    ...(error.code ? { code: error.code } : {}),
  });
});

async function start() {
  await rows('SELECT 1');
  await rows('SELECT config_key FROM app_config LIMIT 1');
  await rows('SELECT id FROM user_sessions LIMIT 0');
  await rows('SELECT id FROM inventory_purchases LIMIT 0');
  await rows('SELECT menu_item_id FROM production_plan LIMIT 0');
  server.listen(API_PORT, () => {
    console.log(`HAWT POS API listening on http://localhost:${API_PORT} (MySQL ${process.env.DB_NAME})`);
  });
}

start().catch(async (error) => {
  console.error('Could not start HAWT POS API:', error.message);
  await pool.end();
  process.exitCode = 1;
});
