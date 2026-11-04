import type { GuiModule } from "../GuiModule";
import shared from "../shared/shared.css?inline";
import { commentaryBox } from "../shared/cards";
import styles from "./rps.css?inline";

type Choice = "rock" | "paper" | "scissors";
type Outcome = "you" | "opponent" | "draw";

type RpsView = {
  round: number;
  yourPick: Choice | null;
  opponentPicked: boolean;
  yourScore: number;
  opponentScore: number;
  winsNeeded: number;
  lastRound: { round: number; yours: Choice; theirs: Choice; winner: Outcome } | null;
  result?: Outcome;
  yourName?: string;
  opponentName?: string;
};

const ICON: Record<Choice, string> = { rock: "✊", paper: "✋", scissors: "✌️" };
const CHOICES: Choice[] = ["rock", "paper", "scissors"];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export const rps: GuiModule = {
  id: "rps",
  styles: shared + styles,
  isFinished: (view) => (view as RpsView).result !== undefined,
  mount(root, { send }) {
    root.innerHTML = `
      <div class="game rps">
        <p class="players" data-id="players"></p>
        <div class="score" data-id="score"></div>
        <p class="status" data-id="status"></p>
        <div class="rps-picks">
          ${CHOICES.map((c) => `<button class="rps-pick" data-choice="${c}"><span class="icon">${ICON[c]}</span><span>${cap(c)}</span></button>`).join("")}
        </div>
        <p class="note" data-id="last"></p>
        <aside class="commentary" data-id="commentary">Commentary will appear here.</aside>
      </div>
    `;
    const buttons = [...root.querySelectorAll<HTMLButtonElement>(".rps-pick")];
    buttons.forEach((button) =>
      button.addEventListener("click", () => {
        buttons.forEach((b) => (b.disabled = true));
        send({ kind: "pick", choice: button.dataset.choice });
      })
    );
    const $ = (id: string) => root.querySelector(`[data-id="${id}"]`)!;
    let view: RpsView | null = null;

    function render() {
      const v = view;
      if (!v) return;
      $("players").textContent = `${v.yourName ?? "You"} vs ${v.opponentName ?? "Opponent"} · first to ${v.winsNeeded}`;
      $("score").innerHTML = `<span>You <strong></strong></span><span>Them <strong></strong></span>`;
      const [yours, theirs] = $("score").querySelectorAll("strong");
      yours.textContent = String(v.yourScore);
      theirs.textContent = String(v.opponentScore);

      let status = v.yourPick
        ? v.opponentPicked ? "Revealing…" : "Waiting for your opponent to pick…"
        : `Round ${v.round}: make your pick` + (v.opponentPicked ? " (they've picked)" : "");
      if (v.result === "you") status = "You win the match!";
      else if (v.result === "opponent") status = "You lose the match.";
      $("status").textContent = status;

      buttons.forEach((b) => {
        b.disabled = v.result !== undefined || v.yourPick !== null;
        b.classList.toggle("chosen", b.dataset.choice === v.yourPick);
      });

      const last = v.lastRound;
      $("last").textContent = last
        ? `Round ${last.round}: you threw ${ICON[last.yours]} ${last.yours}, they threw ${ICON[last.theirs]} ${last.theirs}. ` +
          (last.winner === "draw" ? "Tie." : last.winner === "you" ? "You won the round." : "They won the round.")
        : "";
    }

    return {
      applyState(next) {
        view = next as RpsView;
      },
      render,
      commentary: commentaryBox($("commentary"))
    };
  }
};
