document.addEventListener("DOMContentLoaded", () => {
  const chatForm = document.querySelector("#chat-form");
  const chatInput = document.querySelector("#chat-input");
  const chatMessages = document.querySelector("#chat-messages");
  const sendButton = document.querySelector("#send-button");

  if (!chatForm || !chatInput || !chatMessages) {
    console.error("KI: Chat elements not found.");
    return;
  }

  function addMessage(text, sender) {
    const message = document.createElement("div");
    message.className = `message ${sender}`;
    message.textContent = text;
    chatMessages.appendChild(message);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const message = chatInput.value.trim();
    if (!message) return;

    addMessage(message, "user");
    chatInput.value = "";

    addMessage(
      "KI is ready to receive your message. AI connection is coming next.",
      "assistant"
    );
  });
});
