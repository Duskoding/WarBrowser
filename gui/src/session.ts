export type Me = {
  username: string;
  wins: number;
  losses: number;
};

type ApiResult = {
  ok: boolean;
  status: number;
  body: { error?: string; username?: string; wins?: number; losses?: number; ok?: boolean };
};

async function api(path: string, init?: RequestInit): Promise<ApiResult> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init
  });
  let body: ApiResult["body"] = {};
  try {
    body = (await response.json()) as ApiResult["body"];
  } catch {
    body = {};
  }
  return { ok: response.ok, status: response.status, body };
}

export async function fetchMe(): Promise<Me | null> {
  const result = await api("/api/me");
  if (!result.ok || typeof result.body.username !== "string") return null;
  return {
    username: result.body.username,
    wins: Number(result.body.wins ?? 0),
    losses: Number(result.body.losses ?? 0)
  };
}

export async function login(username: string, password: string): Promise<ApiResult> {
  return api("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export async function register(username: string, password: string): Promise<ApiResult> {
  return api("/api/register", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export async function logout(): Promise<void> {
  await api("/api/logout", { method: "POST" });
}
