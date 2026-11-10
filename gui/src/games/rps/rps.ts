import type { GuiModule } from "../GuiModule";
import styles from "./rps.css?inline";

type Choice = "rock" | "paper" | "scissors";
type Result = "you" | "opponent" | "draw";
type RpsView = {
  yourChoice: Choice | null;
  opponentChoice: Choice | null;
  yourScore: number;
  opponentScore: number;
  round: number;
  phase: "waiting" | "picked" | "roundOver" | "gameOver";
  lastRound: { winner: Result; yourChoice: Choice; opponentChoice: Choice } | null;
  winner?: Result;
  yourName?: string;
  opponentName?: string;
};

const LABELS: Record<Choice, string> = {
  rock: "🪨 Rock",
  paper: "📄 Paper",
  scissors: "✂️ Scissors"
};

export const rps: GuiModule = {
  id: "rps",
  styles,
  isFinished: (view) => (view as RpsView).phase === "gameOver",
  mount(root, { send }) {
    root.innerHTML = `
      <div class="rps">
        <p class="rps-players" data-id="players"></p>
        <p class="status" data-id="status" role="status"></p>
        <div class="rps-score" data-id="score"></div>
        <div class="rps-choices" role="group" aria-label="Choose your move">
          ${(["rock", "paper", "scissors"] as Choice[])
            .map((choice) => `<button data-choice="${choice}">${LABELS[choice]}</button>`)
            .join("")}
        </div>
        <p class="rps-picks" data-id="picks"></p>
        <aside class="commentary" data-id="commentary">Choose your move.</aside>
      </div>
    `;
    const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-choice]")];
    buttons.forEach((button) =>
      button.addEventListener("click", () => {
        buttons.forEach((item) => (item.disabled = true));
        send({ kind: "pick", choice: button.dataset.choice as Choice });
      })
    );

    let view: RpsView | null = null;

    function render() {
      const v = view;
      if (!v) return;
      root.querySelector('[data-id="players"]')!.textContent =
        `${v.yourName ?? "You"} vs ${v.opponentName ?? "Opponent"}`;
      root.querySelector('[data-id="score"]')!.textContent =
        `${v.yourScore} – ${v.opponentScore} · Round ${v.round + (v.phase === "roundOver" || v.phase === "gameOver" ? 0 : 1)}`;

      let status = "Choose rock, paper, or scissors.";
      if (v.phase === "picked") status = "Waiting for your opponent…";
      if (v.phase === "roundOver") {
        status =
          v.lastRound?.winner === "you"
            ? "You won the round!"
            : v.lastRound?.winner === "opponent"
              ? "Your opponent won the round."
              : "The round was a tie.";
      }
      if (v.phase === "gameOver") {
        status = v.winner === "you" ? "You win the match!" : "You lose the match.";
      }
      root.querySelector('[data-id="status"]')!.textContent = status;
      root.querySelector('[data-id="picks"]')!.textContent =
        v.opponentChoice === null
          ? v.yourChoice
            ? `You picked ${LABELS[v.yourChoice]}.`
            : ""
          : `You: ${LABELS[v.yourChoice!]} · Opponent: ${LABELS[v.opponentChoice]}`;

      buttons.forEach((button) => {
        const choice = button.dataset.choice as Choice;
        const canPick = v.phase === "waiting" || v.phase === "roundOver";
        button.disabled = !canPick || (v.phase === "waiting" && v.yourChoice !== null);
        button.classList.toggle("selected", v.yourChoice === choice);
      });
    }

    return {
      applyState(next) {
        view = next as RpsView;
      },
      render,
      destroy() {
        buttons.forEach((button) => button.replaceWith(button.cloneNode(true)));
      }
    };
  }
};
