// Preview-only stand-in for src/session.ts: no HTTP server, so keep a fake user in memory.
import type { Me } from "../src/session";
import type { GameSummary } from "../src/types";
import { gameSummaries } from "../../src/games/index.ts";

type ApiResult = {
  ok: boolean;
  status: number;
  body: { error?: string; username?: string; wins?: number; losses?: number; mustResetPassword?: boolean; ok?: boolean };
};

// page.html sets each window's name ("Player 1", "Player 2") before the GUI loads.
const simName = (window as { __simName?: string }).__simName ?? "Player";
let current: Me | null = { username: simName, wins: 0, losses: 0, mustResetPassword: false };

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
  current = {
    username: username.trim(),
    wins: current?.wins ?? 0,
    losses: current?.losses ?? 0,
    mustResetPassword: false
  };
  return asResult(current);
}

export async function register(username: string, password: string): Promise<ApiResult> {
  return login(username, password);
}

export async function logout(): Promise<void> {
  current = null;
}

export async function fetchGames(): Promise<GameSummary[]> {
  return gameSummaries();
}

export async function resetPassword(password: string): Promise<ApiResult> {
  if (password.length < 8) {
    return { ok: false, status: 400, body: { error: "Use a password of at least 8 characters." } };
  }
  if (current) current = { ...current, mustResetPassword: false };
  return { ok: true, status: 200, body: { ok: true } };
}
