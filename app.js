const chat = document.querySelector("#chat");
const form = document.querySelector("#composer");
const input = document.querySelector("#prompt");
const sendButton = document.querySelector("#send");

function addMessage(text, role) {
  const row = document.createElement("article");
  row.className = `message ${role}`;
  if (role === "assistant") {
    const avatar = document.createElement("div");
    avatar.className = "avatar-wrap";
    const portrait = document.createElement("img");
    portrait.src = "icons/aiko-192.png";
    portrait.alt = "Aiko";
    portrait.className = "avatar";
    avatar.appendChild(portrait);
    row.appendChild(avatar);
  }
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  row.appendChild(bubble);
  chat.appendChild(row);
  chat.scrollTop = chat.scrollHeight;
}

function demoReply(message) {
  return `J’ai bien reçu ton message : « ${message} » 💗 Pour le moment, je suis en mode démonstration. La prochaine étape sera de me connecter à un véritable service d’IA via un serveur sécurisé.`;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  addMessage(message, "user");
  input.value = "";
  sendButton.disabled = true;
  window.setTimeout(() => {
    addMessage(demoReply(message), "assistant");
    sendButton.disabled = false;
    input.focus();
  }, 500);
});

document.querySelector("#new-chat").addEventListener("click", () => {
  chat.replaceChildren();
  addMessage("Nouvelle conversation ✦ Comment puis-je t’aider ?", "assistant");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.error("Service worker non enregistré :", error);
    });
  });
}
