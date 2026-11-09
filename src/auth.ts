import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const keyLength = 32;
const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;

export type PublicUser = {
  id: number;
  username: string;
  wins: number;
  losses: number;
  games: Record<string, { wins: number; losses: number }>;
};

export type AuthFailure = {
  error: string;
  status: number;
};

const usernamePattern = /^[A-Za-z0-9_]{3,20}$/;

export function openAuthDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS game_stats (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game_id TEXT NOT NULL,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, game_id)
    );
  `);
  return db;
}

export function validateUsername(username: unknown): string | AuthFailure {
  if (typeof username !== "string") {
    return { error: "Choose a username of 3–20 letters, numbers, or underscores.", status: 400 };
  }
  const trimmed = username.trim();
  if (!usernamePattern.test(trimmed)) {
    return { error: "Choose a username of 3–20 letters, numbers, or underscores.", status: 400 };
  }
  return trimmed;
}

export function validatePassword(password: unknown): string | AuthFailure {
  if (typeof password !== "string" || password.length < 8 || password.length > 72) {
    return { error: "Password must be 8–72 characters.", status: 400 };
  }
  return password;
}

function isFailure(value: string | AuthFailure): value is AuthFailure {
  return typeof value !== "string";
}

function gameStats(db: DatabaseSync, userId: number): Record<string, { wins: number; losses: number }> {
  const rows = db
    .prepare("SELECT game_id, wins, losses FROM game_stats WHERE user_id = ?")
    .all(userId) as { game_id: string; wins: number; losses: number }[];
  return Object.fromEntries(rows.map((row) => [
    row.game_id,
    { wins: Number(row.wins), losses: Number(row.losses) }
  ]));
}

function toPublicUser(
  db: DatabaseSync,
  row: { id: number; username: string; wins: number; losses: number }
): PublicUser {
  return {
    id: Number(row.id),
    username: String(row.username),
    wins: Number(row.wins),
    losses: Number(row.losses),
    games: gameStats(db, Number(row.id))
  };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, keyLength);
  return `${salt.toString("hex")}:${Buffer.from(hash as Uint8Array).toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  if (expected.length === 0) return false;
  const actual = Buffer.from((await scryptAsync(password, salt, expected.length)) as Uint8Array);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(expected, actual);
}

export async function registerUser(
  db: DatabaseSync,
  username: unknown,
  password: unknown
): Promise<PublicUser | AuthFailure> {
  const validUsername = validateUsername(username);
  if (isFailure(validUsername)) return validUsername;
  const validPassword = validatePassword(password);
  if (isFailure(validPassword)) return validPassword;

  const passwordHash = await hashPassword(validPassword);
  try {
    const result = db
      .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
      .run(validUsername, passwordHash);
    return {
      id: Number(result.lastInsertRowid),
      username: validUsername,
      wins: 0,
      losses: 0,
      games: {}
    };
  } catch (error) {
    if (error instanceof Error && /UNIQUE/i.test(error.message)) {
      return { error: "That username is taken.", status: 409 };
    }
    throw error;
  }
}

export async function authenticateUser(
  db: DatabaseSync,
  username: unknown,
  password: unknown
): Promise<PublicUser | AuthFailure> {
  const validUsername = validateUsername(username);
  if (isFailure(validUsername)) {
    return { error: "Username or password is incorrect.", status: 401 };
  }
  const validPassword = validatePassword(password);
  if (isFailure(validPassword)) {
    return { error: "Username or password is incorrect.", status: 401 };
  }

  const row = db
    .prepare("SELECT id, username, password_hash, wins, losses FROM users WHERE username = ?")
    .get(validUsername) as
    | { id: number; username: string; password_hash: string; wins: number; losses: number }
    | undefined;

  if (!row || !(await verifyPassword(validPassword, row.password_hash))) {
    return { error: "Username or password is incorrect.", status: 401 };
  }
  return toPublicUser(db, row);
}

export function createSession(db: DatabaseSync, userId: number): string {
  const token = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
    token,
    userId,
    Date.now() + sessionTtlMs
  );
  return token;
}

export function userFromSession(db: DatabaseSync, token: string | undefined): PublicUser | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT users.id, users.username, users.wins, users.losses, sessions.expires_at
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token = ?`
    )
    .get(token) as
    | { id: number; username: string; wins: number; losses: number; expires_at: number }
    | undefined;

  if (!row) return null;
  if (Number(row.expires_at) <= Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }
  return toPublicUser(db, row);
}

export function deleteSession(db: DatabaseSync, token: string | undefined): void {
  if (!token) return;
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function findUserById(db: DatabaseSync, id: number): PublicUser | null {
  const row = db
    .prepare("SELECT id, username, wins, losses FROM users WHERE id = ?")
    .get(id) as { id: number; username: string; wins: number; losses: number } | undefined;
  return row ? toPublicUser(db, row) : null;
}

export function recordMatch(db: DatabaseSync, winnerId: number, loserId: number): void {
  recordWins(db, winnerId, [loserId]);
}

// winnerId gets exactly one win regardless of how many losers there are.
export function recordWins(
  db: DatabaseSync,
  winnerId: number,
  loserIds: number[],
  gameId?: string
): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE users SET wins = wins + 1 WHERE id = ?").run(winnerId);
    if (gameId) {
      db.prepare(`
        INSERT INTO game_stats (user_id, game_id, wins)
        VALUES (?, ?, 1)
        ON CONFLICT (user_id, game_id) DO UPDATE SET wins = wins + 1
      `).run(winnerId, gameId);
    }
    for (const loserId of loserIds) {
      if (loserId === winnerId) continue;
      db.prepare("UPDATE users SET losses = losses + 1 WHERE id = ?").run(loserId);
      if (gameId) {
        db.prepare(`
          INSERT INTO game_stats (user_id, game_id, losses)
          VALUES (?, ?, 1)
          ON CONFLICT (user_id, game_id) DO UPDATE SET losses = losses + 1
        `).run(loserId, gameId);
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE_SECONDS = Math.floor(sessionTtlMs / 1000);
