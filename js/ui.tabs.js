/**
 * js/ui.tabs.js
 * ---------------------------------------------------------
 * Gestion des onglets principaux :
 *  - Carte (map)
 *  - Quêtes (quests)
 *  - Communauté (community)
 *  - Avatar (avatar)
 *  - Stores (store)
 *
 * Affiche / masque les sections correspondantes
 * et déclenche les renderers associés.
 * ---------------------------------------------------------
 */

import { renderPaths } from "./ui.paths.js";
import { renderQuests } from "./ui.quests.js";
import { renderCommunity } from "./ui.community.js";
import { renderAvatar } from "./ui.avatar.js";
import { renderStore } from "./ui.store.js";
import { renderPlayerBar } from "./ui.player.js";

/* ---------------------------------------------------------
   HELPERS
--------------------------------------------------------- */

function getSections() {
  return {
    map: document.getElementById("section-map"),
    quests: document.getElementById("section-quests"),
    community: document.getElementById("section-community"),
    avatar: document.getElementById("section-avatar"),
    store: document.getElementById("section-store"),
  };
}

/**
 * Cache toutes les sections, montre celle demandée.
 */
function showSection(targetName) {
  const sections = getSections();

  Object.entries(sections).forEach(([name, el]) => {
    if (!el) return;
    if (name === targetName) {
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  });
}

/**
 * Appelle le renderer adéquat pour l’onglet actif.
 */
function renderForTab(tabName) {
  // Toujours rafraîchir la player bar quand on change d’onglet
  renderPlayerBar();

  switch (tabName) {
    case "map":
      renderPaths();
      break;
    case "quests":
      renderQuests();
      break;
    case "community":
      renderCommunity();
      break;
    case "avatar":
      renderAvatar();
      break;
    case "store":
      renderStore();
      break;
    default:
      break;
  }
}

/* ---------------------------------------------------------
   ACTIVATION D’UN ONGLET
--------------------------------------------------------- */

function activateTab(tabName) {
  const tabs = document.querySelectorAll("[data-tab]");
  tabs.forEach((tab) => {
    if (tab.dataset.tab === tabName) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });

  showSection(tabName);
  renderForTab(tabName);
}

/* ---------------------------------------------------------
   PUBLIC : INIT
--------------------------------------------------------- */

export function initTabs() {
  const tabs = document.querySelectorAll("[data-tab]");
  if (!tabs.length) return;

  // Binding des onglets
  tabs.forEach((tab) => {
    const name = tab.dataset.tab;
    if (!name) return;
    tab.addEventListener("click", () => activateTab(name));
  });

  // Option : lien "Mon store" dans la barre joueur, s’il existe
  const storeLink = document.getElementById("meta-store-link");
  if (storeLink) {
    storeLink.addEventListener("click", () => {
      const storeTab = Array.from(tabs).find(
        (t) => t.dataset.tab === "store"
      );
      if (storeTab) {
        activateTab("store");
      }
    });
  }

  // Onglet par défaut : map
  activateTab("map");
}
