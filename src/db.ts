import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

export async function initializePostgres(database = pool): Promise<void> {
  await database.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      must_reset_password BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS matches (
      id BIGSERIAL PRIMARY KEY,
      room_code TEXT NOT NULL,
      player_a_id BIGINT NOT NULL REFERENCES users(id),
      player_b_id BIGINT NOT NULL REFERENCES users(id),
      winner_id BIGINT REFERENCES users(id),
      played_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE matches ALTER COLUMN player_a_id DROP NOT NULL;
    ALTER TABLE matches ALTER COLUMN player_b_id DROP NOT NULL;
    CREATE TABLE IF NOT EXISTS match_players (
      match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      player_id BIGINT NOT NULL REFERENCES users(id),
      seat INTEGER NOT NULL,
      is_winner BOOLEAN NOT NULL DEFAULT FALSE,
      PRIMARY KEY (match_id, player_id),
      UNIQUE (match_id, seat)
    );
    CREATE INDEX IF NOT EXISTS match_players_player_id ON match_players(player_id);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS must_reset_password BOOLEAN NOT NULL DEFAULT FALSE;
  `);
}
