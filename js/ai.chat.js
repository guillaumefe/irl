/**
 * js/ai.chat.js
 * ---------------------------------------------------------
 * Gestion complète du conseiller IA LifePath.
 * - UI (panneau, bulles, bouton flottant)
 * - Historique des messages
 * - Privacy Guard
 * - Appels API au backend
 * - Gestion d’erreurs
 * ---------------------------------------------------------
 */

import { getPlayerState } from "./core.state.js";

// Configuration IA stockée localement
const STORAGE_AI = "lifepath-ai-config";

let aiConfig = loadAIConfig();
let aiHistory = [];
let isSending = false;

/* ---------------------------------------------------------
   SETTINGS PERSISTENCE
--------------------------------------------------------- */
function loadAIConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_AI);
    if (!raw) return { provider: "openai", model: "gpt-4o-mini" };
    return JSON.parse(raw);
  } catch {
    return { provider: "openai", model: "gpt-4o-mini" };
  }
}

function saveAIConfig() {
  localStorage.setItem(STORAGE_AI, JSON.stringify(aiConfig));
}

/* ---------------------------------------------------------
   PRIVACY GUARD
--------------------------------------------------------- */
function detectSensitive(text) {
  const patterns = [
    { type: "email", regex: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
    { type: "phone", regex: /(\+?\d[\d .-]{7,}\d)/g },
    { type: "iban", regex: /\b([A-Z]{2}\d{2}[A-Z0-9]{1,30})\b/g },
    { type: "credit_card", regex: /\b(?:\d[ -]*?){13,19}\b/g },
    { type: "address", regex: /\b(rue|avenue|boulevard|code postal|CP)\b/i }
  ];

  const matches = [];

  patterns.forEach(p => {
    let m;
    while ((m = p.regex.exec(text)) !== null) {
      matches.push({ type: p.type, value: m[0] });
    }
  });

  return matches;
}

/* ---------------------------------------------------------
   SYSTEM PROMPT & SNAPSHOT
--------------------------------------------------------- */
function getSystemPrompt() {
  return (
    "Tu es le conseiller IA d’un joueur dans LifePath.\n" +
    "Tu aides à prioriser ses chemins, quêtes, objectifs et ressources.\n" +
    "Tu donnes des options, jamais des ordres. Tu restes prudent sur la santé, " +
    "la psychologie, l'argent ou le juridique.\n" +
    "Tes réponses doivent être utiles, concrètes, orientées action."
  );
}

function getPlayerSnapshot() {
  const p = getPlayerState();
  return {
    xp: p.xp,
    level: p.level,
    stats: p.stats,
    activeQuests: p.activeQuests,
    installedPaths: p.installedPaths,
    stepStates: p.stepStates
  };
}

/* ---------------------------------------------------------
   UI HELPERS
--------------------------------------------------------- */
function qs(id) {
  return document.getElementById(id);
}

function appendBubble(role, text) {
  const log = qs("ai-chat-log");
  if (!log) return;
  const msg = document.createElement("div");
  msg.className = `ai-chat-message ${role}`;
  msg.innerHTML = `<div class="ai-chat-message-inner">${escapeHtml(text)}</div>`;
  log.appendChild(msg);
  log.scrollTop = log.scrollHeight;
}

function appendSystemMessage(text) {
  appendBubble("system", text);
}

/* “...” lors du traitement */
function appendThinkingBubble() {
  const log = qs("ai-chat-log");
  if (!log) return null;
  const msg = document.createElement("div");
  msg.className = "ai-chat-message assistant thinking";
  msg.innerHTML = `<div class="ai-chat-message-inner">…</div>`;
  log.appendChild(msg);
  log.scrollTop = log.scrollHeight;
  return msg;
}

function clearError() {
  const banner = qs("ai-error-banner");
  if (!banner) return;
  banner.classList.add("hidden");
  banner.innerHTML = "";
}

function showError(userMsg, technical = null) {
  const banner = qs("ai-error-banner");
  if (!banner) return;
  let html = `<div>${escapeHtml(userMsg)}</div>`;
  if (technical) {
    html += `<details><summary>Détails techniques</summary><pre>${escapeHtml(
      typeof technical === "string"
        ? technical
        : JSON.stringify(technical, null, 2)
    )}</pre></details>`;
  }
  banner.innerHTML = html;
  banner.classList.remove("hidden");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ---------------------------------------------------------
   SEND MESSAGE
--------------------------------------------------------- */
async function sendChatMessage(userText) {
  if (!userText.trim() || isSending) return;

  clearError();

  /* ---- Privacy Guard ---- */
  const sensitive = detectSensitive(userText);
  if (sensitive.length > 0) {
    const types = [...new Set(sensitive.map(s => s.type))].join(", ");
    showError(
      "Message bloqué : il semble contenir des informations personnelles (" +
        types +
        "). Reformule sans e-mail, numéro de téléphone, IBAN, etc."
    );
    appendSystemMessage(
      "Ton message n’a pas été envoyé pour protéger ta vie privée."
    );
    const input = qs("ai-chat-input");
    if (input) input.value = "";
    return;
  }

  /* ---- Affichage immédiat côté UI ---- */
  appendBubble("user", userText);
  aiHistory.push({ role: "user", content: userText });

  const input = qs("ai-chat-input");
  if (input) {
    input.value = "";
    input.style.height = "32px";
  }

  /* bubble “…” */
  const thinking = appendThinkingBubble();

  isSending = true;
  const sendBtn = qs("ai-chat-send");
  if (sendBtn) sendBtn.disabled = true;

  /* ---- Construction messages pour API ---- */
  const snapshot = getPlayerSnapshot();
  const messages = [
    { role: "system", content: getSystemPrompt() },
    {
      role: "system",
      content:
        "État du joueur (JSON, ne pas répéter tel quel) :\n" +
        JSON.stringify(snapshot, null, 2)
    },
    ...aiHistory
  ];

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: aiConfig.provider,
        model: aiConfig.model,
        messages
      })
    });

    const status = res.status;

    if (!res.ok) {
      let raw = "";
      let json = null;
      try {
        raw = await res.text();
        json = JSON.parse(raw);
      } catch {
        raw = raw || "(réponse non lisible)";
      }

      if (thinking) thinking.remove();
      showError(
        buildFriendlyError(json, status),
        json || raw
      );
      return;
    }

    const data = await res.json();
    const reply =
      data.choices?.[0]?.message?.content?.trim() ??
      "(Pas de réponse reçue)";

    if (thinking) thinking.remove();

    appendBubble("assistant", reply);
    aiHistory.push({ role: "assistant", content: reply });

  } catch (err) {
    if (thinking) thinking.remove();
    showError(
      "Erreur réseau ou serveur. Vérifie que le backend tourne.",
      String(err)
    );
  } finally {
    isSending = false;
    if (sendBtn) sendBtn.disabled = false;
  }
}

