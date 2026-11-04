// Preview-only pretend server: the same room rules as server.js, running the
// real games from src/games/ inside the preview page instead of on Node.
import { DEFAULT_GAME_ID, findGame } from "../../src/games/index.ts";
import type { GameDefinition, GameSession } from "../../src/games/types.ts";
import type { RoundSummary } from "../../src/engine/types.ts";

type Event = Record<string, unknown> & { type: string };
type Message = Record<string, unknown> & { type: string };

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RANKS: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };
const SUITS = { S: "♠", H: "♥", D: "♦", C: "♣" };

// Stands in for the Claude commentator, so the preview needs no API key.
const commentator = {
  async describe(s: RoundSummary) {
    const card = (c: RoundSummary["cardA"]) => `${RANKS[c.rank] ?? c.rank}${SUITS[c.suit]}`;
    const who = s.winner === null ? "Nobody" : s.winner === "A" ? "Player 1" : "Player 2";
    return `(Sample commentary) Round ${s.round}: ${card(s.cardA)} vs ${card(s.cardB)}. ${who} takes it${s.wasWar ? " after a war" : ""}!`;
  },
};

export function createSimServer(names: string[], sendTo: (player: number, event: Event) => void) {
  const rooms = new Map<string, { game: GameDefinition; players: number[] }>();
  const games = new Map<string, { session: GameSession; seats: number[] }>();
  const playerRoom: (string | null)[] = names.map(() => null);

  function newCode() {
    let code;
    do code = Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
    while (rooms.has(code));
    return code;
  }

  function sendStates(code: string) {
    const game = games.get(code)!;
    const players = game.seats.map((p) => ({ username: names[p] }));
    game.seats.forEach((player, seat) =>
      sendTo(player, { type: "game_message", payload: { kind: "state", view: game.session.view(seat, players) } }),
    );
  }

  function leave(player: number) {
    const code = playerRoom[player];
    if (!code) return;
    playerRoom[player] = null;
    const room = rooms.get(code);
    if (!room) return;
    room.players = room.players.filter((p) => p !== player);
    games.delete(code);
    for (const p of room.players) sendTo(p, { type: "opponent_disconnected" });
    if (room.players.length === 0) rooms.delete(code);
  }

  function handle(player: number, msg: Message) {
    const err = (message: string) => sendTo(player, { type: "error", message });
    switch (msg.type) {
      case "create_room": {
        if (playerRoom[player]) return err("Leave your current room first.");
        const game = findGame(msg.gameId ?? DEFAULT_GAME_ID);
        if (!game) return err("That game doesn't exist.");
        const code = newCode();
        rooms.set(code, { game, players: [player] });
        playerRoom[player] = code;
        return sendTo(player, { type: "room_created", roomCode: code, username: names[player], gameId: game.id });
      }
      case "join_room": {
        if (playerRoom[player]) return err("Leave your current room first.");
        if (typeof msg.roomCode !== "string") return err("Enter a valid room code.");
        const code = msg.roomCode.trim().toUpperCase();
        const room = rooms.get(code);
        if (!room) return err("Room not found.");
        if (room.players.length >= room.game.players) return err("That room is full.");
        room.players.push(player);
        playerRoom[player] = code;
        sendTo(player, {
          type: "room_joined",
          roomCode: code,
          username: names[player],
          opponentUsername: names[room.players[0]],
          gameId: room.game.id,
        });
        for (const p of room.players) if (p !== player) sendTo(p, { type: "opponent_joined", username: names[player] });
        if (room.players.length < room.game.players) return;
        games.set(code, { session: room.game.create({ commentator, options: {} }), seats: [...room.players] });
        return sendStates(code);
      }
      case "game_message": {
        const code = playerRoom[player];
        const game = code ? games.get(code) : undefined;
        if (!code || !game) return err("Wait for another player to join before playing.");
        const payload = msg.payload as Record<string, unknown> | null;
        if (payload?.kind === "state" || payload?.kind === "commentary") return err("Only the server can send that.");
        const isObject = payload !== null && typeof payload === "object" && !Array.isArray(payload);
        const result = isObject ? game.session.act(game.seats.indexOf(player), payload) : null;
        if (!result) {
          for (const p of game.seats) if (p !== player) sendTo(p, { type: "game_message", payload });
          return;
        }
        if (!result.ok) return err(result.error);
        sendStates(code);
        if (result.commentary) {
          const { round } = result.commentary;
          void result.commentary.text.then((text) => {
            if (!text || games.get(code) !== game) return;
            for (const p of game.seats) sendTo(p, { type: "game_message", payload: { kind: "commentary", text, round } });
          });
        }
        return;
      }
      case "leave_room":
        leave(player);
        return sendTo(player, { type: "room_left" });
      default:
        return err("Unknown message type.");
    }
  }

  return { handle, leave, roomOf: (player: number) => playerRoom[player] };
}
