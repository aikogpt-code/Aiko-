import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://pipiaxrrgcfjrllzfvwv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_dI6GLBzGQxlhiMkYJQp5bw_9OuwwaSy";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const $ = (selector) => document.querySelector(selector);
const authScreen = $("#auth-screen");
const app = $("#app");
const authForm = $("#auth-form");
const authMessage = $("#auth-message");
const chatMessages = $("#chat-messages");
const promptInput = $("#prompt");
const sendButton = $("#send-button");
const typingIndicator = $("#typing-indicator");

let currentUser = null;
let currentConversation = null;
let conversations = [];
let customPersonas = [];
let activePersonaKey = "aiko";
let preferredPersonaKey = "aiko";
let authMode = "login";
let busy = false;
let toastTimer;
let assistantMode = "chat";

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 2800);
}

function setAuthMessage(message, isError = false) {
  authMessage.textContent = message;
  authMessage.style.color = isError ? "#bd5576" : "";
}

function showAuth() {
  authScreen.classList.remove("hidden");
  app.classList.add("hidden");
}

function showApp() {
  authScreen.classList.add("hidden");
  app.classList.remove("hidden");
}

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";
  $("#auth-title").textContent = signup ? "Crée ton petit espace !" : "Bon retour, senpai !";
  $("#auth-description").textContent = signup
    ? "Choisis un pseudo et un code secret pour commencer."
    : "Entre ton pseudo et ton code secret pour retrouver tes discussions.";
  $("#auth-submit").textContent = signup ? "Créer mon accès" : "Se connecter";
  $("#auth-switch-copy").textContent = signup ? "Tu as déjà un accès ?" : "Nouveau ici ?";
  $("#auth-switch").textContent = signup ? "Se connecter" : "Créer mon accès";
  $("#auth-confirm-label").classList.toggle("hidden", !signup);
  $("#auth-confirm").classList.toggle("hidden", !signup);
  $("#auth-confirm").required = signup;
  $("#auth-password").autocomplete = signup ? "new-password" : "current-password";
  $("#auth-name").value = "";
  $("#auth-password").value = "";
  $("#auth-confirm").value = "";
  setAuthMessage("");
}

function escapeTitle(value) {
  return (value || "Nouvelle discussion").replace(/\s+/g, " ").trim().slice(0, 48);
}

function formatTime(value) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function addMessage(content, role, createdAt = new Date().toISOString()) {
  const row = document.createElement("article");
  row.className = `message-row ${role}`;
  if (role === "assistant") {
    const avatar = document.createElement("img");
    avatar.className = "message-avatar";
    avatar.src = "./aiko-avatar.jpg";
    avatar.alt = "Aiko";
    row.appendChild(avatar);
  }
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  const imageUrl = typeof content === "string" && content.startsWith("[[AIKO_IMAGE]]")
    ? content.slice(14)
    : null;
  if (imageUrl && /^https:\/\//i.test(imageUrl)) {
    const image = document.createElement("img");
    image.className = "generated-image";
    image.src = imageUrl;
    image.alt = "Image générée par AIKO";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => {
      image.alt = "Cette image n'est plus disponible chez le fournisseur.";
    }, { once: true });
    bubble.appendChild(image);
  } else {
    bubble.textContent = content;
  }
  const time = document.createElement("span");
  time.className = "message-time";
  time.textContent = formatTime(createdAt);
  bubble.appendChild(time);
  row.appendChild(bubble);
  chatMessages.appendChild(row);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showWelcome() {
  chatMessages.replaceChildren();
  const welcome = document.createElement("article");
  welcome.className = "message-row assistant";
  const avatar = document.createElement("img");
  avatar.className = "message-avatar";
  avatar.src = "./aiko-avatar.jpg";
  avatar.alt = "Aiko";
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = "Yo gamer ! 🎮 Moi, c’est AIKO, ton copilote gaming. Je peux t’aider à progresser, trouver un build, battre un boss, optimiser tes réglages ou découvrir un nouveau jeu. On lance quelle partie ?";
  welcome.append(avatar, bubble);
  chatMessages.appendChild(welcome);

  const suggestions = document.createElement("div");
  suggestions.className = "welcome-suggestions";
  ["Aide-moi à apprendre quelque chose", "Trouvons une idée créative", "J'ai besoin d'un conseil"].forEach((label) => {
    const button = document.createElement("button");
    button.className = "suggestion";
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => {
      promptInput.value = label;
      promptInput.focus();
      promptInput.dispatchEvent(new Event("input"));
    });
    suggestions.appendChild(button);
  });
  chatMessages.appendChild(suggestions);
  $("#chat-title").textContent = "Un petit coucou ?";
  $("#chat-subtitle").textContent = "Je suis là. On parle de quoi aujourd'hui ?";
}

