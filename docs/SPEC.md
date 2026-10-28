# WarBrowser specification

## AI commentator integration

The server calls Claude once, asynchronously, after the `WarEngine` resolves a round. The call is made by `ClaudeCommentator` in `server/src/commentator.ts`; it sends a compact card/result summary to `POST https://api.anthropic.com/v1/messages`.

The model is configurable with `ANTHROPIC_MODEL` and defaults to `claude-3-5-haiku-latest`. `ANTHROPIC_API_KEY` is required. The request is capped at 80 output tokens and eight seconds. Missing keys and API failures are logged and do not interrupt gameplay.

The WebSocket handler broadcasts the authoritative `state` immediately, then broadcasts `{ type: "commentary", text, roundId }` to both players when Claude responds. Commentary is therefore best-effort and never delays a flip or round resolution. The browser keeps the latest commentary in its round commentary panel.

To run locally:

```powershell
npm install
npm run build
$env:ANTHROPIC_API_KEY = "your-key"
npm start
```

Open `http://localhost:3000/?room=demo` in two browsers. The client sends the room ID from the URL and both players must press **Flip** before a round resolves.
