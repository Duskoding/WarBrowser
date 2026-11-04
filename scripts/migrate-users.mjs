import { DatabaseSync } from "node:sqlite";
import pg from "pg";

const sqlitePath = process.env.SQLITE_PATH ?? "./data/warbrowser.sqlite";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const sqlite = new DatabaseSync(sqlitePath);
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0,
      must_reset_password BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS matches (
      id BIGSERIAL PRIMARY KEY, room_code TEXT NOT NULL,
      player_a_id BIGINT NOT NULL REFERENCES users(id), player_b_id BIGINT NOT NULL REFERENCES users(id),
      winner_id BIGINT REFERENCES users(id), played_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  const users = sqlite.prepare("SELECT id, username, password_hash, wins, losses, created_at FROM users").all();
  for (const user of users) {
    await pool.query(
      `INSERT INTO users (id, username, password_hash, wins, losses, must_reset_password, created_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6)
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash,
         wins = EXCLUDED.wins, losses = EXCLUDED.losses, must_reset_password = TRUE`,
      [user.id, user.username, user.password_hash, user.wins, user.losses, user.created_at]
    );
    console.log(`Migrated ${user.username}; password reset required on first login.`);
  }
  await pool.query("SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1))");
  await pool.query("DELETE FROM sessions");
  console.log(`Migration complete: ${users.length} user(s). Existing match details were not present in SQLite.`);
} finally {
  sqlite.close();
  await pool.end();
}
