// Preview-only pretend server: the same room rules as server.js, running the
// real games from src/games/ inside the preview page instead of on Node.
import { DEFAULT_GAME_ID, findGame } from "../../src/games/index.ts";
import type { GameEngine } from "../../src/engine/GameEngine.ts";
import type { GameModule, GameModuleContext } from "../../src/games/GameModule.ts";

type Event = Record<string, unknown> & { type: string };
type Message = Record<string, unknown> & { type: string };

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// Stands in for the Claude commentator, so the preview needs no API key.
const commentator = {
  async describe(prompt: string) {
    return `(Sample commentary) ${prompt.slice(0, 120)}`;
  },
};

type RunningGame = {
  module: GameModule;
  engine: GameEngine<unknown, unknown>;
  context: GameModuleContext;
  seats: number[];
};

export function createSimServer(names: string[], sendTo: (player: number, event: Event) => void) {
  const rooms = new Map<string, { game: GameModule; players: number[]; started: boolean }>();
  const games = new Map<string, RunningGame>();
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
      sendTo(player, {
        type: "game_message",
        payload: { kind: "state", view: game.module.toView(game.engine, seat, players) },
      }),
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
    room.started = false;
    for (const p of room.players) sendTo(p, { type: "player_left", username: names[player] });
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
        rooms.set(code, { game, players: [player], started: false });
        playerRoom[player] = code;
        return sendTo(player, {
          type: "room_created",
          roomCode: code,
          gameId: game.id,
          host: names[player],
          players: [names[player]],
          min: game.players.min,
          max: game.players.max,
        });
      }
      case "join_room": {
        if (playerRoom[player]) return err("Leave your current room first.");
        if (typeof msg.roomCode !== "string") return err("Enter a valid room code.");
        const code = msg.roomCode.trim().toUpperCase();
        const room = rooms.get(code);
        if (!room) return err("Room not found.");
        if (room.players.length >= room.game.players.max) return err("That room is full.");
        if (room.started) return err("That game has already started.");
        room.players.push(player);
        playerRoom[player] = code;
        const rosterNames = room.players.map((p) => names[p]);
        sendTo(player, {
          type: "room_joined",
          roomCode: code,
          gameId: room.game.id,
          host: rosterNames[0],
          players: rosterNames,
          min: room.game.players.min,
          max: room.game.players.max,
        });
        for (const p of room.players) if (p !== player) sendTo(p, { type: "players_update", players: rosterNames });
        return;
      }
      case "start_game": {
        const code = playerRoom[player];
        const room = code ? rooms.get(code) : undefined;
        if (!code || !room) return err("Join a room first.");
        if (room.players[0] !== player) return err("Only the host can start the game.");
        if (room.started) return err("That game has already started.");
        if (room.players.length < room.game.players.min) {
          return err(`This game needs at least ${room.game.players.min} players.`);
        }
        room.started = true;
        const context = { commentator, options: {}, players: room.players.length };
        games.set(code, {
          module: room.game,
          engine: room.game.createEngine(context),
          context,
          seats: [...room.players],
        });
        return sendStates(code);
      }
      case "game_message": {
        const code = playerRoom[player];
        const game = code ? games.get(code) : undefined;
        if (!code || !game) return err("Wait for another player to join before playing.");
        const payload = msg.payload as Record<string, unknown> | null;
        if (payload?.kind === "state" || payload?.kind === "commentary") return err("Only the server can send that.");
        const isObject = payload !== null && typeof payload === "object" && !Array.isArray(payload);
        const result = isObject
          ? game.module.handleAction(game.engine, game.seats.indexOf(player), payload, game.context)
          : null;
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
