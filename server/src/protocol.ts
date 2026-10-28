export type Suit = "♠" | "♥" | "♦" | "♣";

export type Card = {
  rank: number;
  suit: Suit;
};

export type PlayerView = {
  cardsLeft: number;
  faceUp: Card | null;
};

export type Phase = "waiting" | "playing" | "war" | "over";

export type GameState = {
  you: PlayerView;
  them: PlayerView;
  phase: Phase;
  winner?: "you" | "them";
};

export type RoundSummary = {
  roundId: number;
  playerCards: Card[];
  winner: "playerA" | "playerB";
  war: boolean;
  playerACardsLeft: number;
  playerBCardsLeft: number;
};

export type ServerMessage =
  | { type: "state"; state: GameState }
  | { type: "commentary"; text: string; roundId: number }
  | { type: "error"; message: string };

export type ClientMessage =
  | { type: "join"; roomId: string }
  | { type: "flip" };
