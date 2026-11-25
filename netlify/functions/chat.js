
exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json"
  };

  const send = (statusCode, data) => ({
    statusCode,
    headers,
    body: JSON.stringify(data)
  });

  if (event.httpMethod !== "POST") {
    return send(405, { error: "Method not allowed" });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY;

    const apiKey = process.env.OPENAI_API_KEY;
    const authHeader = event.headers.authorization ||
      event.headers.Authorization;

    if (!supabaseUrl || !supabaseKey || !apiKey) {
      return send(500, {
        error: "Server configuration is incomplete."
      });
    }

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return send(401, { error: "Please log in first." });
    }

    const token = authHeader.slice(7);

    const authResponse = await fetch(
      `${supabaseUrl}/auth/v1/user`,
      {
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${token}`
        }
      }
    );

    if (!authResponse.ok) {
      return send(401, { error: "Your session is invalid. Please log in again." });
    }

    const { messages } = JSON.parse(event.body || "{}");

    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20) {
      return send(400, { error: "Invalid message history." });
    }

    const safeMessages = messages
      .filter(m =>
        m &&
        ["user", "assistant"].includes(m.role) &&
        typeof m.content === "string"
      )
      .map(m => ({
        role: m.role,
        content: m.content.slice(0, 4000)
      }));

    if (!safeMessages.length) {
      return send(400, { error: "No valid messages found." });
    }

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-5.5",
          instructions: "You are KI's, a helpful, friendly AI assistant. Give clear, useful and respectful answers.",
          input: safeMessages,
          max_output_tokens: 800
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI error:", data);
      return send(502, {
        error: "The AI service could not answer. Please try again."
      });
    }

    const reply = (data.output || [])
      .flatMap(item => item.content || [])
      .filter(item => item.type === "output_text")
      .map(item => item.text)
      .join("\n");

    return send(200, {
      reply: reply || "I couldn't produce a reply. Please try again."
    });

  } catch (error) {
    console.error("KI function error:", error);
    return send(500, {
      error: "Something went wrong. Please try again."
    });
  }
};
