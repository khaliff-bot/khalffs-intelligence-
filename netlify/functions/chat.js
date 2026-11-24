
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "AI connection is not configured yet." })
    };
  }

  try {
    const { messages } = JSON.parse(event.body || "{}");

    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid message history." })
      };
    }

    const safeMessages = messages
      .filter((m) =>
        m &&
        ["user", "assistant"].includes(m.role) &&
        typeof m.content === "string"
      )
      .map((m) => ({
        role: m.role,
        content: m.content.slice(0, 4000)
      }));

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-6-luna",
        instructions: "You are KI's, a helpful, friendly AI assistant. Give clear, useful and respectful answers.",
        input: safeMessages,
        max_output_tokens: 800
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("AI provider error:", data);
      return {
        statusCode: 502,
        body: JSON.stringify({ error: "The AI service could not answer. Please try again." })
      };
    }

    const reply = (data.output || [])
      .flatMap((item) => item.content || [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text)
      .join("\n");

    return {
      statusCode: 200,
      body: JSON.stringify({
        reply: reply || "I couldn't produce a reply. Please try again."
      })
    };

  } catch (error) {
    console.error("KI's function error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Something went wrong. Please try again." })
    };
  }
};
