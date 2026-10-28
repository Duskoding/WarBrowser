import type { Card, GameState, RoundSummary, Suit } from "./protocol.js";

type Player = { deck: Card[]; faceUp: Card | null };
const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];

export class WarEngine {
  private readonly players: [Player, Player];
  private roundId = 0;
  private waiting = new Set<number>();
  private phase: GameState["phase"] = "waiting";

  constructor() {
    const deck = SUITS.flatMap((suit) => Array.from({ length: 13 }, (_, index) => ({ rank: index + 2, suit })));
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    this.players = [
      { deck: deck.slice(0, 26), faceUp: null },
      { deck: deck.slice(26), faceUp: null },
    ];
  }

  setPlayersConnected(count: number) {
    if (this.phase === "waiting" && count === 2) this.phase = "playing";
  }

  flip(player: number): RoundSummary | null {
    if (this.phase === "over") throw new Error("The game is over.");
    if (this.waiting.has(player)) throw new Error("You already flipped this round.");
    if (this.players[player].deck.length === 0) throw new Error("You have no cards left.");
    this.waiting.add(player);
    this.players[player].faceUp = this.players[player].deck.shift()!;
    if (this.waiting.size < 2) {
      this.phase = "playing";
      return null;
    }

    const a = this.players[0].faceUp!;
    const b = this.players[1].faceUp!;
    const war = a.rank === b.rank;
    const winner = a.rank >= b.rank ? 0 : 1;
    this.players[winner].deck.push(a, b);
    this.waiting.clear();
    this.roundId++;
    this.phase = this.players.some((player) => player.deck.length === 0) ? "over" : "playing";
    return {
      roundId: this.roundId,
      playerCards: [a, b],
      winner: winner === 0 ? "playerA" : "playerB",
      war,
      playerACardsLeft: this.players[0].deck.length,
      playerBCardsLeft: this.players[1].deck.length,
    };
  }

  state(forPlayer: number): GameState {
    const opponent = forPlayer === 0 ? 1 : 0;
    const winner = this.phase === "over" ? (this.players[forPlayer].deck.length ? "you" : "them") : undefined;
    return {
      you: { cardsLeft: this.players[forPlayer].deck.length, faceUp: this.players[forPlayer].faceUp },
      them: { cardsLeft: this.players[opponent].deck.length, faceUp: this.players[opponent].faceUp },
      phase: this.phase,
      ...(winner ? { winner } : {}),
    };
  }

  get round(): number {
    return this.roundId;
  }
}
