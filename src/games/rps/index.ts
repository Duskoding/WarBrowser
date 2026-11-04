import type { GameModule } from "../GameModule.ts";
import { COMMENTARY_INTRO, names, outcomeFor, playerLabel, whoFor } from "../shared/view.ts";
import { RpsEngine, WINS_NEEDED, isChoice, type RpsAction, type RpsResult, type RpsRound, type RpsState } from "./RpsEngine.ts";

export function buildRpsPrompt(round: RpsRound, score: [number, number], over: boolean): string {
  const [a, b] = round.picks;
  let result =
    round.winner === null
      ? `Both players threw ${a}, a tie.`
      : `${playerLabel(round.winner)} won with ${round.picks[round.winner]} over ${round.picks[1 - round.winner]}.`;
  result += ` Score ${score[0]}-${score[1]}.`;
  if (over && round.winner !== null) result += ` ${playerLabel(round.winner)} wins the match.`;
  return `${COMMENTARY_INTRO} Rock-Paper-Scissors, round ${round.round}: Player 1 threw ${a}, Player 2 threw ${b}. ${result}`;
}

export const rps: GameModule<RpsState, RpsAction, RpsResult> = {
  id: "rps",
  name: "Rock-Paper-Scissors",
  description: `Both pick at once. First to ${WINS_NEEDED} round wins takes the match.`,
  players: 2,
  rules: [
    "Each round, both players pick rock, paper or scissors. Neither sees the other's pick until both have chosen.",
    "Rock beats scissors, scissors beats paper, paper beats rock. The same pick is a tie and counts for no one.",
    `The first player to win ${WINS_NEEDED} rounds wins the match.`,
  ],

  createEngine() {
    return new RpsEngine();
  },

  handleAction(engine, seat, payload, context) {
    if (payload.kind !== "pick") return null;
    if (!isChoice(payload.choice)) return { ok: false, error: "Pick rock, paper or scissors." };
    const result = engine.apply(seat, { kind: "pick", choice: payload.choice });
    if (!result.ok) return { ok: false, error: result.error };
    if (!result.resolved) return { ok: true };
    const state = engine.getState(0);
    return {
      ok: true,
      finished: result.finished,
      commentary: {
        round: result.resolved.round,
        text: context.commentator.describe(
          buildRpsPrompt(result.resolved, [state.yourScore, state.opponentScore], state.over),
        ),
      },
    };
  },

  toView(engine, seat, players) {
    const state = engine.getState(seat);
    const last = state.lastRound;
    return {
      round: state.round,
      yourPick: state.yourPick,
      opponentPicked: state.opponentPicked,
      yourScore: state.yourScore,
      opponentScore: state.opponentScore,
      winsNeeded: WINS_NEEDED,
      lastRound: last && {
        round: last.round,
        yours: last.picks[seat],
        theirs: last.picks[1 - seat],
        winner: whoFor(seat, last.winner),
      },
      result: outcomeFor(seat, state.over, state.winner),
      ...names(seat, players),
    };
  },
};

export { RpsEngine };
export type { RpsState, RpsAction, RpsResult };
