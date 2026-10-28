const statusElement = document.querySelector("#status");
const roomCodeInput = document.querySelector("#room-code");
const createButton = document.querySelector("#create-room");
const joinButton = document.querySelector("#join-room");
const leaveButton = document.querySelector("#leave-room");
const shareElement = document.querySelector("#share-code");
const messageForm = document.querySelector("#game-message-form");
const messageInput = document.querySelector("#game-message");
const messagesElement = document.querySelector("#messages");
let connectedToRoom = false;
let opponentConnected = false;

const connection = new WarConnection({
  onEvent(message) {
    if (message.type === "connected") {
      statusElement.textContent = "Connected to the server. Create or join a room.";
      updateControls();
      return;
    }
    if (message.type === "disconnected") {
      connectedToRoom = false;
      opponentConnected = false;
      updateControls();
      statusElement.textContent = "Disconnected from the server.";
      return;
    }
    if (message.type === "room_created" || message.type === "room_joined") {
      connectedToRoom = true;
      opponentConnected = message.type === "room_joined";
      roomCodeInput.value = message.roomCode;
      shareElement.textContent =
        message.type === "room_created"
          ? `Share this room code with your opponent: ${message.roomCode}`
          : `Joined room ${message.roomCode}.`;
      statusElement.textContent = opponentConnected
        ? "Room joined. You can start playing."
        : "Room created. Waiting for your opponent.";
      updateControls();
      return;
    }
    if (message.type === "opponent_joined") {
      opponentConnected = true;
      statusElement.textContent = "Your opponent has joined. You can start playing.";
      updateControls();
      return;
    }
    if (message.type === "opponent_disconnected") {
      opponentConnected = false;
      statusElement.textContent = "Your opponent disconnected.";
      updateControls();
      return;
    }
    if (message.type === "room_left") {
      connectedToRoom = false;
      opponentConnected = false;
      shareElement.textContent = "";
      statusElement.textContent = "You left the room.";
      updateControls();
      return;
    }
    if (message.type === "game_message") {
      appendMessage("Opponent", message.payload);
      return;
    }
    if (message.type === "error") {
      statusElement.textContent = message.message;
    }
  }
});

function updateControls() {
  createButton.disabled = connectedToRoom || !connection.socket ||
    connection.socket.readyState !== WebSocket.OPEN;
  joinButton.disabled = !roomCodeInput.value.trim() || createButton.disabled;
  leaveButton.disabled = !connectedToRoom;
  messageInput.disabled = !opponentConnected;
  messageForm.querySelector("button").disabled = !opponentConnected;
}

function appendMessage(sender, payload) {
  const item = document.createElement("li");
  item.textContent = `${sender}: ${JSON.stringify(payload)}`;
  messagesElement.prepend(item);
}

createButton.addEventListener("click", () => connection.createRoom());
joinButton.addEventListener("click", () => {
  connection.joinRoom(roomCodeInput.value);
});
leaveButton.addEventListener("click", () => connection.leaveRoom());
messageForm.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const payload = JSON.parse(messageInput.value);
    connection.sendGameMessage(payload);
    appendMessage("You", payload);
    messageInput.value = "";
  } catch (error) {
    statusElement.textContent =
      error instanceof SyntaxError
        ? "Game message must be valid JSON."
        : error.message;
  }
});
roomCodeInput.addEventListener("input", () => {
  joinButton.disabled = !roomCodeInput.value.trim() || !connection.socket ||
    connection.socket.readyState !== WebSocket.OPEN || connectedToRoom;
});

connection.connect();
