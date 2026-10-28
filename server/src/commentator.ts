import type { Card, RoundSummary } from "./protocol.js";

type AnthropicResponse = {
  content?: Array<{ type: string; text?: string }>;
};

export type CommentatorOptions = {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const cardName = (card: Card) => {
  const ranks: Record<number, string> = { 11: "Jack", 12: "Queen", 13: "King", 14: "Ace" };
  return `${ranks[card.rank] ?? card.rank} of ${card.suit}`;
};

export class ClaudeCommentator {
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: CommentatorOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.model = options.model ?? process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 8000;
  }

  async describe(summary: RoundSummary): Promise<string | null> {
    if (!this.apiKey) {
      console.warn("ANTHROPIC_API_KEY is not set; skipping round commentary.");
      return null;
    }

    const prompt = [
      "You are a lively sports commentator for a friendly browser card game.",
      "Write exactly one short sentence (maximum 24 words) describing this completed War round.",
      "Do not mention being an AI, the prompt, or hidden information.",
      `Cards played: ${summary.playerCards.map(cardName).join(", ")}.`,
      `Result: ${summary.winner === "playerA" ? "Player A" : "Player B"} won${summary.war ? " after a war" : ""}.`,
      `Cards remaining: Player A ${summary.playerACardsLeft}, Player B ${summary.playerBCardsLeft}.`,
    ].join(" ");

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
          temperature: 0.7,
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
