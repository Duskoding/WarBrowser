import type { GameModule, PlayerInfo } from "../GameModule.ts";
import { PokerEngine } from "./PokerEngine.ts";
import { buildPokerPrompt } from "./prompt.ts";
import type {
  LastAction,
  PokerAction,
  PokerEngineOptions,
  PokerResult,
  PokerState,
  PokerView,
  Seat,
  ViewCard,
  ViewSuit,
} from "./types.ts";
import type { Card } from "../shared/cards.ts";

const suitSymbols: Record<Card["suit"], ViewSuit> = { S: "♠", H: "♥", D: "♦", C: "♣" };

const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

function viewCard(card: Card): ViewCard {
  return { rank: card.rank, suit: suitSymbols[card.suit] };
}

function side(seat: Seat, who: Seat): "you" | "opponent" {
  return who === seat ? "you" : "opponent";
}

function toView(state: PokerState, seat: Seat, players: PlayerInfo[]): PokerView {
  const opp = other(seat);
  const result = state.result;
  return {
    phase: state.phase,
    handNumber: state.handNumber,
    smallBlind: state.smallBlind,
    bigBlind: state.bigBlind,
    youAreButton: state.button === seat,
    yourName: players[seat]?.username,
    opponentName: players[opp]?.username,
    yourCards: state.yourHoleCards.map(viewCard),
    opponentCards: state.opponentHoleCards?.map(viewCard) ?? null,
    board: state.board.map(viewCard),
    pot: state.pot,
    yourStack: state.stacks[seat],
    opponentStack: state.stacks[opp],
    yourCommitted: state.committed[seat],
    opponentCommitted: state.committed[opp],
    yourTurn: state.toAct === seat,
    legal: state.legal,
    lastAction: state.lastAction && {
      who: side(seat, state.lastAction.seat),
      type: state.lastAction.type,
      amount: state.lastAction.amount,
    },
    result: result && {
      reason: result.reason,
      winners: result.winners.map((winner) => side(seat, winner)),
      youWon: result.potWon[seat],
      opponentWon: result.potWon[opp],
      yourHand: result.hands?.[seat].name ?? null,
      opponentHand: result.hands?.[opp].name ?? null,
    },
    youReady: state.ready[seat],
    opponentReady: state.ready[opp],
    winner: state.winner === null ? null : side(seat, state.winner),
  };
}

function toAction(payload: Record<string, unknown>): PokerAction | null {
  switch (payload.kind) {
    case "fold":
    case "check":
    case "call":
    case "next_hand":
      return { kind: payload.kind };
    case "raise":
      return { kind: "raise", to: payload.to as number };
    default:
      return null;
  }
}

export const poker: GameModule<PokerState, PokerAction, PokerResult> = {
  id: "poker",
  name: "Hold'em",
  description: "Heads-up no-limit Texas Hold'em. Last stack standing takes the match.",
  players: { min: 2, max: 2 },
  rules: [
    "Two players. Each starts with 1,000 chips. Blinds are 10 and 20, and they stay there.",
    "The button posts the small blind and acts first before the flop. After the flop, the other player acts first.",
    "On your turn you can fold, check, call, or raise. A raise has to be at least as big as the last raise, and you cannot put in more than the other player can match.",
    "Your two hole cards stay hidden until showdown. The best five-card hand using those cards and the board wins the pot. A tie splits it, and an odd chip goes to the player who is not the button.",
    "The match ends when one player has every chip. Both players press Next hand to deal again before that.",
  ],

  createEngine(context) {
    return new PokerEngine(context.options as PokerEngineOptions);
  },

  handleAction(engine, seat, payload, context) {
    const action = toAction(payload);
    if (!action) return null;
    const result = engine.apply(seat, action);
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      finished: result.finished,
      commentary: result.spoke
        ? { round: result.spoke.actionId, text: context.commentator.describe(buildPokerPrompt(result.spoke)) }
        : undefined,
    };
  },

  toView(engine, seat, players) {
    const viewer: Seat = seat === 1 ? 1 : 0;
    return toView(engine.getState(viewer), viewer, players);
  },
};

export type { PokerState, PokerAction, PokerResult, PokerView, LastAction };
export { PokerEngine };
export { buildPokerPrompt };
