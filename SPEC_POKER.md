# WarBrowser Poker — Heads-up No-Limit Texas Hold'em

> Ported onto the game plugin (issue #79). The rules below still describe the hand evaluator and the betting. Seats are now `0` and `1` (`0` is this document's old seat A, `1` is old seat B). The engine lives in `src/games/poker/` and implements `GameEngine`. `src/games/poker/index.ts` is the `GameModule` (including How to play `rules`). The screen is `gui/src/games/poker/`. `server.js` and `gui/src/main.ts` stay game-agnostic. Cards come from `src/games/shared/cards.ts`. Hole cards stay out of the other seat's view until showdown, and out of commentary prompts entirely.

Accounts, rooms, invite links, sockets and hosting stay shared. Poker adds a hand evaluator, an engine, a `GameModule`, and a table inside its own screen.

**Scope (v1):** two players (heads-up), no-limit Texas Hold'em, fixed blinds, a freezeout (the game ends when one player has every chip). Out of scope for now: tables of 3–9 players, side pots between three or more players, rising blinds, turn timers, reconnecting, and bots. Commentary covers public moments only and never includes hole cards.

The shared types live in `src/games/poker/types.ts`. Sections 4 and 5 below describe the original pre-plugin wiring; the plugin note at the top replaces them.

## 1. Files

| Path | What it is |
| --- | --- |
| `src/poker/types.ts` | Shared types (already written) |
| `src/poker/handEvaluator.ts` | Best-hand evaluation and comparison (§2) |
| `src/poker/handEvaluator.test.ts` | Evaluator tests |
| `src/poker/PokerEngine.ts` | Rules and state, no networking (§3) |
| `src/poker/PokerEngine.test.ts` | Engine tests |
| `server.js` | Game type on rooms, poker messages (§4) |
| `gui/src/poker.ts` + changes in `gui/src/main.ts`, `gui/src/types.ts`, `gui/src/style.css` | Poker table in the client (§5) |
| `test/server.test.js` | Poker server tests |

Reuse `createDeck()` and `fisherYates()` by importing them from `src/engine/WarEngine.ts`. Cards use the existing `Card` type: `rank` 2–14 (11 = J, 12 = Q, 13 = K, 14 = A), `suit` `'S' | 'H' | 'D' | 'C'`. Use `.ts` extensions in relative imports under `src/` (Node runs TypeScript directly). Tests use `node:test` and `node:assert/strict`, like `src/engine/WarEngine.test.ts`.

## 2. Hand evaluator — `src/poker/handEvaluator.ts`

```ts
export function evaluateFive(cards: Card[]): HandValue;   // exactly 5 cards, else throw
export function bestHand(cards: Card[]): HandValue;       // 5 to 7 cards: best of every 5-card combination
export function compareHands(a: HandValue, b: HandValue): number; // > 0 a wins, < 0 b wins, 0 tie
```

`compareHands` compares `categoryRank`, then `tiebreak` element by element. Nothing else (suits never break ties).

| Category | categoryRank | tiebreak | name example |
| --- | --- | --- | --- |
| high-card | 0 | five ranks high→low | `Ace-high` |
| pair | 1 | pair rank, then 3 kickers high→low | `Pair of Kings` |
| two-pair | 2 | high pair, low pair, kicker | `Two pair, Kings and Sevens` |
| three-of-a-kind | 3 | trips rank, 2 kickers high→low | `Three of a kind, Queens` |
| straight | 4 | the straight's top card (5 for A-2-3-4-5) | `Straight, Ten-high` |
| flush | 5 | five ranks high→low | `Flush, Ace-high` |
| full-house | 6 | trips rank, pair rank | `Full house, Kings over Sevens` |
| four-of-a-kind | 7 | quad rank, kicker | `Four of a kind, Nines` |
| straight-flush | 8 | top card (5 for the wheel) | `Straight flush, Nine-high`; with an Ace top card, `Royal flush` |

Rank words: Two, Three, Four, Five, Six, Seven, Eight, Nine, Ten, Jack, Queen, King, Ace; plurals add "s" except Six → "Sixes". `cards` holds the five cards used, ordered like `tiebreak` (for the wheel, 5-4-3-2-A).

Tests must cover: each category; the wheel (A-2-3-4-5) and the wheel losing to 2-6; Ace-high straight; kicker comparisons for pair, two pair, trips and high card; flush vs straight; picking the best 5 of 7 (board plays, both players split); a 7-card hand with two possible trips making the best full house; `evaluateFive` throwing on a wrong card count.

## 3. Engine — `src/poker/PokerEngine.ts`

```ts
export class PokerEngine {
  constructor(opts?: PokerEngineOptions);     // deals hand 1 immediately
  act(seat: PlayerId, action: PokerAction): PokerActResult;
  ready(seat: PlayerId): PokerActResult;      // "next hand" during handOver
  getState(seat: PlayerId): PokerState;
}
```

Defaults: `startingStack` 1000, `smallBlind` 10, `bigBlind` 20. Seats are `'A'` and `'B'`. The button starts on `'A'` for hand 1 and moves to the other seat every hand.

### Dealing (deterministic so tests can rig decks)
At the start of each hand: `deck = shuffle(createDeck())`. A gets `deck[0], deck[1]`; B gets `deck[2], deck[3]`; `deck[4]` is burned; the flop is `deck[5..7]`; `deck[8]` burned; turn `deck[9]`; `deck[10]` burned; river `deck[11]`.

### Blinds and order (heads-up rules)
- The button posts the small blind, the other seat posts the big blind, each capped at their stack (a player may be all-in from a blind).
- Pre-flop the **button acts first**. On the flop, turn and river the **non-button acts first**.

### Betting
Per street, track `committed[seat]`, whether each seat has acted since the last bet or raise, and `lastRaiseSize` (starts at the big blind each street; pre-flop the big blind counts as the opening bet).

Let `toCall = committed[opp] - committed[me]` and `effective = min(committed[me] + stack[me], committed[opp] + stack[opp])`.

- **fold:** always legal on your turn.
- **check:** legal when `toCall === 0`.
- **call:** legal when `toCall > 0`. Puts in `min(toCall, stack[me])` (calling all-in for less is allowed).
- **raise `to`:** legal when `stack[me] > toCall` and `stack[opp] > 0`. `minRaiseTo = committed[opp] + lastRaiseSize`, `maxRaiseTo = effective`; if `maxRaiseTo < minRaiseTo` then `minRaiseTo = maxRaiseTo` (an all-in for less than a full raise). `to` must be an integer in `[minRaiseTo, maxRaiseTo]`. A raise sets `lastRaiseSize = max(lastRaiseSize, to - committed[opp])` and means the opponent must act again. Capping at `effective` means a player can never bet chips the opponent cannot match.
- `legal.call` is the chips a call would add (0 if `toCall === 0`).

Errors (return `{ ok: false, error }`, never throw): acting when it is not your turn, acting during `handOver`/`gameOver`, check with chips to call, call with nothing to call, raise out of range or not an integer, unknown action type. Wording is up to you but make it readable for players ("It's not your turn.", "Raise must be between 40 and 1000.").

### Ending a street
A street ends when both seats have acted since the last bet/raise and `committed` is equal, **or** one seat is all-in and the other has acted with `committed` at least as high. Then:
1. If one seat committed more than the other and the lower seat is all-in, refund the difference to the higher seat (this only happens with a short blind).
2. Move `committed` into `pot`, reset `committed` and the acted flags, and set `lastRaiseSize = bigBlind`.
3. If either seat now has 0 chips, deal the rest of the board and go to showdown. Otherwise deal the next street (flop 3, turn 1, river 1). After the river, go to showdown.

### Ending a hand
- **Fold:** the other seat wins `pot + committed A + committed B`. `reason: 'fold'`, `hands: null`, the hole cards stay hidden.
- **Showdown:** `bestHand(hole + board)` for each seat. Higher wins everything; on a tie split evenly, with an odd chip to the **non-button** seat. `reason: 'showdown'`, `hands` filled, `opponentHoleCards` visible to both players from now until the next hand.
- `act` returns `{ ok: true, handEnded: true, summary }` on the action that ends the hand.
- If a seat has 0 chips, `phase = 'gameOver'` and `winner` is the other seat. Otherwise `phase = 'handOver'`.
- During `handOver`, `ready(seat)` marks that seat ready (calling it twice is fine). When both are ready, deal the next hand: increment `handNumber`, move the button, reset `ready`, `result`, `lastAction` and the board. `ready` outside `handOver` returns an error.

### getState(seat)
Fill every field of `PokerState`. Only `seat`'s own hole cards appear in `yourHoleCards`; `opponentHoleCards` is null unless the hand ended at showdown. `legal` is filled only when `toAct === seat`. `toAct` is null during `handOver`/`gameOver`. Chips are always conserved: `stacks A + B + pot + committed A + committed B === 2 × startingStack`.

### Engine tests must cover
Blinds posted and button acts first pre-flop; big blind's option to raise after a limp; non-button first post-flop; button alternation across hands; check/call/raise/fold legality and error messages; min-raise after a raise (e.g. 20 → raise to 60 → next min is 100); all-in and call, with the board run out to showdown; a short all-in raise; a blind that puts a player all-in (refund); fold awards the pot and hides cards; split pot with an odd chip; game over when a stack hits 0; chip conservation after every action in a scripted hand; `ready` flow. Use a rigged `shuffle` that returns a hand-built deck so outcomes are known.

## 4. Server — `server.js`

- `create_room` accepts an optional `game: "war" | "poker"` (default `"war"`; anything else → error "Unknown game."). Store the game type with the room. `room_created` and `room_joined` include `game`.
- When the second player joins a poker room, create a `PokerEngine` (pass `engineOptions.poker` if given to `createWarServer`, e.g. `createWarServer({ engineOptions: { poker: { shuffle } } })`; War keeps using the existing `engineOptions` as before) and send both players their state.
- Poker client → server payloads inside `game_message`:
  - `{ kind: "action", action: PokerAction }` → `engine.act(seat, action)`
  - `{ kind: "next_hand" }` → `engine.ready(seat)`
  - `flip` in a poker room (or `action`/`next_hand` in a War room) → error "That move isn't part of this game."
- Server → client: `{ type: "game_message", payload: { kind: "poker_state", view } }` after every successful change, to each player with their own view. `view` is `getState(seat)` converted to be relative to the player, with suit letters turned into symbols (♠♥♦♣) like War:
  ```
  { phase, handNumber, smallBlind, bigBlind,
    youAreButton, yourName, opponentName,
    yourCards, opponentCards (null unless showdown), board,
    pot, yourStack, opponentStack, yourCommitted, opponentCommitted,
    yourTurn, legal (or null), lastAction: { who: "you"|"opponent", type, amount } | null,
    result: { reason, winners: ("you"|"opponent")[], youWon, opponentWon,
              yourHand: name | null, opponentHand: name | null } | null,
    youReady, opponentReady, winner: "you"|"opponent"|null }
  ```
  `youWon`/`opponentWon` are chips taken from the pot that hand.
- Engine errors go back to the sender only as `{ type: "error", message }`.
- On game over, call `recordMatch(db, winnerId, loserId)` once, exactly as War does.
- No commentary for poker in v1. Clients may not send `poker_state`.
- Leaving or disconnecting ends the game for both players, same as War.

Server tests (add to `test/server.test.js`, reusing its helpers): create a poker room and get `game: "poker"` back; both players receive a `poker_state` when the second joins, each seeing only their own two cards; acting out of turn returns an error; a fold ends the hand and `next_hand` from both deals hand 2; `flip` in a poker room is rejected; War rooms still work with no `game` field; a full game to game over records a win and a loss (use an all-in pre-flop with a rigged shuffle).

## 5. Client — `gui/`

- Lobby: next to **Create room**, add a game picker (War / Poker). Joining needs no picker: the room's game comes back in `room_joined`.
- Put the poker table in `gui/src/poker.ts` (render function + action wiring) so `main.ts` only switches between the War table and the poker table based on the room's game. Add the poker view types to `gui/src/types.ts`.
- Poker table shows: both names and stacks, a "D" marker on the button, the opponent's two cards face down (face up after a showdown), the five board slots, the pot plus both players' chips on this street, your two cards face up, and a status line ("Your turn", "Waiting for <name>…", "<name> raised to 120", the hand result such as "You win 240 with Full house, Kings over Sevens").
- Controls when it is your turn: **Fold**, **Check** or **Call N**, and **Bet/Raise** with a number input (min/max from `legal`, defaulting to `minRaiseTo`) plus **All-in**. Disable anything not legal. During `handOver` show **Next hand** (and "Waiting for <name>…" once you've pressed it). On `gameOver` show who won and refresh the win/loss record like War does.
- Reuse the existing card rendering and styling where you can. It has to work at phone width.
- `npm run build` must type-check cleanly.

## 6. Done means

- `npm test` passes (it builds the client first) and `npm run typecheck` is clean.
- Two browsers can create and join a poker room and play hands to game over; War is unchanged.
- README gains a short Poker section (rules summary + protocol messages) and the project layout lists `src/poker/` and this spec.
