// Shell-only effects: confetti, screen shake and the share sheet.

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const COLORS = ["#ffe14d", "#ff2e88", "#2ef2ff", "#8cff5a", "#8b5cff", "#ff9a3d"];

type Piece = { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; c: string };

/** Fire a burst of confetti from both bottom corners. */
export function confetti(durationMs = 2600) {
  if (reducedMotion()) return;
  const canvas = document.createElement("canvas");
  canvas.className = "confetti";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  const pieces: Piece[] = [];
  const launch = (fromLeft: boolean) => {
    for (let i = 0; i < 90; i++) {
      const angle = (fromLeft ? -60 : -120) + (Math.random() - 0.5) * 50;
      const speed = 9 + Math.random() * 11;
      pieces.push({
        x: fromLeft ? 0 : width,
        y: height * 0.85,
        vx: Math.cos((angle * Math.PI) / 180) * speed,
        vy: Math.sin((angle * Math.PI) / 180) * speed,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.35,
        w: 6 + Math.random() * 6,
        h: 10 + Math.random() * 8,
        c: COLORS[Math.floor(Math.random() * COLORS.length)]
      });
    }
  };
  launch(true);
  launch(false);

  const start = performance.now();
  const frame = (now: number) => {
    const elapsed = now - start;
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, elapsed - durationMs * 0.6) / (durationMs * 0.4));
    for (const p of pieces) {
      p.vy += 0.32;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
      ctx.restore();
    }
    if (elapsed < durationMs) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

export function shake() {
  if (reducedMotion()) return;
  document.body.classList.remove("shake");
  // Force a reflow so the animation restarts when shaken twice in a row.
  void document.body.offsetWidth;
  document.body.classList.add("shake");
  window.setTimeout(() => document.body.classList.remove("shake"), 500);
}

/**
 * Open the native share sheet when the browser has one (mostly phones).
 * Returns false, without doing anything, when the caller should copy instead.
 * Call it straight from a click so the browser keeps the user gesture.
 */
export function nativeShare(data: { title: string; text: string; url: string }): boolean {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (!coarse || !navigator.share || (navigator.canShare && !navigator.canShare(data))) return false;
  // Closing the sheet rejects with AbortError; that is the person's choice.
  navigator.share(data).catch(() => undefined);
  return true;
}
