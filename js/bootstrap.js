/**
 * js/bootstrap.js
 * ---------------------------------------------------------
 * Point d’entrée principal du client LifePath RPG
 * ---------------------------------------------------------
 * Rôle :
 *   - Charger les états (player, thème)
 *   - Initialiser la PWA et la synchronisation
 *   - Attacher les onglets
 *   - Initialiser toutes les vues
 *   - Initialiser le conseiller IA
 * ---------------------------------------------------------
 */

import { loadPlayerState, getPlayerState } from "./core.state.js";
import { initTheme } from "./core.theme.js";
import { initSync } from "./core.sync.js";

import { initTabs } from "./ui.tabs.js";
import { renderPaths } from "./ui.paths.js";
import { renderQuests } from "./ui.quests.js";
import { renderCommunity } from "./ui.community.js";
import { renderAvatar } from "./ui.avatar.js";
import { renderStore } from "./ui.store.js";
import { renderPlayerBar } from "./ui.player.js";

import { initAIChat } from "./ai.chat.js";

/* ---------------------------------------------------------
   SERVICE WORKER (PWA)
--------------------------------------------------------- */
async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  try {
    await navigator.serviceWorker.register("/service-worker.js");
    console.log("[PWA] Service worker enregistré.");
  } catch (err) {
    console.warn("[PWA] Échec de l’enregistrement du SW :", err);
  }
}

/* ---------------------------------------------------------
   INITIALISATION COMPLÈTE DE L’APPLICATION
--------------------------------------------------------- */

async function startApp() {
  console.log("🔧 LifePath RPG – Bootstrap…");

  /* 1) Initialisation thème utilisateur */
  initTheme();

  /* 2) Chargement état joueur (localStorage) */
  loadPlayerState();
  console.log("👤 PlayerState chargé :", getPlayerState());

  /* 3) Enregistre SW pour mode offline + PWA */
  await registerServiceWorker();

  /* 4) Initialisation synchronisation locale ↔ serveur */
  initSync();

  /* 5) Setup navigation + rendu initial */
  initTabs();

  // Les onglets appellent déjà le rendu correspondant
  // mais on appelle ici une passe de sécurité.
  renderPlayerBar();
  renderPaths();
  renderQuests();
  renderCommunity();
  renderAvatar();
  renderStore();

  /* 6) Initialisation du chat IA */
  initAIChat();

  console.log("🚀 LifePath RPG opérationnel !");
}

/* ---------------------------------------------------------
   Lancement une fois le DOM prêt
--------------------------------------------------------- */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp);
} else {
  startApp();
}
