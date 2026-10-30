// Preview-only stand-in for src/session.ts: no HTTP server, so keep a fake user in memory.
import type { Me } from "../src/session";

type ApiResult = {
  ok: boolean;
  status: number;
  body: { error?: string; username?: string; wins?: number; losses?: number; ok?: boolean };
};

let current: Me | null = { username: "Player", wins: 0, losses: 0 };

function asResult(user: Me): ApiResult {
  return { ok: true, status: 200, body: user };
}

export async function fetchMe(): Promise<Me | null> {
  return current;
}

export async function login(username: string, password: string): Promise<ApiResult> {
  if (username.trim().length < 3 || password.length < 8) {
    return {
      ok: false,
      status: 400,
      body: { error: "Enter a username and a password of at least 8 characters." }
    };
  }
  current = { username: username.trim(), wins: current?.wins ?? 0, losses: current?.losses ?? 0 };
  return asResult(current);
}

export async function register(username: string, password: string): Promise<ApiResult> {
  return login(username, password);
}

export async function logout(): Promise<void> {
  current = null;
}
