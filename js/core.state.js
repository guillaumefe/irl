/**
 * js/core.state.js
 * ---------------------------------------------------------
 * Gestion centrale de l'état du joueur (offline-first).
 *
 * - stockage dans localStorage
 * - XP, niveau, stats (mind/body/social)
 * - monnaie (currency)
 * - quêtes actives, états des étapes (stepStates)
 * - avatar & inventaire
 *
 * Aucune dépendance aux modules UI.
 * ---------------------------------------------------------
 */

export const STORAGE_PLAYER = "lifepath-player-v1";
const XP_PER_LEVEL = 100;

// Etat en mémoire (singleton)
let playerState = null;

/* ---------------------------------------------------------
   HELPERS
--------------------------------------------------------- */

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // fallback
  return "player-" + Math.random().toString(36).slice(2);
}

function makeDefaultPlayerState() {
  return {
    id: generateId(),
    xp: 0,
    level: 1,
    currency: 0,

    stats: {
      mind: 1,
      body: 1,
      social: 1,
    },

    // { [stepId]: "locked" | "current" | "completed" }
    stepStates: {},

    // [stepId, ...]
    activeQuests: [],

    // [pathId, ...]
    installedPaths: [],

    avatar: {
      base: "humanoid-1",
      skin: "medium",
      hair: "short-brown",
      outfit: null,
      accessories: [],
    },

    inventory: {
      // liste d'IDs d'items (store)
      items: [],
    },
  };
}

/**
 * S'assure que tous les champs nécessaires sont présents
 * sur un état existant (pour compatibilité ascendante).
 */
function normalizeState(state) {
  const base = makeDefaultPlayerState();

  const merged = {
    ...base,
    ...state,
    stats: {
      ...base.stats,
      ...(state.stats || {}),
    },
    avatar: {
      ...base.avatar,
      ...(state.avatar || {}),
    },
    inventory: {
      ...base.inventory,
      ...(state.inventory || {}),
    },
  };

  merged.stepStates = state.stepStates || {};
  merged.activeQuests = Array.isArray(state.activeQuests)
    ? state.activeQuests
    : [];
  merged.installedPaths = Array.isArray(state.installedPaths)
    ? state.installedPaths
    : [];

  // recalcul du niveau depuis l'XP
  recalcLevel(merged);

  return merged;
}

/* ---------------------------------------------------------
   (RE)CALCUL NIVEAU
--------------------------------------------------------- */

export function recalcLevel(state) {
  const xp = state.xp || 0;
  state.level = Math.floor(xp / XP_PER_LEVEL) + 1;
}

/* ---------------------------------------------------------
   LOAD / SAVE
--------------------------------------------------------- */

export function loadPlayerState() {
  if (playerState) return playerState;

  try {
    const raw = localStorage.getItem(STORAGE_PLAYER);
    if (!raw) {
      playerState = makeDefaultPlayerState();
      localStorage.setItem(STORAGE_PLAYER, JSON.stringify(playerState));
      return playerState;
    }
    const parsed = JSON.parse(raw);
    playerState = normalizeState(parsed);
    localStorage.setItem(STORAGE_PLAYER, JSON.stringify(playerState));
    return playerState;
  } catch (e) {
    console.warn("Erreur lors du chargement de l'état joueur, réinitialisation.", e);
    playerState = makeDefaultPlayerState();
    localStorage.setItem(STORAGE_PLAYER, JSON.stringify(playerState));
    return playerState;
  }
}

/**
 * Retourne l'état courant (en le chargeant si nécessaire).
 */
export function getPlayerState() {
  if (!playerState) {
    return loadPlayerState();
  }
  return playerState;
}

/**
 * Sauvegarde l'état (ou fusionne un patch partiel).
 * - si newState est fourni : remplace intégralement l'état en mémoire
 * - si patch est fourni : fusionne partiellement
 */
export function savePlayerState(newStateOrPatch) {
  if (!playerState) {
    playerState = makeDefaultPlayerState();
  }

  if (newStateOrPatch) {
    if (newStateOrPatch.id && newStateOrPatch.xp !== undefined) {
      // on considère que c'est un état complet
      playerState = normalizeState(newStateOrPatch);
    } else {
      // patch partiel
      playerState = normalizeState({
        ...playerState,
        ...newStateOrPatch,
      });
    }
  }

  try {
    localStorage.setItem(STORAGE_PLAYER, JSON.stringify(playerState));
  } catch (e) {
    console.warn("Impossible de sauvegarder l'état joueur.", e);
  }

  return playerState;
}

/* ---------------------------------------------------------
   RESET COMPLET
--------------------------------------------------------- */

export function resetPlayerState({ keepId = true } = {}) {
  const old = getPlayerState();
  const fresh = makeDefaultPlayerState();
  if (keepId) {
    fresh.id = old.id || generateId();
  }
  playerState = fresh;
  savePlayerState(playerState);
  return playerState;
}

