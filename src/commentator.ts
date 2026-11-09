type AnthropicResponse = {
  content?: Array<{ type: string; text?: string }>;
};

// Shared commentary: each game builds its own prompt string; this only calls the API.
export interface Commentator {
  describe(prompt: string): Promise<string | null>;
}

export const DEFAULT_COMMENTARY_CALLS_PER_MINUTE = 60;
export const DEFAULT_COMMENTARY_MAX_CALLS_PER_GAME = 20;
export const DEFAULT_COMMENTARY_MIN_INTERVAL_MS = 5000;

export interface CommentaryLimiterOptions {
  callsPerMinute?: number;
  maxCallsPerGame?: number;
  minIntervalMs?: number;
  now?: () => number;
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  if (value !== undefined && Number.isInteger(value) && value >= 0) return value;
  return fallback;
}

export function commentaryCallsPerMinuteFromEnv(
  env: NodeJS.ProcessEnv = process.env,
) {
  const configured = Number(env.COMMENTARY_CALLS_PER_MINUTE);
  return nonNegativeInteger(configured, DEFAULT_COMMENTARY_CALLS_PER_MINUTE);
}

interface RoomCommentaryState {
  calls: number;
  lastCallAt: number | null;
}

export class CommentaryLimiter {
  private readonly callTimes: number[] = [];
  private readonly commentator: Commentator;
  private readonly callsPerMinute: number;
  private readonly maxCallsPerGame: number;
  private readonly minIntervalMs: number;
  private readonly now: () => number;

  constructor(
    commentator: Commentator,
    options: CommentaryLimiterOptions = {},
  ) {
    this.commentator = commentator;
    this.callsPerMinute = nonNegativeInteger(
      options.callsPerMinute,
      commentaryCallsPerMinuteFromEnv(),
    );
    this.maxCallsPerGame = nonNegativeInteger(
      options.maxCallsPerGame,
      DEFAULT_COMMENTARY_MAX_CALLS_PER_GAME,
    );
    this.minIntervalMs = nonNegativeInteger(
      options.minIntervalMs,
      DEFAULT_COMMENTARY_MIN_INTERVAL_MS,
    );
    this.now = options.now ?? Date.now;
  }

  forRoom(roomCode: string): Commentator {
    const room: RoomCommentaryState = { calls: 0, lastCallAt: null };
    return {
      describe: (prompt) => this.describe(roomCode, room, prompt),
    };
  }

  private describe(roomCode: string, room: RoomCommentaryState, prompt: string) {
    const now = this.now();

    while (this.callTimes[0] !== undefined && this.callTimes[0] <= now - 60_000) {
      this.callTimes.shift();
    }

    if (room.calls >= this.maxCallsPerGame) {
      console.info(`Commentary skipped for room ${roomCode}: game limit reached.`);
      return Promise.resolve(null);
    }
    if (room.lastCallAt !== null && now - room.lastCallAt < this.minIntervalMs) {
      console.info(`Commentary skipped for room ${roomCode}: room rate limit reached.`);
      return Promise.resolve(null);
    }
    if (this.callTimes.length >= this.callsPerMinute) {
      console.info(`Commentary skipped for room ${roomCode}: server rate limit reached.`);
      return Promise.resolve(null);
    }

    room.calls += 1;
    room.lastCallAt = now;
    this.callTimes.push(now);
    return this.commentator.describe(prompt);
  }
}

export interface CommentatorOptions {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class ClaudeCommentator implements Commentator {
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private warnedAboutKey = false;

  constructor(options: CommentatorOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.model = options.model ?? process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 8000;
  }

  async describe(prompt: string): Promise<string | null> {
    if (!this.apiKey) {
      if (!this.warnedAboutKey) {
        this.warnedAboutKey = true;
        console.warn("ANTHROPIC_API_KEY is not set; skipping round commentary.");
      }
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 80,
          system: "Keep commentary energetic, concise, and suitable for all ages.",
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Claude API returned ${response.status}: ${detail.slice(0, 300)}`);
      }

      const data = (await response.json()) as AnthropicResponse;
      const text = data.content?.find((item) => item.type === "text")?.text?.trim();
      if (!text) throw new Error("Claude API returned no text content");
      return text.replace(/\s+/g, " ");
    } catch (error) {
      console.error("Round commentary failed:", error);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
