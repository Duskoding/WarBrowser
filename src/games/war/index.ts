import type { GameModule, PlayerInfo } from "../GameModule.ts";
import { WarEngine } from "./WarEngine.ts";
import { buildWarPrompt } from "./prompt.ts";
import type { Card, StakeCard, WarAction, WarEngineOptions, WarResult, WarState } from "./types.ts";

const suitSymbols = { S: "♠", H: "♥", D: "♦", C: "♣" } as const;

function toViewCard(card: Card | null) {
  return card && { rank: card.rank, suit: suitSymbols[card.suit] };
}

function toViewStake(stake: StakeCard) {
  if (!stake.faceUp) return { faceUp: false };
  return { faceUp: true, card: toViewCard(stake.card) };
}

function toViewWinner(winner: number | null, seat: number) {
  return winner === null ? null : winner === seat ? "you" : "opponent";
}

// Each player's view is relative to themselves. On game over, omitted winner means a draw.
function toView(state: WarState, seat: number, players: PlayerInfo[]) {
  const { lastRound } = state;
  return {
    yourCard: toViewCard(state.yourCard),
    opponentCard: toViewCard(state.opponentCard),
    pile: state.pile,
    yourCount: state.yourCount,
    opponentCount: state.opponentCount,
    phase: state.phase,
    inWar: state.inWar,
    warCards: state.warCards.map((pair) => ({
      yours: toViewCard(pair.yours),
      opponent: toViewCard(pair.opponent),
    })),
    yourStakes: (state.yourStakes ?? []).map(toViewStake),
    opponentStakes: (state.opponentStakes ?? []).map(toViewStake),
    lastRound: lastRound && {
      wasWar: lastRound.wasWar,
      winner: toViewWinner(lastRound.winner, seat),
      cardsWon: lastRound.cardsWon,
    },
    winner:
      state.phase !== "gameOver" || state.winner === null
        ? undefined
        : state.winner === seat
          ? "you"
          : "opponent",
    yourName: players[seat]?.username,
    opponentName: players[1 - seat]?.username,
  };
}

export const war: GameModule<WarState, WarAction, WarResult> = {
  id: "war",
  name: "War",
  description: "Flip your top card; the higher card takes both. Ties go to war.",
  players: { min: 2, max: 2 },

  createEngine(context) {
    return new WarEngine(context.options as WarEngineOptions);
  },

  handleAction(engine, seat, payload, context) {
    if (payload.kind !== "flip") return null;
    const result = engine.apply(seat, { kind: "flip" });
    if (!result.ok) return { ok: false, error: result.error };
    if (!result.resolved) return { ok: true };
    const { summary, finished } = result;
    return {
      ok: true,
      finished,
      commentary: {
        round: summary.round,
        text: context.commentator.describe(buildWarPrompt(summary)),
      },
    };
  },

  toView(engine, seat, players) {
    return toView(engine.getState(seat), seat, players);
  },
};

export type { WarState, WarAction, WarResult };
export { WarEngine, createDeck } from "./WarEngine.ts";
export { buildWarPrompt, cardName } from "./prompt.ts";
