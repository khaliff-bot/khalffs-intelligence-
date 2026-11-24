const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatMessages = document.getElementById("chat-messages");
const sendButton = document.getElementById("send-button");

let conversation = [];

function addMessage(text, sender) {
  const message = document.createElement("div");
  message.className = `message ${sender}`;
  message.textContent = text;
  chatMessages.appendChild(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return message;
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = chatInput.value.trim();
  if (!message) return;

  addMessage(message, "user");
  conversation.push({ role: "user", content: message });

  chatInput.value = "";
  sendButton.disabled = true;
  sendButton.textContent = "Thinking...";

  const loadingMessage = addMessage("KI's is thinking...", "assistant");

  try {
    const response = await fetch("/.netlify/functions/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: conversation
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Something went wrong.");
    }

    loadingMessage.textContent = data.reply;
    conversation.push({
      role: "assistant",
      content: data.reply
    });

  } catch (error) {
    loadingMessage.textContent =
      "Sorry, KI's couldn't connect right now. Please try again.";
    console.error(error);
  } finally {
    sendButton.disabled = false;
    sendButton.textContent = "Send";
    chatInput.focus();
  }
});
