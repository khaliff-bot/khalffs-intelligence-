
/* =========================================
   KI'S — KHALFFS INTELLIGENCE
   Frontend application
========================================= */

const SUPABASE_URL = "https://ldromtbmwrdckwgtgvko.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_xwQIgH3LrYVar5Ka4BVvLw_wQ4Auv2g";

const $ = id => document.getElementById(id);

let supabase = null;
let user = null;
let currentChat = null;
let conversation = [];
let authMode = "login";
let attachments = [];
let recorder = null;
let recordingChunks = [];
let recordingStream = null;
let sending = false;

const configReady =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_PUBLISHABLE_KEY.startsWith("PASTE_");

if (configReady && window.supabase) {
  supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );
} else {
  $("auth-note").textContent = "KI's needs its Supabase configuration.";
  $("auth-submit").disabled = true;
}

/* AUTHENTICATION */

function setAuthMode(mode) {
  authMode = mode;
  $("login-tab").classList.toggle("active", mode === "login");
  $("signup-tab").classList.toggle("active", mode === "signup");
  $("auth-submit").textContent =
    mode === "login" ? "Log in" : "Create account";
  $("auth-password").autocomplete =
    mode === "login" ? "current-password" : "new-password";
}

$("login-tab").onclick = () => setAuthMode("login");
$("signup-tab").onclick = () => setAuthMode("signup");

$("auth-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!supabase) return;

  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;

  $("auth-submit").disabled = true;
  $("auth-note").textContent = "Please wait…";

  try {
    const result = authMode === "signup"
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) throw result.error;

    if (authMode === "signup" && !result.data.session) {
      $("auth-note").textContent =
        "Account created. Check your email to confirm, then log in.";
      return;
    }

    await startApp(result.data.user);
  } catch (error) {
    $("auth-note").textContent = error.message || "Authentication failed.";
  } finally {
    $("auth-submit").disabled = false;
  }
});

async function startApp(signedInUser) {
  user = signedInUser;
  $("user-email").textContent = user.email || "KI's user";
  $("auth-screen").classList.add("hidden");
  $("app").classList.remove("hidden");
  await loadChats();
  if (!currentChat) showWelcome();
}

async function loadSession() {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  if (data.session) await startApp(data.session.user);
}

/* CHAT HISTORY */

function showWelcome() {
  currentChat = null;
  conversation = [];
  $("chat-messages").innerHTML = "";
  $("welcome").classList.remove("hidden");
  document.querySelectorAll(".chat-item").forEach(item =>
    item.classList.remove("active")
  );
}

function addMessage(content, role, options = {}) {
  const element = document.createElement("div");
  element.className = `message ${role}`;
  element.textContent = content;

  if (role === "assistant" && options.speak !== false) {
    const speak = document.createElement("button");
    speak.type = "button";
    speak.className = "speak-button";
    speak.textContent = "🔊 Read aloud";
    speak.onclick = () => speakText(content);
    element.appendChild(speak);
  }

  $("chat-messages").appendChild(element);
  $("welcome").classList.add("hidden");
  $("chat-area").scrollTo(0, $("chat-area").scrollHeight);
  element.scrollIntoView({ block: "end", behavior: "smooth" });
  return element;
}

async function loadChats() {
  const { data, error } = await supabase
    .from("conversations")
    .select("id,title,updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error(error);
    return;
  }

  $("chat-list").innerHTML = "";

  (data || []).forEach(chat => {
    const row = document.createElement("div");
    row.className = "chat-item";

    const title = document.createElement("span");
    title.className = "chat-title";
    title.textContent = chat.title || "New chat";
    title.onclick = () => openChat(chat.id);

    const menu = document.createElement("button");
    menu.className = "chat-menu";
    menu.type = "button";
    menu.textContent = "⋯";
    menu.title = "Rename or delete";

    menu.onclick = async () => {
      const choice = prompt(
        "Enter a new title, or type DELETE to remove this chat:"
      );

      if (choice === null) return;

      if (choice.trim().toUpperCase() === "DELETE") {
        const { error } = await supabase
          .from("conversations")
          .delete()
          .eq("id", chat.id);

        if (error) {
          alert(error.message);
        } else {
          if (currentChat === chat.id) showWelcome();
          await loadChats();
        }
      } else if (choice.trim()) {
        const { error } = await supabase
          .from("conversations")
          .update({ title: choice.trim().slice(0, 80) })
          .eq("id", chat.id);

        if (error) alert(error.message);
        else await loadChats();
      }
    };

    row.append(title, menu);
    if (chat.id === currentChat) row.classList.add("active");
    $("chat-list").appendChild(row);
  });
}

