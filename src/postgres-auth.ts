import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Pool, PoolClient } from "pg";

const scryptAsync = promisify(scrypt);
const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;
const usernamePattern = /^[A-Za-z0-9_]{3,20}$/;

export type PostgresUser = {
  id: string;
  username: string;
  wins: number;
  losses: number;
  mustResetPassword: boolean;
};

type Failure = { error: string; status: number };
type Db = Pool;

function publicUser(row: Record<string, unknown>): PostgresUser {
  return {
    id: String(row.id),
    username: String(row.username),
    wins: Number(row.wins),
    losses: Number(row.losses),
    mustResetPassword: Boolean(row.must_reset_password)
  };
}

function validate(username: unknown, password: unknown): string | Failure {
  if (typeof username !== "string" || !usernamePattern.test(username.trim())) {
    return { error: "Choose a username of 3–20 letters, numbers, or underscores.", status: 400 };
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 72) {
    return { error: "Password must be 8–72 characters.", status: 400 };
  }
  return username.trim();
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 32);
  return `${salt.toString("hex")}:${Buffer.from(hash as Uint8Array).toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = Buffer.from(await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length) as Uint8Array);
  return actual.length === expected.length && timingSafeEqual(expected, actual);
}

export async function registerPostgres(db: Db, username: unknown, password: unknown) {
  const valid = validate(username, password);
  if (typeof valid !== "string") return valid;
  try {
    const result = await db.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, wins, losses, must_reset_password",
      [valid, await hashPassword(password as string)]
    );
    return publicUser(result.rows[0]);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "23505") {
      return { error: "That username is taken.", status: 409 };
    }
    throw error;
  }
}

export async function loginPostgres(db: Db, username: unknown, password: unknown) {
  const valid = validate(username, password);
  if (typeof valid !== "string") return { error: "Username or password is incorrect.", status: 401 };
  const result = await db.query(
    "SELECT id, username, password_hash, wins, losses, must_reset_password FROM users WHERE username = $1",
    [valid]
  );
  const row = result.rows[0];
  if (!row || !(await verifyPassword(password as string, row.password_hash))) {
    return { error: "Username or password is incorrect.", status: 401 };
  }
  return publicUser(row);
}

export async function createPostgresSession(db: Db, userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.query("INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)", [
    token, userId, Date.now() + sessionTtlMs
  ]);
  return token;
}

export async function userFromPostgresSession(db: Db, token?: string): Promise<PostgresUser | null> {
  if (!token) return null;
  const result = await db.query(
    `SELECT users.id, users.username, users.wins, users.losses, users.must_reset_password, sessions.expires_at
     FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = $1`,
    [token]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (Number(row.expires_at) <= Date.now()) {
    await db.query("DELETE FROM sessions WHERE token = $1", [token]);
    return null;
  }
  return publicUser(row);
}

export async function deletePostgresSession(db: Db, token?: string): Promise<void> {
  if (token) await db.query("DELETE FROM sessions WHERE token = $1", [token]);
}

export async function findPostgresUser(db: Db, id: string): Promise<PostgresUser | null> {
  const result = await db.query(
    "SELECT id, username, wins, losses, must_reset_password FROM users WHERE id = $1", [id]
  );
  return result.rows[0] ? publicUser(result.rows[0]) : null;
}

export async function resetPostgresPassword(db: Db, userId: string, password: unknown): Promise<Failure | null> {
  if (typeof password !== "string" || password.length < 8 || password.length > 72) {
    return { error: "Password must be 8–72 characters.", status: 400 };
  }
  await db.query("UPDATE users SET password_hash = $1, must_reset_password = FALSE WHERE id = $2", [
    await hashPassword(password), userId
  ]);
  return null;
}

export async function recordPostgresMatch(
  db: Db, roomCode: string, playerAId: string, playerBId: string, winnerId: string | null
): Promise<void> {
  const client: PoolClient = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO matches (room_code, player_a_id, player_b_id, winner_id) VALUES ($1, $2, $3, $4)",
      [roomCode, playerAId, playerBId, winnerId]
    );
    if (winnerId) {
      const loserId = winnerId === playerAId ? playerBId : playerAId;
      await client.query("UPDATE users SET wins = wins + 1 WHERE id = $1", [winnerId]);
      await client.query("UPDATE users SET losses = losses + 1 WHERE id = $1", [loserId]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// For a match with more than two players: the `matches` table only has room
// for two player columns, so there's no per-match audit row here (see #71 for
// the schema change that would add one); this still updates every player's
// wins/losses correctly.
export async function recordPostgresWins(db: Db, winnerId: string, loserIds: string[]): Promise<void> {
  const client: PoolClient = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE users SET wins = wins + 1 WHERE id = $1", [winnerId]);
    for (const loserId of loserIds) {
      await client.query("UPDATE users SET losses = losses + 1 WHERE id = $1", [loserId]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export const POSTGRES_SESSION_MAX_AGE_SECONDS = Math.floor(sessionTtlMs / 1000);