function setBusy(value) {
  busy = value;
  sendButton.disabled = value;
  promptInput.disabled = value;
  typingIndicator.classList.toggle("hidden", !value);
  if (!value) {
    promptInput.focus();
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

function updatePersonaHeading() {
  const selected = customPersonas.find((persona) => `custom:${persona.id}` === activePersonaKey);
  $("#topbar-persona").textContent = selected ? `AIKO · ${selected.name}` : "AIKO";
}

async function loadCustomPersonas() {
  const { data, error } = await supabase.from("custom_personas")
    .select("id,name,description,system_prompt,voice_id,created_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  customPersonas = data || [];
  let savedPersona = null;
  try { savedPersona = localStorage.getItem(`aiko-active-persona:${currentUser.id}`); } catch {}
  preferredPersonaKey = savedPersona && customPersonas.some((persona) => `custom:${persona.id}` === savedPersona)
    ? savedPersona
    : "aiko";
  activePersonaKey = preferredPersonaKey;
  updatePersonaHeading();
}

async function loadConversations() {
  const { data, error } = await supabase.from("conversations")
    .select("id,title,persona_key,created_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) throw error;
  conversations = data || [];
  renderConversationList();
}

function renderConversationList() {
  const list = $("#conversation-list");
  list.replaceChildren();
  if (!conversations.length) {
    const empty = document.createElement("p");
    empty.className = "empty-history";
    empty.textContent = "Tes discussions apparaîtront ici.";
    list.appendChild(empty);
    return;
  }
  conversations.forEach((conversation) => {
    const item = document.createElement("div");
    item.className = `conversation-item-wrap ${currentConversation?.id === conversation.id ? "active" : ""}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "conversation-item";
    const icon = document.createElement("span");
    icon.textContent = "✧";
    const title = document.createElement("span");
    title.className = "conversation-name";
    title.textContent = conversation.title || "Nouvelle discussion";
    button.append(icon, title);
    button.addEventListener("click", () => openConversation(conversation));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-conversation";
    remove.textContent = "🗑";
    remove.title = "Supprimer cette discussion";
    remove.setAttribute("aria-label", `Supprimer la discussion ${conversation.title || "sans titre"}`);
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteConversation(conversation);
    });
    item.append(button, remove);
    list.appendChild(item);
  });
}
 
async function deleteConversation(conversation) {
  const title = conversation.title || "Nouvelle discussion";
  if (!window.confirm(`Supprimer définitivement « ${title} » et tous ses messages ?`)) return;
  const { data, error } = await supabase.from("conversations")
    .delete()
    .eq("id", conversation.id)
    .eq("user_id", currentUser.id)
    .select("id");
  if (error) {
    console.error("AIKO delete conversation:", error);
    toast("Impossible de supprimer cette discussion.");
    return;
  }
  if (!data?.length) {
    toast("Discussion introuvable ou déjà supprimée.");
    return;
  }
  conversations = conversations.filter((item) => item.id !== conversation.id);
  if (currentConversation?.id === conversation.id) {
    currentConversation = null;
    showWelcome();
  }
  renderConversationList();
  toast("Discussion supprimée.");
}

async function openConversation(conversation) {
  currentConversation = conversation;
  activePersonaKey = typeof conversation.persona_key === "string" && conversation.persona_key.startsWith("custom:")
    ? conversation.persona_key
    : "aiko";
  updatePersonaHeading();
  renderConversationList();
  $("#chat-title").textContent = conversation.title || "Discussion";
  $("#chat-subtitle").textContent = "Notre petit coin de discussion.";
  chatMessages.replaceChildren();
  const { data, error } = await supabase.from("messages")
    .select("id,role,content,created_at")
    .eq("conversation_id", conversation.id)
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) {
    toast("Impossible de charger cette discussion.");
    console.error(error);
    return;
  }
  if (!data?.length) {
    showWelcome();
    $("#chat-title").textContent = conversation.title || "Nouvelle discussion";
    return;
  }
  data.forEach((message) => addMessage(message.content, message.role, message.created_at));
  $("#sidebar").classList.remove("open");
}

async function createConversation(firstMessage = "") {
  const personaKey = activePersonaKey;
  const title = escapeTitle(firstMessage) || "Nouvelle discussion";
  const { data, error } = await supabase.from("conversations")
    .insert({ user_id: currentUser.id, title, persona_key: personaKey })
    .select("id,title,persona_key,created_at")
    .single();
  if (error) throw error;
  currentConversation = data;
  conversations.unshift(data);
  renderConversationList();
  $("#chat-title").textContent = title;
  $("#chat-subtitle").textContent = "Notre petit coin de discussion.";
  return data;
}

function isImageRequest(message) {
  return /(?:^|\b)(?:dessine(?:-moi)?|dessiner|dessin(?:e|er)?|g[eé]n[eè]re(?:-moi)?|g[eé]n[eè]rer|cr[eé]e(?:-moi)?|cr[eé]er|fais(?:-moi)? une image|fabrique(?:-moi)?|image *:|une image de|une illustration de|peux-tu (?:me )?(?:dessiner|g[eé]n[eè]rer|cr[eé]er)|je veux (?:une image|que tu dessines)|montre-moi en image)/i.test(message.trim());
}

async function sendMessage(rawMessage) {
  const message = rawMessage.trim();
  if (!message || busy || !currentUser) return;
  promptInput.value = "";
  promptInput.style.height = "auto";
  addMessage(message, "user");
  setBusy(true);
  try {
    if (!currentConversation) await createConversation(message);
    const currentPersona = activePersonaKey;
    if (currentConversation.persona_key !== currentPersona) {
      const { error: updateError } = await supabase.from("conversations")
        .update({ persona_key: currentPersona }).eq("id", currentConversation.id).eq("user_id", currentUser.id);
      if (updateError) throw updateError;
      currentConversation.persona_key = currentPersona;
    }
    const imageRequest = isImageRequest(message);
    const imageOptions = { style: "auto", format: "square" };
    const gameContext = { platform: $("#game-platform").value, game: $("#game-name").value.trim() };
    const { data, error } = await supabase.functions.invoke(imageRequest ? "aiko-image" : "aiko-chat", {
      body: imageRequest
        ? { conversation_id: currentConversation.id, prompt: message, image_options: imageOptions }
        : { conversation_id: currentConversation.id, message, persona_key: currentPersona, game_context: gameContext, assistant_mode: assistantMode }
    });
    if (error) {
      let detail = data?.error;
      try {
        const response = error.context;
        if (response && typeof response.clone === "function") {
          const parsed = await response.clone().json();
          detail = parsed.error || detail;
        }
      } catch { /* use the generic message below */ }
      throw new Error(detail || "Le service IA est momentanément indisponible.");
    }
    if (data?.error) throw new Error(data.error);
    if (imageRequest) {
      if (!data?.content || !data?.image_url) throw new Error("Le générateur n'a pas renvoyé d'image.");
      addMessage(data.content, "assistant");
    } else {
      if (!data?.reply) throw new Error("Aiko n'a pas reçu de réponse. Réessaie.");
      addMessage(data.reply, "assistant");
      if (assistantMode === "code") {
        const codeBlock = data.reply.match(/```([a-z0-9+#.-]*)\s*\n([\s\S]*?)```/i);
        if (codeBlock) {
          $("#workspace-editor").value = codeBlock[2].trimEnd();
          const extensions = { javascript: "js", js: "js", typescript: "ts", ts: "ts", python: "py", py: "py", html: "html", css: "css", json: "json", sql: "sql", bash: "sh", sh: "sh" };
          const extension = extensions[(codeBlock[1] || "").toLowerCase()];
          if (extension) $("#workspace-filename").value = "main." + extension;
          $("#workspace-status").textContent = "Le premier bloc de code de la réponse a été placé dans l’atelier. Vérifie-le avant de l’utiliser.";
        }
      }
    }
    const current = conversations.find((item) => item.id === currentConversation.id);
    if (current && current.title === "Nouvelle discussion") {
      current.title = escapeTitle(message);
      await supabase.from("conversations").update({ title: current.title })
        .eq("id", current.id).eq("user_id", currentUser.id);
      $("#chat-title").textContent = current.title;
      renderConversationList();
    }
  } catch (error) {
    console.error("AIKO chat:", error);
    addMessage(`Oups… ${error.message || "Une erreur est survenue."}`, "assistant");
  } finally {
    setBusy(false);
  }
}

async function startApp(user) {
  currentUser = user;
  showApp();
  const displayName = user.user_metadata?.display_name || user.user_metadata?.username || "Mon compte";
  $("#user-name").textContent = displayName;
  $("#user-email").textContent = "Espace personnel";
  $("#user-avatar").textContent = displayName.charAt(0).toUpperCase();
  $("#settings-account").textContent = displayName;
  showWelcome();
  try {
    await Promise.all([loadCustomPersonas(), loadConversations()]);
    if (conversations.length) await openConversation(conversations[0]);
  } catch (error) {
    console.error("AIKO initialisation:", error);
    toast("Impossible de charger toutes tes données. Vérifie ta connexion.");
  }
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = $("#auth-name").value.trim();
  const code = $("#auth-password").value;
  const confirmation = $("#auth-confirm").value;
  const submit = $("#auth-submit");

  if (!/^[A-Za-z0-9_-]{3,20}$/.test(username)) {
    setAuthMessage("Le pseudo doit contenir 3 à 20 lettres, chiffres, _ ou -.", true);
    return;
  }
  if (code.length < 8 || code.length > 64) {
    setAuthMessage("Ton code secret doit contenir entre 8 et 64 caractères.", true);
    return;
  }
  if (authMode === "signup" && code !== confirmation) {
    setAuthMessage("Les deux codes ne correspondent pas.", true);
    return;
  }

  submit.disabled = true;
  setAuthMessage(authMode === "signup" ? "Création de ton espace…" : "Connexion…");
  try {
    const { data, error } = await supabase.functions.invoke("aiko-access", {
      body: {
        action: authMode,
        username,
        code
      }
    });
    if (error) {
      let detail = data?.error;
      try {
        if (error.context && typeof error.context.clone === "function") {
          const parsed = await error.context.clone().json();
          detail = parsed.error || detail;
        }
      } catch { /* keep the generic message */ }
      throw new Error(detail || "Impossible de te connecter. Réessaie.");
    }
    if (data?.error) throw new Error(data.error);
    if (!data?.session?.access_token || !data?.session?.refresh_token) {
      throw new Error("La connexion n'a pas renvoyé de session valide.");
    }
    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token
    });
    if (sessionError) throw sessionError;
    await startApp(sessionData.user);
    authForm.reset();
  } catch (error) {
    setAuthMessage(error.message || "Impossible de continuer. Vérifie ton pseudo et ton code.", true);
  } finally {
    submit.disabled = false;
  }
});

$("#auth-switch").addEventListener("click", () => setAuthMode(authMode === "login" ? "signup" : "login"));

async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) toast("La déconnexion a échoué.");
  currentUser = null;
  currentConversation = null;
  conversations = [];
  customPersonas = [];
  authForm.reset();
  setAuthMode("login");
  showAuth();
}
$("#sign-out").addEventListener("click", signOut);
$("#settings-signout").addEventListener("click", () => {
  $("#settings-modal").classList.add("hidden");
  signOut();
});