/* ---------------------------------------------------------
   XP / STATS / CURRENCY
--------------------------------------------------------- */

export function addXP(amount) {
  const s = getPlayerState();
  const delta = Math.max(0, Number(amount) || 0);
  const oldLevel = s.level;

  s.xp = (s.xp || 0) + delta;
  recalcLevel(s);

  savePlayerState(s);

  return {
    levelBefore: oldLevel,
    levelAfter: s.level,
    xpAdded: delta,
  };
}

export function addStats(delta = {}) {
  const s = getPlayerState();
  ["mind", "body", "social"].forEach((k) => {
    const inc = Number(delta[k] || 0);
    s.stats[k] = (s.stats[k] || 0) + inc;
  });
  savePlayerState(s);
  return s.stats;
}

export function getCurrency() {
  return getPlayerState().currency || 0;
}

export function addCurrency(amount) {
  const s = getPlayerState();
  const delta = Number(amount) || 0;
  s.currency = (s.currency || 0) + delta;
  if (s.currency < 0) s.currency = 0;
  savePlayerState(s);
  return s.currency;
}

export function spendCurrency(amount) {
  const delta = Math.abs(Number(amount) || 0);
  const s = getPlayerState();
  if ((s.currency || 0) < delta) {
    return false; // pas assez de monnaie
  }
  s.currency -= delta;
  savePlayerState(s);
  return true;
}

/* ---------------------------------------------------------
   STEP STATES & QUÊTES
--------------------------------------------------------- */

/**
 * Définit l'état d'une étape.
 */
export function setStepState(stepId, newState) {
  if (!stepId) return;
  const s = getPlayerState();
  s.stepStates[stepId] = newState;
  savePlayerState(s);
}

/**
 * Marque une étape comme quête active.
 */
export function setQuestActive(stepId) {
  if (!stepId) return;
  const s = getPlayerState();
  if (!Array.isArray(s.activeQuests)) s.activeQuests = [];
  if (!s.activeQuests.includes(stepId)) {
    s.activeQuests.push(stepId);
    savePlayerState(s);
  }
}

/**
 * Retire une étape des quêtes actives.
 */
export function setQuestInactive(stepId) {
  if (!stepId) return;
  const s = getPlayerState();
  if (!Array.isArray(s.activeQuests)) return;
  s.activeQuests = s.activeQuests.filter((id) => id !== stepId);
  savePlayerState(s);
}

/**
 * Nettoie toutes les quêtes actives (mais ne touche pas aux stepStates).
 */
export function clearActiveQuests() {
  const s = getPlayerState();
  s.activeQuests = [];
  savePlayerState(s);
}

/* ---------------------------------------------------------
   AVATAR & INVENTAIRE
--------------------------------------------------------- */

export function updateAvatar(partial) {
  const s = getPlayerState();
  s.avatar = {
    ...s.avatar,
    ...(partial || {}),
  };
  savePlayerState(s);
  return s.avatar;
}

export function getInventory() {
  const s = getPlayerState();
  if (!s.inventory) s.inventory = { items: [] };
  if (!Array.isArray(s.inventory.items)) s.inventory.items = [];
  return s.inventory;
}

export function addItemToInventory(itemId) {
  if (!itemId) return;
  const s = getPlayerState();
  if (!s.inventory) s.inventory = { items: [] };
  if (!Array.isArray(s.inventory.items)) s.inventory.items = [];
  if (!s.inventory.items.includes(itemId)) {
    s.inventory.items.push(itemId);
    savePlayerState(s);
  }
}

/**
 * Enlève un item (optionnel, au cas où).
 */
export function removeItemFromInventory(itemId) {
  const s = getPlayerState();
  if (!s.inventory || !Array.isArray(s.inventory.items)) return;
  s.inventory.items = s.inventory.items.filter((id) => id !== itemId);
  savePlayerState(s);
}

/* ---------------------------------------------------------
   SNAPSHOT POUR IA / SYNCHRO
--------------------------------------------------------- */

/**
 * Snapshot simplifié de l’état joueur
 * pour être envoyé à l’IA ou à la synchro.
 */
export function buildPlayerSnapshot() {
  const s = getPlayerState();
  return {
    id: s.id,
    xp: s.xp,
    level: s.level,
    currency: s.currency,
    stats: { ...s.stats },
    activeQuests: [...(s.activeQuests || [])],
    installedPaths: [...(s.installedPaths || [])],
    stepStates: { ...(s.stepStates || {}) },
    avatar: { ...(s.avatar || {}) },
    inventory: {
      items: Array.isArray(s.inventory?.items) ? [...s.inventory.items] : [],
    },
  };
}
