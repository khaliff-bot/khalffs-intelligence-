const KI_IDENTITY = `
You are KI's, also known as Khalffs Intelligence.

IDENTITY:
- Your full name is Khalffs Intelligence.
- Your short name is KI's.
- Your creator is Alexander Olaoluwa.
- You are an AI assistant built for the KI's platform.
- Your underlying AI technology is powered by OpenAI.
- Never falsely claim to be a human or an independent AI model.

PERSONALITY:
- Friendly, intelligent, respectful and confident.
- Communicate naturally and clearly.
- Be helpful, patient and thoughtful.
- Adapt your explanations to the user's level.
- Admit when you do not know something.

CAPABILITIES:
- Answer questions and explain topics.
- Understand and analyze uploaded images.
- Read and analyze supported documents.
- Understand supported audio inputs.
- Analyze supplied video frames and visual content.
- Help with writing, research, learning and productivity.
- Never claim to have opened or analyzed a file that you did not receive.

IDENTITY RULE:
When asked your name, say you are KI's.
When asked your full name, say Khalffs Intelligence.
When asked who created you, say Alexander Olaoluwa.

Always represent the KI's brand professionally.
`;

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

    const authHeader =
      event.headers?.authorization ||
      event.headers?.Authorization;

    if (!supabaseUrl || !supabaseKey || !apiKey) {
      return send(500, {
        error: "Server configuration is incomplete."
      });
    }

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return send(401, {
        error: "Please log in first."
      });
    }

    const token = authHeader.slice(7);

    // Verify Supabase session
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
      return send(401, {
        error: "Your session is invalid. Please log in again."
      });
    }

    // Decode request
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : event.body || "{}";

    if (Buffer.byteLength(rawBody, "utf8") > 5 * 1024 * 1024) {
      return send(413, {
        error: "Your upload is too large. Please use a smaller file."
      });
    }

    const { messages } = JSON.parse(rawBody);

    if (
      !Array.isArray(messages) ||
      messages.length === 0 ||
      messages.length > 20
    ) {
      return send(400, {
        error: "Invalid message history."
      });
    }

    // Validate incoming message content
    const safeMessages = messages
      .filter(m =>
        m &&
        ["user", "assistant"].includes(m.role)
      )
      .map(m => {
        if (typeof m.content === "string") {
          return {
            role: m.role,
            content: m.content.slice(0, 12000)
          };
        }

        if (!Array.isArray(m.content)) {
          return null;
        }

        const content = m.content
          .map(item => {
            if (!item || typeof item !== "object") {
              return null;
            }

            // Text
            if (
              item.type === "input_text" &&
              typeof item.text === "string"
            ) {
              return {
                type: "input_text",
                text: item.text.slice(0, 12000)
              };
            }

            // Images and video frames
            if (
              m.role === "user" &&
              item.type === "input_image" &&
              typeof item.image_url === "string" &&
              item.image_url.length <= 4000000 &&
              /^https:\/\//.test(item.image_url) ||
              (
                m.role === "user" &&
                item.type === "input_image" &&
                typeof item.image_url === "string" &&
                item.image_url.length <= 4000000 &&
                /^data:image\/(jpeg|jpg|png|webp);base64,/.test(item.image_url)
              )
            ) {
              return {
                type: "input_image",
                image_url: item.image_url,
                detail: "auto"
              };
            }

            // Documents
            if (
              m.role === "user" &&
              item.type === "input_file" &&
              typeof item.file_data === "string" &&
              item.file_data.length <= 3500000 &&
              typeof item.filename === "string" &&
              /\.(pdf|txt|md|docx|pptx)$/i.test(item.filename) &&
              /^data:[^;]+;base64,/.test(item.file_data)
            ) {
              return {
                type: "input_file",
                filename: item.filename.slice(0, 150),
                file_data: item.file_data
              };
            }

            // Audio
            if (
              m.role === "user" &&
              item.type === "input_audio" &&
              typeof item.data === "string" &&
              item.data.length <= 3500000 &&
              ["mp3", "wav"].includes(item.format)
            ) {
              return {
                type: "input_audio",
                input_audio: {
                  data: item.data,
                  format: item.format
                }
              };
            }

            return null;
          })
          .filter(Boolean);

        if (!content.length) {
          return null;
        }

        return {
          role: m.role,
          content
        };
      })
      .filter(Boolean);

    if (!safeMessages.length) {
      return send(400, {
        error: "No valid messages found."
      });
    }

    // Send request to OpenAI
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
          instructions: KI_IDENTITY,
          input: safeMessages,
          max_output_tokens: 1200
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI error:", data);

      return send(502, {
        error: "KI's could not answer. Please try again."
      });
    }

    const reply = (data.output || [])
      .flatMap(item => item.content || [])
      .filter(item => item.type === "output_text")
      .map(item => item.text)
      .join("\n");

    return send(200, {
      reply: reply ||
        "KI's couldn't produce a reply. Please try again."
    });

  } catch (error) {
    console.error("KI function error:", error);

    return send(500, {
      error: "Something went wrong. Please try again."
    });
  }
};