$("#new-chat").addEventListener("click", () => {
  currentConversation = null;
  activePersonaKey = preferredPersonaKey;
  updatePersonaHeading();
  renderConversationList();
  showWelcome();
  closeSidebar();
  promptInput.focus();
});
$("#composer").addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(promptInput.value);
});
promptInput.addEventListener("input", () => {
  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 140)}px`;
});
promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage(promptInput.value);
  }
});

$("#create-persona-open").addEventListener("click", () => {
  $("#persona-message").textContent = "";
  $("#persona-modal").classList.remove("hidden");
  closeSidebar();
});
$("#persona-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector("button[type=submit]");
  submit.disabled = true;
  $("#persona-message").textContent = "Création en cours…";
  try {
    const payload = {
      user_id: currentUser.id,
      name: $("#persona-name").value.trim(),
      description: $("#persona-description").value.trim(),
      system_prompt: $("#persona-prompt").value.trim()
    };
    const { data, error } = await supabase.from("custom_personas")
      .insert(payload).select("id,name,description,system_prompt,voice_id,created_at").single();
    if (error) throw error;
    customPersonas.unshift(data);
    activePersonaKey = `custom:${data.id}`;
    preferredPersonaKey = activePersonaKey;
    try { localStorage.setItem(`aiko-active-persona:${currentUser.id}`, preferredPersonaKey); } catch {}
    updatePersonaHeading();
    if (currentConversation) {
      const { error: conversationUpdateError } = await supabase.from("conversations")
        .update({ persona_key: activePersonaKey })
        .eq("id", currentConversation.id).eq("user_id", currentUser.id);
      if (conversationUpdateError) throw conversationUpdateError;
      currentConversation.persona_key = activePersonaKey;
    }
    event.currentTarget.reset();
    $("#persona-modal").classList.add("hidden");
    toast(`La personnalité ${data.name} est prête ! ✨`);
  } catch (error) {
    $("#persona-message").textContent = error.message || "Impossible de créer cette personnalité.";
    $("#persona-message").style.color = "#bd5576";
  } finally {
    submit.disabled = false;
  }
});

$("#settings-open").addEventListener("click", () => $("#settings-modal").classList.remove("hidden"));
$("#settings-persona").addEventListener("click", () => {
  $("#settings-modal").classList.add("hidden");
  $("#create-persona-open").click();
});
document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => $("#" + button.dataset.close).classList.add("hidden"));
});
document.querySelectorAll(".modal").forEach((modal) => {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.classList.add("hidden");
  });
});
function closeSidebar() {
  $("#sidebar").classList.remove("open");
  $("#sidebar-backdrop").classList.remove("visible");
  $("#menu-toggle").setAttribute("aria-expanded", "false");
}
function toggleSidebar() {
  const open = $("#sidebar").classList.toggle("open");
  $("#sidebar-backdrop").classList.toggle("visible", open);
  $("#menu-toggle").setAttribute("aria-expanded", String(open));
}
$("#menu-toggle").addEventListener("click", toggleSidebar);
$("#sidebar-close").addEventListener("click", closeSidebar);
$("#sidebar-backdrop").addEventListener("click", closeSidebar);

try {
  const savedGameSetup = JSON.parse(localStorage.getItem("aiko-gaming-setup") || "{}");
  if (savedGameSetup.platform) $("#game-platform").value = savedGameSetup.platform;
  if (savedGameSetup.game) $("#game-name").value = savedGameSetup.game;
} catch { /* optional local preferences */ }
function saveGameSetup() {
  try { localStorage.setItem("aiko-gaming-setup", JSON.stringify({ platform: $("#game-platform").value, game: $("#game-name").value.trim() })); } catch { /* optional local preferences */ }
}
$("#game-platform").addEventListener("change", saveGameSetup);
$("#game-name").addEventListener("change", saveGameSetup);
$("#game-platform").addEventListener("change", updateGamingProfileSummary);
$("#game-name").addEventListener("input", updateGamingProfileSummary);
function updateGamingProfileSummary() {
  const game = $("#game-name").value.trim();
  const platform = $("#game-platform").value;
  $("#gaming-profile-summary").textContent = game ? platform + " · " + game : "Tous les jeux";
}
$("#toggle-gaming-profile").addEventListener("click", () => {
  const panel = $("#gaming-toolbar");
  const button = $("#toggle-gaming-profile");
  const open = panel.classList.toggle("hidden");
  button.setAttribute("aria-expanded", String(!open));
});

updateGamingProfileSummary();
$("#image-create-button").addEventListener("click", () => {
  promptInput.value = "Génère une image de ";
  promptInput.focus();
  promptInput.setSelectionRange(promptInput.value.length, promptInput.value.length);
});


function setAssistantMode(mode) {
  assistantMode = mode === "code" ? "code" : "chat";
  try { localStorage.setItem("aiko-assistant-mode", assistantMode); } catch {}
  $("#mode-chat").classList.toggle("active", assistantMode === "chat");
  $("#mode-code").classList.toggle("active", assistantMode === "code");
  $("#coding-workspace").classList.toggle("hidden", assistantMode !== "code");
  $("#chat-messages").classList.remove("hidden");
  promptInput.placeholder = assistantMode === "code"
    ? "Décris le code ou le bug à résoudre…"
    : "Demande une strat, un build, une astuce…";
  $("#workspace-status").textContent = assistantMode === "code"
    ? "Atelier local : édite ton fichier ici, puis enregistre ou exporte-le. L’accès direct à GitHub sera ajouté via une connexion sécurisée."
    : "Atelier de code prêt.";
}
$("#mode-chat").addEventListener("click", () => setAssistantMode("chat"));
$("#mode-code").addEventListener("click", () => setAssistantMode("code"));
$("#workspace-open").addEventListener("click", () => {
  const filename = $("#workspace-filename").value.trim() || "code.txt";
  const saved = localStorage.getItem("aiko-workspace:" + filename);
  if (saved === null) { toast("Aucun fichier enregistré sous ce nom."); return; }
  $("#workspace-editor").value = saved;
  $("#workspace-status").textContent = "Fichier chargé depuis le stockage local de cet appareil.";
  toast("Fichier ouvert.");
});
$("#workspace-save").addEventListener("click", () => {
  const filename = $("#workspace-filename").value.trim() || "code.txt";
  try {
    localStorage.setItem("aiko-workspace:" + filename, $("#workspace-editor").value);
    toast("Fichier enregistré sur cet appareil.");
  } catch { toast("Impossible d’enregistrer ce fichier localement."); }
});
$("#workspace-download").addEventListener("click", () => {
  const filename = ($("#workspace-filename").value.trim() || "code.txt").replace(/[^a-zA-Z0-9._-]/g, "_");
  const blob = new Blob([$("#workspace-editor").value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
});
const accentPicker = $("#accent-color");
const glowPicker = $("#accent-glow");
function applyAccent() {
  document.documentElement.style.setProperty("--aiko-accent", accentPicker.value);
  document.documentElement.style.setProperty("--aiko-glow", glowPicker.value + "px");
  try {
    localStorage.setItem("aiko-theme", JSON.stringify({ color: accentPicker.value, glow: glowPicker.value }));
  } catch { /* optional preference */ }
}
try {
  const savedTheme = JSON.parse(localStorage.getItem("aiko-theme") || "{}");
  if (savedTheme.color) accentPicker.value = savedTheme.color;
  if (savedTheme.glow) glowPicker.value = savedTheme.glow;
} catch { /* optional preference */ }
accentPicker.addEventListener("input", applyAccent);
glowPicker.addEventListener("input", applyAccent);
applyAccent();


supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" && currentUser) {
    currentUser = null;
    showAuth();
  }
});

(async function init() {
  setAuthMode("login");
  try {
    const savedMode = localStorage.getItem("aiko-assistant-mode");
    setAssistantMode(savedMode === "code" ? "code" : "chat");
    localStorage.removeItem("aiko-adult-confirmed");
  } catch {}
  const { data, error } = await supabase.auth.getSession();
  if (error) console.warn("Session Supabase:", error.message);
  if (data?.session?.user) await startApp(data.session.user);
  else showAuth();
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch((error) => {
        console.warn("Service worker:", error);
      });
    });
  }
})();