async function openChat(id) {
  currentChat = id;
  conversation = [];
  attachments = [];
  renderAttachments();

  $("chat-messages").innerHTML = "";
  $("welcome").classList.add("hidden");

  const { data, error } = await supabase
    .from("messages")
    .select("id,role,content")
    .eq("conversation_id", id)
    .order("created_at");

  if (error) {
    alert(error.message);
    return;
  }

  (data || []).forEach(message => {
    conversation.push({
      role: message.role,
      content: message.content
    });
    addMessage(message.content, message.role);
  });

  await loadChats();
  $("sidebar").classList.remove("open");
}

async function saveMessage(chatId, role, content) {
  const { error } = await supabase.from("messages").insert({
    conversation_id: chatId,
    role,
    content
  });
  if (error) throw error;
}

$("new-chat").onclick = () => {
  clearAttachments();
  showWelcome();
  $("sidebar").classList.remove("open");
};

$("menu-toggle").onclick = () =>
  $("sidebar").classList.toggle("open");

/* FILE ATTACHMENTS */

$("attach-button").onclick = () => $("file-input").click();
$("camera-button").onclick = () => $("camera-input").click();
$("video-button").onclick = () => $("video-input").click();

$("file-input").onchange = event =>
  addSelectedFiles(event.target.files);

$("camera-input").onchange = event =>
  addSelectedFiles(event.target.files);

$("video-input").onchange = event =>
  addSelectedFiles(event.target.files);

$("audio-input").onchange = event =>
  addSelectedFiles(event.target.files);

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function addSelectedFiles(fileList) {
  const files = Array.from(fileList || []);

  for (const file of files) {
    if (file.size > 4 * 1024 * 1024) {
      alert(`${file.name} is larger than 4 MB. Please choose a smaller file.`);
      continue;
    }

    const type = file.type || "";
    const isAllowed =
      type.startsWith("image/") ||
      type.startsWith("audio/") ||
      type.startsWith("video/") ||
      type === "application/pdf" ||
      type.startsWith("text/") ||
      /\.(txt|pdf|csv)$/i.test(file.name);

    if (!isAllowed) {
      alert(`This file type is not supported yet: ${file.name}`);
      continue;
    }

    try {
      const base64 = await fileToBase64(file);

      attachments.push({
        name: file.name,
        type: type || "application/octet-stream",
        data: base64
      });
    } catch (error) {
      alert(`Could not read ${file.name}.`);
    }
  }

  eventSafeResetInputs();
  renderAttachments();
}

function eventSafeResetInputs() {
  $("file-input").value = "";
  $("camera-input").value = "";
  $("video-input").value = "";
  $("audio-input").value = "";
}

function renderAttachments() {
  const preview = $("attachment-preview");
  const list = $("attachment-list");

  list.innerHTML = "";
  preview.classList.toggle("hidden", attachments.length === 0);

  attachments.forEach((file, index) => {
    const item = document.createElement("div");
    item.className = "attachment-item";

    const name = document.createElement("span");
    name.textContent = file.name;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.title = "Remove attachment";
    remove.onclick = () => {
      attachments.splice(index, 1);
      renderAttachments();
    };

    item.append(name, remove);
    list.appendChild(item);
  });
}

function clearAttachments() {
  attachments = [];
  eventSafeResetInputs();
  renderAttachments();
}

$("clear-attachments").onclick = clearAttachments;

/* VIDEO FRAME EXTRACTION */

