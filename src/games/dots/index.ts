import type { GameModule } from "../GameModule.ts";
import { COMMENTARY_INTRO, names, outcomeFor, playerLabel } from "../shared/view.ts";
import { DotsEngine, SIZE, type DotsAction, type DotsResult, type DotsState } from "./DotsEngine.ts";

export function buildDotsPrompt(seat: number, closed: number, scores: [number, number], over: boolean): string {
  let text = `${playerLabel(seat)} closed ${closed === 1 ? "a box" : `${closed} boxes`} with one line. Score ${scores[0]}-${scores[1]}.`;
  if (over) {
    const [a, b] = scores;
    text += a === b ? " The game ends in a draw." : ` ${playerLabel(a > b ? 0 : 1)} wins the game.`;
  }
  return `${COMMENTARY_INTRO} Dots and Boxes: ${text}`;
}

const isDirection = (value: unknown): value is "h" | "v" => value === "h" || value === "v";
const relative = (owner: number | null, seat: number) => (owner === null ? null : owner === seat ? "you" : "opponent");

export const dots: GameModule<DotsState, DotsAction, DotsResult> = {
  id: "dots",
  name: "Dots and Boxes",
  description: "Draw lines between dots. Close a box to score it and go again.",
  players: { min: 2, max: 2 },
  rules: [
    `The board is a ${SIZE} × ${SIZE} grid of boxes. Players take turns; the room's host goes first.`,
    "On your turn, draw one line between two neighbouring dots.",
    "If your line closes a box, the box is yours and you take another turn.",
    `When all ${SIZE * SIZE} boxes are closed, the player with more boxes wins.`,
  ],

  createEngine() {
    return new DotsEngine();
  },

  handleAction(engine, seat, payload, context) {
    if (payload.kind !== "line") return null;
    const { dir, row, col } = payload;
    if (!isDirection(dir) || !Number.isInteger(row) || !Number.isInteger(col)) {
      return { ok: false, error: "Pick a line between two dots." };
    }
    const result = engine.apply(seat, { kind: "line", dir, row: row as number, col: col as number });
    if (!result.ok) return { ok: false, error: result.error };
    if (result.closed.length === 0) return { ok: true };
    // Commentary only when a box is closed.
    const state = engine.getState(seat);
    const boxesClosed = state.boxes.filter((b) => b !== null).length;
    return {
      ok: true,
      finished: result.finished,
      commentary: {
        round: boxesClosed,
        text: context.commentator.describe(buildDotsPrompt(seat, result.closed.length, state.scores, state.over)),
      },
    };
  },

  toView(engine, seat, players) {
    const state = engine.getState(seat);
    return {
      size: state.size,
      h: state.h.map((row) => row.map((owner) => relative(owner, seat))),
      v: state.v.map((row) => row.map((owner) => relative(owner, seat))),
      boxes: state.boxes.map((owner) => relative(owner, seat)),
      yourScore: state.scores[seat],
      opponentScore: state.scores[1 - seat],
      yourTurn: state.yourTurn,
      lastLine: state.lastLine,
      result: outcomeFor(seat, state.over, state.winner),
      ...names(seat, players),
    };
  },
};

export { DotsEngine };
export type { DotsState, DotsAction, DotsResult };
