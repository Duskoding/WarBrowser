import type { GameModule, PlayerInfo } from "../GameModule.ts";
import { UnoEngine } from "./UnoEngine.ts";
import { buildUnoPrompt } from "./prompt.ts";
import type { Color, UnoAction, UnoEngineOptions, UnoResult, UnoState } from "./types.ts";

const COLORS: Color[] = ["red", "yellow", "green", "blue"];

function toView(state: UnoState, seat: number, players: PlayerInfo[]) {
  return {
    hand: state.hand,
    handCounts: state.handCounts,
    names: players.map((player) => player.username),
    yourSeat: seat,
    discardTop: state.discardTop,
    activeColor: state.activeColor,
    direction: state.direction,
    currentSeat: state.currentSeat,
    yourTurn: state.yourTurn,
    drawPileCount: state.drawPileCount,
    round: state.round,
    over: state.over,
    winnerSeat: state.winner,
  };
}

export const uno: GameModule<UnoState, UnoAction, UnoResult> = {
  id: "uno",
  name: "Uno",
  description: "Match the color or number on top, dodge Draw Twos, and empty your hand first.",
  players: { min: 2, max: 8 },

  createEngine(context) {
    return new UnoEngine(context.players, context.options as UnoEngineOptions);
  },

  handleAction(engine, seat, payload, context) {
    let action: UnoAction;
    if (payload.kind === "draw") {
      action = { kind: "draw" };
    } else if (payload.kind === "play") {
      if (!Number.isInteger(payload.cardIndex)) {
        return { ok: false, error: "Pick a card from your hand." };
      }
      const chosenColor = payload.chosenColor;
      if (chosenColor !== undefined && !COLORS.includes(chosenColor as Color)) {
        return { ok: false, error: "Choose a valid color." };
      }
      action = {
        kind: "play",
        cardIndex: payload.cardIndex as number,
        chosenColor: chosenColor as Color | undefined,
      };
    } else {
      return null;
    }

    const before = engine.getState(seat);
    const card = action.kind === "play" ? before.hand[action.cardIndex] : undefined;
    const result = engine.apply(seat, action);
    if (!result.ok) return { ok: false, error: result.error };
    const after = engine.getState(seat);

    return {
      ok: true,
      finished: result.finished,
      commentary: {
        round: after.round,
        text: context.commentator.describe(
          buildUnoPrompt({
            seat,
            action: action.kind,
            card,
            over: after.over,
            winner: after.winner,
            round: after.round,
          }),
        ),
      },
    };
  },

  toView(engine, seat, players) {
    return toView(engine.getState(seat), seat, players);
  },
};

export type { UnoState, UnoAction, UnoResult };
export { UnoEngine, createDeck } from "./UnoEngine.ts";
export { buildUnoPrompt, cardName } from "./prompt.ts";