async function extractVideoFrame(file) {
  const url = URL.createObjectURL(file);

  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve;
      video.onerror = reject;
    });

    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1024 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    return dataUrl.split(",")[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* AUDIO RECORDING */

$("mic-button").onclick = async () => {
  if (recorder && recorder.state === "recording") {
    recorder.stop();
    $("mic-button").classList.remove("recording-active");
    $("mic-button").textContent = "🎙";
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    alert("Audio recording is not supported by this browser.");
    return;
  }

  try {
    recordingStream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    recordingChunks = [];
    recorder = new MediaRecorder(recordingStream);

    recorder.ondataavailable = event => {
      if (event.data.size) recordingChunks.push(event.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(recordingChunks, {
        type: recorder.mimeType || "audio/webm"
      });

      if (blob.size > 4 * 1024 * 1024) {
        alert("That recording is too large. Please record a shorter message.");
      } else {
        const file = new File(
          [blob],
          "KI-voice-message.webm",
          { type: blob.type }
        );
        await addSelectedFiles([file]);
      }

      recordingStream?.getTracks().forEach(track => track.stop());
      recordingStream = null;
    };

    recorder.start();
    $("mic-button").classList.add("recording-active");
    $("mic-button").textContent = "■";
  } catch (error) {
    alert("Microphone access was not granted.");
  }
};

/* SPOKEN REPLIES */

function speakText(text) {
  if (!("speechSynthesis" in window)) {
    alert("Spoken replies are not supported by this browser.");
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

/* SUGGESTION BUTTONS */

document.querySelectorAll(".suggestion[data-prompt]").forEach(button => {
  button.addEventListener("click", () => {
    $("chat-input").value = button.dataset.prompt;
    $("chat-form").requestSubmit();
  });
});

/* SEND MESSAGE */

$("chat-form").addEventListener("submit", async event => {
  event.preventDefault();

  if (sending || !user) return;

  const text = $("chat-input").value.trim();
  if (!text && attachments.length === 0) return;

  sending = true;
  $("send-button").disabled = true;

  const selectedAttachments = attachments.slice();
  const attachmentNames = selectedAttachments.map(file => file.name);
  const userText = text || "Please examine the attached file.";

  clearAttachments();
  $("chat-input").value = "";

  const displayText = attachmentNames.length
    ? `${userText}\n\nAttachments: ${attachmentNames.join(", ")}`
    : userText;

  addMessage(displayText, "user");

  conversation.push({
    role: "user",
    content: userText
  });

  const pending = addMessage("KI's is thinking…", "assistant");
  pending.classList.add("typing");

  try {
    if (!currentChat) {
      const title = userText.length > 42
        ? userText.slice(0, 42) + "…"
        : userText;

      const { data, error } = await supabase
        .from("conversations")
        .insert({ title })
        .select("id")
        .single();

      if (error) throw error;
      currentChat = data.id;
    }

    await saveMessage(currentChat, "user", displayText);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session) throw new Error("Please log in again.");

    const response = await fetch("/.netlify/functions/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        messages: conversation.slice(-20),
        attachments: selectedAttachments
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "KI's could not answer.");
    }

    const reply = result.reply || "I couldn't produce a reply. Please try again.";

    pending.textContent = reply;
    pending.classList.remove("typing");

    const speak = document.createElement("button");
    speak.type = "button";
    speak.className = "speak-button";
    speak.textContent = "🔊 Read aloud";
    speak.onclick = () => speakText(reply);
    pending.appendChild(speak);

    conversation.push({
      role: "assistant",
      content: reply
    });

    await saveMessage(currentChat, "assistant", reply);

    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", currentChat);

    await loadChats();

  } catch (error) {
    pending.textContent = `Sorry — ${error.message}`;
    pending.classList.remove("typing");
    console.error("KI's chat error:", error);
  } finally {
    sending = false;
    $("send-button").disabled = false;
    $("chat-input").focus();
  }
});

/* THEME */

function toggleTheme() {
  document.body.classList.toggle("light");
  localStorage.setItem(
    "kis-theme",
    document.body.classList.contains("light") ? "light" : "dark"
  );
}

$("theme-toggle").onclick = toggleTheme;
$("mobile-theme").onclick = toggleTheme;

if (localStorage.getItem("kis-theme") === "light") {
  document.body.classList.add("light");
}

/* TEXT INPUT */

$("chat-input").addEventListener("input", event => {
  event.target.style.height = "auto";
  event.target.style.height =
    Math.min(event.target.scrollHeight, 150) + "px";
});

$("chat-input").addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    $("chat-form").requestSubmit();
  }
});

/* LOG OUT */

$("logout").onclick = async () => {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (supabase) await supabase.auth.signOut();
  location.reload();
};

/* START */

loadSession();
