export type Suit = "♠" | "♥" | "♦" | "♣";

export type Card = {
  rank: number; // 2–14 (11 = J, 12 = Q, 13 = K, 14 = A)
  suit: Suit;
};

export type PlayerView = {
  cardsLeft: number;
  faceUp: Card | null;
};

export type GameState = {
  you: PlayerView;
  them: PlayerView;
  phase: "waiting" | "playing" | "war" | "over";
  winner?: "you" | "them";
  commentary?: string;
};
