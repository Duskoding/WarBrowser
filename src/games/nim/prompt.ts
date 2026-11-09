import { COMMENTARY_INTRO, playerLabel } from "../shared/view.ts";

export function buildNimPrompt(seat: number, pile: number, count: number): string {
  const stones = count === 1 ? "1 stone" : `${count} stones`;
  return `${COMMENTARY_INTRO} Nim: ${playerLabel(seat)} took ${stones} from pile ${pile + 1}, including the last stone, and wins.`;
}
