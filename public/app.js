
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatMessages = document.getElementById("chat-messages");
const sendButton = document.getElementById("send-button");
const newChatButton = document.getElementById("new-chat");

let conversation = [];

const STORAGE_KEY = "kis-chat-history";

const style = document.createElement("style");
style.textContent = `
#chat-messages {
  overflow-y: auto;
  max-height: 65vh;
  padding: 15px 5px;
}

.message-row {
  display: flex;
  flex-direction: column;
  max-width: 85%;
  margin-bottom: 18px;
}

.message-row.user {
  align-self: flex-end;
  margin-left: auto;
  align-items: flex-end;
}

.message-row.assistant {
  align-self: flex-start;
  align-items: flex-start;
}

.message {
  padding: 14px 17px;
  border-radius: 15px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.message.user {
  background: #1766b5;
  color: white;
  border-bottom-right-radius: 4px;
}

.message.assistant {
  background: #17243a;
  color: #e8efff;
  border: 1px solid #293e5c;
  border-bottom-left-radius: 4px;
}

.message-actions {
  margin-top: 6px;
}

.copy-button {
  background: transparent;
  color: #79baff;
  border: 1px solid #294568;
  border-radius: 7px;
  padding: 5px 10px;
  cursor: pointer;
  font-size: 12px;
}

.copy-button:hover {
  background: #1b3555;
}

.message-label {
  font-size: 11px;
  color: #7892b5;
  margin-bottom: 5px;
}

#send-button:disabled {
  opacity: .6;
  cursor: wait;
}

.typing {
  color: #75b8ff;
  animation: pulse 1.2s infinite;
}

@keyframes pulse {
  50% { opacity: .35; }
}
`;
document.head.appendChild(style);

function saveConversation() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(conversation)
    );
  } catch (error) {
    console.error("Could not save chat history", error);
  }
}

function addMessage(text, sender, showCopy = false) {
  const row = document.createElement("div");
  row.className = `message-row ${sender}`;

  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = sender === "user" ? "You" : "KI's";

  const bubble = document.createElement("div");
  bubble.className = `message ${sender}`;
  bubble.textContent = text;

  row.appendChild(label);
  row.appendChild(bubble);

  if (showCopy) {
    const actions = document.createElement("div");
    actions.className = "message-actions";

    const copyButton = document.createElement("button");
    copyButton.className = "copy-button";
    copyButton.textContent = "Copy response";

    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(text);
        copyButton.textContent = "Copied!";
      } catch {
        copyButton.textContent = "Copy unavailable";
      }
    });

    actions.appendChild(copyButton);
    row.appendChild(actions);
  }

  chatMessages.appendChild(row);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  return bubble;
}

function renderHistory() {
  chatMessages.innerHTML = "";

  conversation.forEach(message => {
    addMessage(
      message.content,
      message.role === "user" ? "user" : "assistant",
      message.role === "assistant"
    );
  });
}

try {
  const saved = JSON.parse(
    localStorage.getItem(STORAGE_KEY) || "[]"
  );

  if (
    Array.isArray(saved) &&
    saved.every(item =>
      item &&
      ["user", "assistant"].includes(item.role) &&
      typeof item.content === "string"
    )
  ) {
    conversation = saved;
  }
} catch {
  conversation = [];
}

renderHistory();

newChatButton.addEventListener("click", () => {
  conversation = [];
  localStorage.removeItem(STORAGE_KEY);
  chatMessages.innerHTML = "";
  chatInput.focus();
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = chatInput.value.trim();
  if (!message || sendButton.disabled) return;

  addMessage(message, "user");

  conversation.push({
    role: "user",
    content: message
  });

  saveConversation();

  chatInput.value = "";
  sendButton.disabled = true;
  sendButton.textContent = "Thinking...";

  const loadingMessage = addMessage(
    "KI's is thinking...",
    "assistant"
  );

  loadingMessage.classList.add("typing");

  try {
    const response = await fetch(
      "/.netlify/functions/chat",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: conversation
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Something went wrong."
      );
    }

    if (typeof data.reply !== "string") {
      throw new Error("Invalid response from KI's.");
    }

    loadingMessage.classList.remove("typing");
    loadingMessage.textContent = data.reply;

    const row = loadingMessage.parentElement;
    const actions = document.createElement("div");
    actions.className = "message-actions";

    const copyButton = document.createElement("button");
    copyButton.className = "copy-button";
    copyButton.textContent = "Copy response";

    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(data.reply);
        copyButton.textContent = "Copied!";
      } catch {
        copyButton.textContent = "Copy unavailable";
      }
    });

    actions.appendChild(copyButton);
    row.appendChild(actions);

    conversation.push({
      role: "assistant",
      content: data.reply
    });

    saveConversation();

  } catch (error) {
    loadingMessage.classList.remove("typing");
    loadingMessage.textContent =
      "Sorry, KI's couldn't connect right now. Please try again.";

    console.error(error);
  } finally {
    sendButton.disabled = false;
    sendButton.textContent = "Send";
    chatInput.focus();
  }
});
