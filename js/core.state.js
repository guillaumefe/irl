export const STORAGE_PLAYER = "lifepath-player-v1";

export const DEFAULT_PLAYER = {
  id: null,
  xp: 0,
  level: 1,
  stats: { mind: 1, body: 1, social: 1 },
  currency: 0,
  installedPaths: [],
  stepStates: {},
  activeQuests: [],
  avatar: {
    base: "humanoid-1",
    skin: "medium",
    hair: "short-brown",
    outfit: null,
    accessories: []
  },
  inventory: { items: [] }
};

let playerState = null;

/* Load or initialize */
export function loadPlayerState() {
  const raw = localStorage.getItem(STORAGE_PLAYER);
  if (!raw) {
    playerState = structuredClone(DEFAULT_PLAYER);
    savePlayerState();
    return playerState;
  }
  playerState = JSON.parse(raw);
  return playerState;
}

export function savePlayerState() {
  localStorage.setItem(STORAGE_PLAYER, JSON.stringify(playerState));
}

export function getPlayerState() {
  return playerState;
}

/* Utilities */
export function addXP(amount) {
  playerState.xp += amount;
  playerState.level = Math.floor(playerState.xp / 100) + 1;
  savePlayerState();
}

export function updateStats(delta) {
  ["mind", "body", "social"].forEach(k => {
    playerState.stats[k] += (delta[k] || 0);
  });
  savePlayerState();
}
