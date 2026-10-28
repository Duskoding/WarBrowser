class WarConnection {
  constructor({ url = WarConnection.defaultUrl(), onEvent = () => {} } = {}) {
    this.url = url;
    this.onEvent = onEvent;
    this.socket = null;
  }

  static defaultUrl() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws`;
  }

  connect() {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.addEventListener("open", () => this.onEvent({ type: "connected" }));
    socket.addEventListener("message", (event) => {
      try {
        this.onEvent(JSON.parse(event.data));
      } catch {
        this.onEvent({ type: "error", message: "Received an invalid server message." });
      }
    });
    socket.addEventListener("close", () => this.onEvent({ type: "disconnected" }));
    socket.addEventListener("error", () => {
      this.onEvent({ type: "error", message: "Could not connect to the game server." });
    });
  }

  createRoom() {
    this.send({ type: "create_room" });
  }

  joinRoom(roomCode) {
    this.send({ type: "join_room", roomCode });
  }

  sendGameMessage(payload) {
    this.send({ type: "game_message", payload });
  }

  leaveRoom() {
    this.send({ type: "leave_room" });
  }

  disconnect() {
    this.socket?.close();
  }

  send(message) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Connect to the game server first.");
    }
    this.socket.send(JSON.stringify(message));
  }
}

window.WarConnection = WarConnection;
