import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';

if (!process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME) {
  throw new Error('Set DB_USER, DB_PASSWORD, and DB_NAME in the root .env file.');
}
if (process.env.DB_NAME !== 'hawt_pos') throw new Error('DB_NAME must be hawt_pos.');

function hiddenInput(prompt) {
  if (!stdin.isTTY) throw new Error('Run this command in an interactive terminal to enter a password safely.');
  return new Promise((resolve, reject) => {
    let value = '';
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (character) => {
      if (character === '\u0003') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off('data', onData);
        reject(new Error('Cancelled.'));
      } else if (character === '\r' || character === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off('data', onData);
        stdout.write('\n');
        resolve(value);
      } else if (character === '\u007f' || character === '\b') {
        value = value.slice(0, -1);
      } else if (character >= ' ') {
        value += character;
      }
    };
    stdin.on('data', onData);
  });
}

const prompts = createInterface({ input: stdin, output: stdout });
const username = (await prompts.question('Admin username: ')).trim().toLowerCase();
const name = (await prompts.question('Admin display name: ')).trim();
prompts.close();
const password = await hiddenInput('Admin password (minimum 8 characters): ');

if (!/^[a-z0-9._-]{1,50}$/.test(username)) throw new Error('Username may contain lowercase letters, digits, dots, underscores, and hyphens.');
if (!name || name.length > 100) throw new Error('Display name is required and must be at most 100 characters.');
if (password.length < 8 || password.length > 200) throw new Error('Password must contain 8 to 200 characters.');

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  timezone: 'Z',
});

const connection = await pool.getConnection();
try {
  await connection.beginTransaction();
  const [limitRows] = await connection.execute(
    "SELECT value FROM app_config WHERE config_key = 'limit.max_admin_users' FOR UPDATE",
  );
  if (!limitRows.length) throw new Error('The admin user limit is missing from app_config.');
  const maximum = Number(limitRows[0].value);
  const [countRows] = await connection.execute(
    "SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND is_active = 1",
  );
  if (maximum !== -1 && Number(countRows[0].total) >= maximum) {
    throw new Error('The active admin user limit has been reached.');
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await connection.execute(
    'INSERT INTO users (name, username, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)',
    [name, username, passwordHash, 'admin'],
  );
  await connection.commit();
  console.log(`Created admin account "${username}".`);
} catch (error) {
  await connection.rollback();
  if (error.code === 'ER_DUP_ENTRY') {
    console.error('That username already exists.');
  } else {
    console.error('Could not create admin:', error.message);
  }
  process.exitCode = 1;
} finally {
  connection.release();
  await pool.end();
}
