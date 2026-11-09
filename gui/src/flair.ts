// Lobby presentation for each game: an icon, accent colors and an optional
// badge. Purely cosmetic; a game missing here gets the fallback look.

export type GameFlair = { icon: string; a: string; b: string; badge?: string };

const FALLBACK: GameFlair = { icon: "🎲", a: "#ff7a59", b: "#ff7a59" };

const FLAIR: Record<string, GameFlair> = {
  war: { icon: "⚔️", a: "#ff7a59", b: "#ff7a59", badge: "Popular" },
  tictactoe: { icon: "⭕", a: "#4cc9f0", b: "#4cc9f0", badge: "Quick" },
  uno: { icon: "🃏", a: "#ffc53d", b: "#ffc53d", badge: "Party" },
  crazy8: { icon: "🎱", a: "#b47cff", b: "#b47cff" },
  gofish: { icon: "🐟", a: "#3dd6b0", b: "#3dd6b0" },
  rps: { icon: "✊", a: "#ff8a3d", b: "#ff8a3d", badge: "Quick" },
  goofspiel: { icon: "🎯", a: "#6b8cff", b: "#6b8cff" },
  connect4: { icon: "🔴", a: "#ff4d6d", b: "#ff4d6d" },
  dots: { icon: "🔲", a: "#8fd14f", b: "#8fd14f" },
  battleship: { icon: "🚢", a: "#3fa7ff", b: "#3fa7ff" }
};

export function flairFor(id: string | null): GameFlair {
  return (id && FLAIR[id]) || FALLBACK;
}

/** A stable hue per username, for avatar bubbles. */
export function hueFor(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
