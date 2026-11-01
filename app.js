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
const personaSelect = $("#persona-select");

const builtInPersonas = [
  { key: "coach", name: "Coach gamer", emoji: "🎮" },
  { key: "douce", name: "Douce", emoji: "🌸" },
  { key: "tsundere", name: "Tsundere", emoji: "🔥" },
  { key: "enjouee", name: "Enjouée", emoji: "🎉" },
  { key: "sage", name: "Sage", emoji: "🌙" },
  { key: "directe", name: "Directe", emoji: "⚡" },
  { key: "creative", name: "Créative", emoji: "🎨" }
];

let currentUser = null;
let currentConversation = null;
let conversations = [];
let customPersonas = [];
let authMode = "login";
let busy = false;
let toastTimer;

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
    avatar.src = "./aiko-192.png";
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
  avatar.src = "./aiko-192.png";
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
  const selected = personaSelect.selectedOptions[0]?.textContent || "Douce";
  $("#topbar-persona").textContent = `Aiko · ${selected.replace(/^\S+\s/, "")}`;
}

function renderPersonaOptions() {
  const selected = personaSelect.value || "coach";
  personaSelect.replaceChildren();
  builtInPersonas.forEach((persona) => {
    const option = document.createElement("option");
    option.value = persona.key;
    option.textContent = `${persona.emoji} ${persona.name}`;
    personaSelect.appendChild(option);
  });
  if (customPersonas.length) {
    const group = document.createElement("optgroup");
    group.label = "Mes personnalités";
    customPersonas.forEach((persona) => {
      const option = document.createElement("option");
      option.value = `custom:${persona.id}`;
      option.textContent = `💫 ${persona.name}`;
      group.appendChild(option);
    });
    personaSelect.appendChild(group);
  }
  const valid = [...personaSelect.options].some((option) => option.value === selected);
  personaSelect.value = valid ? selected : "coach";
  updatePersonaHeading();
}

async function loadCustomPersonas() {
  const { data, error } = await supabase.from("custom_personas")
    .select("id,name,description,system_prompt,voice_id,created_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  customPersonas = data || [];
  renderPersonaOptions();
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
    const button = document.createElement("button");
    button.type = "button";
    button.className = `conversation-item ${currentConversation?.id === conversation.id ? "active" : ""}`;
    const icon = document.createElement("span");
    icon.textContent = "✧";
    const title = document.createElement("span");
    title.className = "conversation-name";
    title.textContent = conversation.title || "Nouvelle discussion";
    button.append(icon, title);
    button.addEventListener("click", () => openConversation(conversation));
    list.appendChild(button);
  });
}

async function openConversation(conversation) {
  currentConversation = conversation;
  personaSelect.value = conversation.persona_key || "coach";
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
  const personaKey = personaSelect.value || "coach";
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
    const currentPersona = personaSelect.value || "coach";
    if (currentConversation.persona_key !== currentPersona) {
      const { error: updateError } = await supabase.from("conversations")
        .update({ persona_key: currentPersona }).eq("id", currentConversation.id).eq("user_id", currentUser.id);
      if (updateError) throw updateError;
      currentConversation.persona_key = currentPersona;
    }
    const imageRequest = isImageRequest(message);
    const gameContext = { platform: $("#game-platform").value, game: $("#game-name").value.trim() };
    const { data, error } = await supabase.functions.invoke(imageRequest ? "aiko-image" : "aiko-chat", {
      body: imageRequest
        ? { conversation_id: currentConversation.id, prompt: message }
        : { conversation_id: currentConversation.id, message, persona_key: currentPersona, game_context: gameContext }
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
  renderConversationList();
  showWelcome();
  $("#sidebar").classList.remove("open");
  promptInput.focus();
});
$("#persona-select").addEventListener("change", async () => {
  updatePersonaHeading();
  if (currentConversation) {
    const personaKey = personaSelect.value;
    const { error } = await supabase.from("conversations").update({ persona_key: personaKey })
      .eq("id", currentConversation.id).eq("user_id", currentUser.id);
    if (error) toast("Impossible de changer cette personnalité.");
    else currentConversation.persona_key = personaKey;
  }
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
  $("#sidebar").classList.remove("open");
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
    renderPersonaOptions();
    personaSelect.value = `custom:${data.id}`;
    updatePersonaHeading();
    if (currentConversation) {
      await supabase.from("conversations").update({ persona_key: personaSelect.value })
        .eq("id", currentConversation.id).eq("user_id", currentUser.id);
      currentConversation.persona_key = personaSelect.value;
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
$("#menu-toggle").addEventListener("click", () => $("#sidebar").classList.toggle("open"));

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

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" && currentUser) {
    currentUser = null;
    showAuth();
  }
});

(async function init() {
  setAuthMode("login");
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