/* ---------------------------------------------------------
   FRIENDLY ERROR MESSAGES
--------------------------------------------------------- */
function buildFriendlyError(errorJson, status) {
  if (!errorJson || typeof errorJson !== "object") {
    return "Erreur lors de l’appel API. Vérifie que le serveur Python est lancé.";
  }

  const err = errorJson.error || {};
  const code = err.code || "";

  if (code === "insufficient_quota") {
    return "Quota OpenAI dépassé. Vérifie ton plan sur platform.openai.com.";
  }
  if (code === "invalid_api_key") {
    return "Clé API OpenAI invalide côté serveur.";
  }
  if (status === 401) {
    return "Authentification OpenAI refusée (401).";
  }
  if (status === 429) {
    return "Limite de requêtes atteinte. Réessaie plus tard.";
  }
  if (status >= 500) {
    return "Erreur interne OpenAI. Réessaie plus tard.";
  }

  return "Erreur API. Vérifie la connexion ou le serveur.";
}

/* ---------------------------------------------------------
   UI INITIALISATION
--------------------------------------------------------- */
export function initAIChat() {
  const fab = qs("ai-fab");
  const backdrop = qs("ai-panel-backdrop");
  const sendBtn = qs("ai-chat-send");
  const input = qs("ai-chat-input");
  const modelInput = qs("ai-model");
  const providerSelect = qs("ai-provider");
  const settingsToggle = qs("ai-settings-toggle");
  const settingsPanel = qs("ai-settings");
  const closeBtn = qs("ai-panel-close");

  if (!fab || !backdrop || !sendBtn || !input || !modelInput || !providerSelect || !settingsToggle || !settingsPanel || !closeBtn) {
    console.warn("[AI] Elements UI manquants, initAIChat annulée.");
    return;
  }

  /* Ouvrir panneau IA */
  fab.addEventListener("click", () => {
    backdrop.classList.add("visible");

    if (aiHistory.length === 0) {
      appendSystemMessage(
        "Je suis ton conseiller IA. Pose-moi des questions sur tes chemins, " +
          "ta progression, tes objectifs ou tes priorités !"
      );
    }
  });

  /* Fermer via le bouton ✕ */
  closeBtn.addEventListener("click", () => {
    backdrop.classList.remove("visible");
  });

  /* Fermer en cliquant sur l’arrière-plan */
  backdrop.addEventListener("click", e => {
    if (e.target === backdrop) backdrop.classList.remove("visible");
  });

  /* Envoi message */
  sendBtn.addEventListener("click", () => sendChatMessage(input.value));

  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage(input.value);
    }
  });

  input.addEventListener("input", () => {
    input.style.height = "32px";
    input.style.height = Math.min(input.scrollHeight, 90) + "px";
  });

  /* Paramètres IA */
  providerSelect.value = aiConfig.provider;
  modelInput.value = aiConfig.model;

  providerSelect.addEventListener("change", () => {
    aiConfig.provider = providerSelect.value;
    saveAIConfig();
  });

  modelInput.addEventListener("change", () => {
    aiConfig.model = modelInput.value.trim() || "gpt-4o-mini";
    saveAIConfig();
  });

  /* Toggle settings */
  settingsToggle.addEventListener("click", () =>
    settingsPanel.classList.toggle("visible")
  );
}
