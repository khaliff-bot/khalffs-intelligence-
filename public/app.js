/* KI's front end. Set the two Supabase values below before deploying. */
const SUPABASE_URL = "https://ldromtbmwrdckwgtgvko.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_xwQIgH3LrYVar5Ka4BVvLw_wQ4Auv2g";
const configReady = SUPABASE_URL.startsWith("https://ldromtbmwrdckwgtgvko.supabase.co") && !SUPABASE_PUBLISHABLE_KEY.startsWith("PASTE_");
const $ = (id) => document.getElementById(id);
const authScreen = $("auth-screen"), app = $("app"), authForm = $("auth-form");
let supabase = null, user = null, currentChat = null, conversation = [], authMode = "login";

if (configReady && window.supabase) {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
} else {
  $("auth-note").textContent = "Setup needed: add your Supabase Project URL and Publishable key in public/app.js.";
  $("auth-submit").disabled = true;
}

function setAuthMode(mode) {
  authMode = mode;
  $("login-tab").classList.toggle("active", mode === "login");
  $("signup-tab").classList.toggle("active", mode === "signup");
  $("auth-submit").textContent = mode === "login" ? "Log in" : "Create account";
  $("auth-password").autocomplete = mode === "login" ? "current-password" : "new-password";
}
$("login-tab").onclick = () => setAuthMode("login");
$("signup-tab").onclick = () => setAuthMode("signup");

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!supabase) return;
  const email = $("auth-email").value.trim(), password = $("auth-password").value;
  $("auth-submit").disabled = true;
  $("auth-note").textContent = "Please wait…";
  const result = authMode === "signup"
    ? await supabase.auth.signUp({ email, password })
    : await supabase.auth.signInWithPassword({ email, password });
  $("auth-submit").disabled = false;
  if (result.error) { $("auth-note").textContent = result.error.message; return; }
  if (authMode === "signup" && !result.data.session) {
    $("auth-note").textContent = "Account created. Check your email to confirm, then log in.";
    return;
  }
  await startApp(result.data.user);
});

async function startApp(signedInUser) {
  user = signedInUser;
  $("user-email").textContent = user.email || "KI's user";
  authScreen.classList.add("hidden");
  app.classList.remove("hidden");
  await loadChats();
  if (!currentChat) showWelcome();
}
async function loadSession() {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  if (data.session) await startApp(data.session.user);
}
function showWelcome() {
  currentChat = null; conversation = [];
  $("chat-messages").innerHTML = "";
  $("welcome").classList.remove("hidden");
  document.querySelectorAll(".chat-item").forEach(el => el.classList.remove("active"));
}
function addMessage(content, role) {
  const el = document.createElement("div");
  el.className = `message ${role}`;
  el.textContent = content;
  $("chat-messages").appendChild(el);
  $("welcome").classList.add("hidden");
  $("chat-area")?.scrollTo?.(0, 999999);
  el.scrollIntoView({block:"end", behavior:"smooth"});
  return el;
}
async function loadChats() {
  const { data, error } = await supabase.from("conversations").select("id,title,updated_at").order("updated_at", {ascending:false}).limit(100);
  if (error) { console.error(error); return; }
  $("chat-list").innerHTML = "";
  (data || []).forEach(chat => {
    const row = document.createElement("div"); row.className = "chat-item";
    const title = document.createElement("span"); title.className = "chat-title"; title.textContent = chat.title || "New chat";
    title.onclick = () => openChat(chat.id);
    const menu = document.createElement("button"); menu.className = "chat-menu"; menu.textContent = "⋯"; menu.title = "Rename or delete";
    menu.onclick = async () => {
      const choice = prompt("Type a new title, or type DELETE to remove this chat:");
      if (choice === null) return;
      if (choice.trim().toUpperCase() === "DELETE") {
        const {error} = await supabase.from("conversations").delete().eq("id", chat.id);
        if (error) alert(error.message); else { if (currentChat === chat.id) showWelcome(); await loadChats(); }
      } else if (choice.trim()) {
        const {error} = await supabase.from("conversations").update({title:choice.trim().slice(0,80)}).eq("id",chat.id);
        if (error) alert(error.message); else await loadChats();
      }
    };
    row.append(title,menu); row.dataset.id = chat.id;
    if (chat.id === currentChat) row.classList.add("active");
    $("chat-list").appendChild(row);
  });
}
async function openChat(id) {
  currentChat = id; conversation = [];
  $("chat-messages").innerHTML = ""; $("welcome").classList.add("hidden");
  const {data,error} = await supabase.from("messages").select("id,role,content").eq("conversation_id",id).order("created_at");
  if (error) { alert(error.message); return; }
  (data || []).forEach(m => { conversation.push({role:m.role,content:m.content}); addMessage(m.content,m.role); });
  await loadChats();
  $("sidebar").classList.remove("open");
}
$("new-chat").onclick = () => { showWelcome(); $("sidebar").classList.remove("open"); };
$("menu-toggle").onclick = () => $("sidebar").classList.toggle("open");
async function saveMessage(chatId, role, content) {
  const {error} = await supabase.from("messages").insert({conversation_id:chatId,role,content});
  if (error) throw error;
}
$("chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("chat-input").value.trim();
  if (!text || !user) return;
  $("chat-input").value = "";
  addMessage(text,"user");
  conversation.push({role:"user",content:text});
  const send = $("send-button"); send.disabled = true;
  const pending = addMessage("KI's is thinking…","assistant"); pending.classList.add("typing");
  try {
    if (!currentChat) {
      const title = text.length > 42 ? text.slice(0,42) + "…" : text;
      const {data,error} = await supabase.from("conversations").insert({title}).select("id").single();
      if (error) throw error;
      currentChat = data.id;
    }
    await saveMessage(currentChat,"user",text);
    const {data:{session}} = await supabase.auth.getSession();
    const response = await fetch("/.netlify/functions/chat",{
      method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${session.access_token}`},
      body:JSON.stringify({messages:conversation.slice(-20)})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The AI could not answer.");
    pending.textContent = result.reply; pending.classList.remove("typing");
    conversation.push({role:"assistant",content:result.reply});
    await saveMessage(currentChat,"assistant",result.reply);
    await supabase.from("conversations").update({updated_at:new Date().toISOString()}).eq("id",currentChat);
    await loadChats();
  } catch (err) {
    pending.textContent = `Sorry — ${err.message}`;
    console.error(err);
  } finally { send.disabled = false; $("chat-input").focus(); }
});
$("logout").onclick = async () => { await supabase.auth.signOut(); location.reload(); };
function toggleTheme(){document.body.classList.toggle("light");localStorage.setItem("kis-theme",document.body.classList.contains("light")?"light":"dark");}
$("theme-toggle").onclick = toggleTheme; $("mobile-theme").onclick = toggleTheme;
if (localStorage.getItem("kis-theme")==="light") document.body.classList.add("light");
$("chat-input").addEventListener("input",e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,150)+"px";});
$("chat-input").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("chat-form").requestSubmit();}});
loadSession();
