import { WarEngine } from '../engine/WarEngine.ts';
import type { Card, GameState, PlayerId, StakeCard, WarEngineOptions } from '../engine/types.ts';
import type { GameDefinition, PlayerInfo } from './types.ts';

const seatIds: PlayerId[] = ['A', 'B'];
const suitSymbols = { S: '♠', H: '♥', D: '♦', C: '♣' } as const;

function toViewCard(card: Card | null) {
  return card && { rank: card.rank, suit: suitSymbols[card.suit] };
}

function toViewStake(stake: StakeCard) {
  if (!stake.faceUp) return { faceUp: false };
  return { faceUp: true, card: toViewCard(stake.card) };
}

function toViewWinner(winner: PlayerId | null, seat: PlayerId) {
  return winner === null ? null : winner === seat ? 'you' : 'opponent';
}

// Each player's view is relative to themselves: "your" card and count, and
// winner as "you" / "opponent".
function toView(state: GameState, seat: PlayerId, players: PlayerInfo[]) {
  const mine = seat === 'A';
  const opponentSeat = mine ? 'B' : 'A';
  const { lastRound } = state;
  return {
    yourCard: toViewCard(state.yourCard),
    opponentCard: toViewCard(state.opponentCard),
    pile: state.pile,
    yourCount: mine ? state.scoreA : state.scoreB,
    opponentCount: mine ? state.scoreB : state.scoreA,
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
    winner: state.winner === null ? undefined : state.winner === seat ? 'you' : 'opponent',
    yourName: players[seatIds.indexOf(seat)]?.username,
    opponentName: players[seatIds.indexOf(opponentSeat)]?.username,
  };
}

export const war: GameDefinition = {
  id: 'war',
  name: 'War',
  description: 'Flip your top card; the higher card takes both. Ties go to war.',
  players: 2,
  create({ commentator, options }) {
    const engine = new WarEngine(options as WarEngineOptions);
    return {
      view(seat, players) {
        return toView(engine.getState(seatIds[seat]), seatIds[seat], players);
      },
      act(seat, payload) {
        if (payload.kind !== 'flip') return null;
        const result = engine.flip(seatIds[seat]);
        if (!result.ok) return { ok: false, error: result.error };
        if (!result.resolved) return { ok: true };
        const { summary } = result;
        return {
          ok: true,
          finished: summary.gameOver
            ? { winner: summary.winner === null ? null : seatIds.indexOf(summary.winner) }
            : undefined,
          commentary: { round: summary.round, text: commentator.describe(summary) },
        };
      },
    };
  },
};
