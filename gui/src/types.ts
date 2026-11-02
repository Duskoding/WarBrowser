// ---- Server protocol (matches server.js on s8119-internet-multiplayer) ----

export type ClientMessage =
  | { type: "create_room"; game?: GameType }
  | { type: "join_room"; roomCode: string }
  | { type: "game_message"; payload: GamePayload }
  | { type: "leave_room" };

export type ServerEvent =
  | { type: "connected" } // local: socket opened
  | { type: "disconnected" } // local: socket closed
  | { type: "room_created"; roomCode: string; username?: string; game?: GameType }
  | {
      type: "room_joined";
      roomCode: string;
      username?: string;
      opponentUsername?: string;
      game?: GameType;
    }
  | { type: "opponent_joined"; username?: string }
  | { type: "opponent_disconnected" }
  | { type: "room_left" }
  | { type: "game_message"; payload: unknown } // relayed from the opponent, unchecked
  | { type: "error"; message: string };

export type GameType = "war" | "poker";

// ---- Game messages sent inside game_message ----
// The server runs WarEngine: players send { kind: "flip" }, and the server
// sends each player their own { kind: "state" } view (and later commentary).

export type Suit = "♠" | "♥" | "♦" | "♣";

export type Card = {
  rank: number; // 2–14 (11 = J, 12 = Q, 13 = K, 14 = A)
  suit: Suit;
};

export type Phase = "waiting" | "flipped" | "war" | "roundOver" | "gameOver";

// A pair of cards that tied and started (or extended) a war.
export type TiedPair = { yours: Card; opponent: Card };

// How the last resolved round ended; cleared when the next round starts.
export type LastRound = {
  wasWar: boolean;
  winner: "you" | "opponent" | null; // null = draw
  cardsWon: number;
};

// One player's view of the table.
export type GameView = {
  yourCard: Card | null;
  opponentCard: Card | null; // visible as soon as the opponent flips; null until then
  pile: number; // cards in the middle
  yourCount: number;
  opponentCount: number;
  phase: Phase;
  inWar: boolean; // true for the whole war, until it resolves
  warCards: TiedPair[]; // the tied cards so far (more than one when wars chain)
  lastRound: LastRound | null;
  winner?: "you" | "opponent";
  yourName?: string;
  opponentName?: string;
};

// ---- Poker (see SPEC_POKER.md §4) ----

export type PokerPhase = "preflop" | "flop" | "turn" | "river" | "handOver" | "gameOver";

export type PokerAction =
  | { type: "fold" }
  | { type: "check" }
  | { type: "call" }
  | { type: "raise"; to: number };

export type PokerLegal = {
  fold: boolean;
  check: boolean;
  call: number; // chips needed to call; 0 when nothing to call
  minRaiseTo: number | null; // null = cannot bet or raise
  maxRaiseTo: number | null;
};

export type PokerSide = "you" | "opponent";

export type PokerView = {
  phase: PokerPhase;
  handNumber: number;
  smallBlind: number;
  bigBlind: number;
  youAreButton: boolean;
  yourName: string;
  opponentName: string;
  yourCards: Card[];
  opponentCards: Card[] | null; // only after a showdown
  board: Card[];
  pot: number;
  yourStack: number;
  opponentStack: number;
  yourCommitted: number;
  opponentCommitted: number;
  yourTurn: boolean;
  legal: PokerLegal | null;
  lastAction: {
    who: PokerSide;
    type: "fold" | "check" | "call" | "raise" | "smallBlind" | "bigBlind";
    amount: number;
  } | null;
  result: {
    reason: "fold" | "showdown";
    winners: PokerSide[];
    youWon: number;
    opponentWon: number;
    yourHand: string | null;
    opponentHand: string | null;
  } | null;
  youReady: boolean;
  opponentReady: boolean;
  winner: PokerSide | null;
};

export type GamePayload =
  | { kind: "action"; action: PokerAction } // player → server (poker)
  | { kind: "next_hand" } // player → server (poker)
  | { kind: "poker_state"; view: PokerView } // server → player
  | { kind: "flip" } // player → server
  | { kind: "state"; view: GameView } // server → player
  | { kind: "commentary"; text: string; round: number }; // server → player

// Same rule for the Flip button and the fake opponent.
export const canFlip = (v: GameView) =>
  v.phase !== "gameOver" && !(v.yourCard !== null && v.opponentCard === null);
