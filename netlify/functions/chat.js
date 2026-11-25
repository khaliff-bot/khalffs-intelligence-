
/* =========================================
   KI'S — SECURE CHAT BACKEND
   Netlify Function
========================================= */

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  };

  const send = (statusCode, data) => ({
    statusCode,
    headers,
    body: JSON.stringify(data)
  });

  if (event.httpMethod !== "POST") {
    return send(405, { error: "Method not allowed." });
  }

  try {
    if (!event.body || event.body.length > 5_500_000) {
      return send(413, { error: "The request is too large." });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY;

    const openaiKey = process.env.OPENAI_API_KEY;

    if (!supabaseUrl || !supabaseKey || !openaiKey) {
      console.error("Missing server configuration.");
      return send(500, {
        error: "KI's server configuration is incomplete."
      });
    }

    /* VERIFY LOGIN */

    const authHeader =
      event.headers.authorization ||
      event.headers.Authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return send(401, { error: "Please log in first." });
    }

    const token = authHeader.slice(7);

    const authResponse = await fetch(
      `${supabaseUrl}/auth/v1/user`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!authResponse.ok) {
      return send(401, {
        error: "Your session is invalid. Please log in again."
      });
    }

    /* READ REQUEST */

    let body;

    try {
      body = JSON.parse(event.body);
    } catch {
      return send(400, { error: "Invalid request data." });
    }

    const messages = body.messages;
    const attachments = Array.isArray(body.attachments)
      ? body.attachments
      : [];

    if (
      !Array.isArray(messages) ||
      messages.length === 0 ||
      messages.length > 20
    ) {
      return send(400, { error: "Invalid message history." });
    }

    if (attachments.length > 4) {
      return send(400, {
        error: "Please attach no more than four files at once."
      });
    }

    const safeMessages = messages
      .filter(message =>
        message &&
        ["user", "assistant"].includes(message.role) &&
        typeof message.content === "string"
      )
      .map(message => ({
        role: message.role,
        content: message.content.slice(0, 4000)
      }));

    if (!safeMessages.length) {
      return send(400, { error: "No valid messages found." });
    }

    /* PREPARE CONVERSATION */

    const input = safeMessages.map(message => ({
      role: message.role,
      content: message.role === "user"
        ? [{ type: "input_text", text: message.content }]
        : message.content
    }));

    const lastUserMessage = [...input]
      .reverse()
      .find(message => message.role === "user");

    if (!lastUserMessage) {
      return send(400, { error: "A user message is required." });
    }

    /* PROCESS ATTACHMENTS */

    for (const file of attachments) {
      if (
        !file ||
        typeof file.name !== "string" ||
        typeof file.type !== "string" ||
        typeof file.data !== "string"
      ) {
        return send(400, { error: "An attachment is invalid." });
      }

      if (
        file.data.length > 5_000_000 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data)
      ) {
        return send(400, { error: "An attachment is too large or invalid." });
      }

      const buffer = Buffer.from(file.data, "base64");

      if (!buffer.length || buffer.length > 4 * 1024 * 1024) {
        return send(400, {
          error: "Each attachment must be no larger than 4 MB."
        });
      }

      const mime = file.type.toLowerCase();
      const filename = file.name.slice(0, 150);

      /* IMAGES */

      if (mime.startsWith("image/")) {
        const allowedImages = [
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/gif"
        ];

        if (!allowedImages.includes(mime)) {
          return send(400, {
            error: "Please use a JPG, PNG, WEBP or GIF image."
          });
        }

        lastUserMessage.content.push({
          type: "input_image",
          image_url: `data:${mime};base64,${file.data}`,
          detail: "auto"
        });

        continue;
      }

      /* PDF DOCUMENTS */

      if (mime === "application/pdf" || /\.pdf$/i.test(filename)) {
        lastUserMessage.content.push({
          type: "input_file",
          filename,
          file_data: `data:application/pdf;base64,${file.data}`
        });

        continue;
      }

      /* TEXT AND CSV DOCUMENTS */

      if (
        mime.startsWith("text/") ||
        /\.(txt|csv)$/i.test(filename)
      ) {
        const textContent = buffer.toString("utf8").slice(0, 30000);

        lastUserMessage.content.push({
          type: "input_text",
          text: `\n\nUploaded document: ${filename}\n${textContent}`
        });

        continue;
      }

      /* AUDIO RECORDINGS */

      if (mime.startsWith("audio/")) {
        const allowedAudio = [
          "audio/webm",
          "audio/wav",
          "audio/x-wav",
          "audio/mpeg",
          "audio/mp3",
          "audio/mp4",
          "audio/m4a",
          "audio/ogg",
          "audio/mpga"
        ];

        if (!allowedAudio.includes(mime)) {
          return send(400, {
            error: "This audio format is not supported."
          });
        }

        const form = new FormData();

        const audioBlob = new Blob([buffer], {
          type: mime
        });

        form.append("file", audioBlob, filename);
        form.append("model", "gpt-4o-mini-transcribe");

        const transcriptionResponse = await fetch(
          "https://api.openai.com/v1/audio/transcriptions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openaiKey}`
            },
            body: form
          }
        );

        const transcription = await transcriptionResponse.json();

        if (!transcriptionResponse.ok) {
          console.error("Transcription error:", transcription);
          return send(502, {
            error: "KI's could not transcribe that audio."
          });
        }

        lastUserMessage.content.push({
          type: "input_text",
          text: `\n\nAudio recording transcript:\n${String(
            transcription.text || ""
          ).slice(0, 12000)}`
        });

        continue;
      }

      return send(400, {
        error: `This file type is not supported: ${filename}`
      });
    }

    /* ASK KI'S */

    const aiResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model: "gpt-5.5",
          store: false,
          instructions:
            "You are KI's, short for Khalffs Intelligence, created by Alexander Olaoluwa. " +
            "You are a friendly, intelligent, respectful and helpful AI assistant. " +
            "Help users learn, understand questions, work with documents and images, " +
            "and explore ideas. Be honest about your capabilities. " +
            "Never claim to have examined an attachment unless it was actually provided. " +
            "When a user provides an image or document, carefully use its contents " +
            "when answering. Keep answers clear and useful.",
          input,
          max_output_tokens: 1000
        })
      }
    );

    const result = await aiResponse.json();

    if (!aiResponse.ok) {
      console.error("OpenAI response error:", result);
      return send(502, {
        error: "KI's AI service could not answer. Please try again."
      });
    }

    const reply = (result.output || [])
      .flatMap(item => item.content || [])
      .filter(item => item.type === "output_text")
      .map(item => item.text)
      .join("\n");

    return send(200, {
      reply: reply || "I couldn't produce a reply. Please try again."
    });

  } catch (error) {
    console.error("KI's server error:", error);

    return send(500, {
      error: "Something went wrong. Please try again."
    });
  }
};
