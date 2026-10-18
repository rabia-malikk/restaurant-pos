import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';

if (!process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME) {
  throw new Error('Set DB_USER, DB_PASSWORD, and DB_NAME in the root .env file.');
}
if (process.env.DB_NAME !== 'hawt_pos') throw new Error('DB_NAME must be hawt_pos.');
if (!stdin.isTTY) throw new Error('Run this command in an interactive terminal to enter the new password safely.');

function hiddenInput(prompt) {
  return new Promise((resolve, reject) => {
    let value = '';
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          reject(new Error('Password reset cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
        } else if (character >= ' ') {
          value += character;
        }
      }
    };
    stdin.on('data', onData);
  });
}

const prompts = createInterface({ input: stdin, output: stdout });
const username = (await prompts.question('Admin username to reset: ')).trim().toLowerCase();
prompts.close();
const password = await hiddenInput('New password (minimum 8 characters): ');
const confirmation = await hiddenInput('Confirm new password: ');

if (!username || username.length > 50) throw new Error('Enter a valid admin username.');
if (password.length < 8 || password.length > 200) {
  throw new Error('Password must contain 8 to 200 characters.');
}
if (password !== confirmation) throw new Error('Passwords do not match.');

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
  const [users] = await connection.execute(
    'SELECT id FROM users WHERE username = ? AND role = ? AND is_active = 1 FOR UPDATE',
    [username, 'admin'],
  );
  if (!users.length) throw new Error('No active admin account with that username was found.');

  const userId = users[0].id;
  const passwordHash = await bcrypt.hash(password, 12);
  await connection.execute(
    `UPDATE users
        SET password_hash = ?, failed_login_count = 0, locked_until = NULL
      WHERE id = ?`,
    [passwordHash, userId],
  );
  await connection.execute(
    'UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL',
    [userId],
  );
  await connection.commit();
  console.log(`Password reset for admin "${username}". Sign in again with the new password.`);
} catch (error) {
  await connection.rollback();
  console.error('Could not reset admin password:', error.message);
  process.exitCode = 1;
} finally {
  connection.release();
  await pool.end();
}
