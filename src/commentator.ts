type AnthropicResponse = {
  content?: Array<{ type: string; text?: string }>;
};

// Shared commentary: each game builds its own prompt string; this only calls the API.
export interface Commentator {
  describe(prompt: string): Promise<string | null>;
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
