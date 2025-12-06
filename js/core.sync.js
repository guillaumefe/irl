/**
 * js/core.sync.js
 * ---------------------------------------------------------
 * Synchronisation entre l'état joueur local (offline-first)
 * et le backend.
 *
 * Fonctionnalités :
 *  - Versioning local/distant
 *  - Merge automatique des diff
 *  - Envoi + récupération du snapshot
 *  - Chiffrement AES-GCM optionnel côté client
 *  - Fallback offline (aucune perte de données)
 *
 * Aucune dépendance UI. S'utilise partout dans l'app.
 * ---------------------------------------------------------
 */

import {
  getPlayerState,
  savePlayerState,
  buildPlayerSnapshot,
} from "./core.state.js";
import { AuthAPI } from "./core.api.js"; // prévu si tu ajoutes auth plus tard

const STORAGE_SYNC_META = "lifepath-sync-meta-v1";
const STORAGE_ENCRYPT_KEY = "lifepath-sync-key"; // clé AES persistée si générée
const API_BASE = ""; // même origine: "" ou "https://api.example.com"

/* ---------------------------------------------------------
   META DE SYNC (versions locales)
--------------------------------------------------------- */

function loadSyncMeta() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_SYNC_META)) || {
      localVersion: 1,
      lastSyncedVersion: 0,
      lastSync: null,
    };
  } catch {
    return {
      localVersion: 1,
      lastSyncedVersion: 0,
      lastSync: null,
    };
  }
}

function saveSyncMeta(meta) {
  localStorage.setItem(STORAGE_SYNC_META, JSON.stringify(meta));
}

export function bumpLocalVersion() {
  const meta = loadSyncMeta();
  meta.localVersion++;
  saveSyncMeta(meta);
}

/* Chaque fois que ton app modifie l'état joueur :
   → tu peux appeler bumpLocalVersion()
   (ou automatiser ça dans core.state.js) */

/* ---------------------------------------------------------
   CRYPTO AES-GCM
--------------------------------------------------------- */

async function loadOrCreateAESKey() {
  const existing = localStorage.getItem(STORAGE_ENCRYPT_KEY);
  if (existing) {
    const raw = Uint8Array.from(JSON.parse(existing));
    return await crypto.subtle.importKey(
      "raw",
      raw,
      "AES-GCM",
      true,
      ["encrypt", "decrypt"]
    );
  }

  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  localStorage.setItem(STORAGE_ENCRYPT_KEY, JSON.stringify([...raw]));

  return key;
}

/**
 * Chiffre une donnée JSON.
 */
async function encryptState(obj) {
  const key = await loadOrCreateAESKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(obj));

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded)
  );

  return {
    iv: [...iv],
    data: [...ciphertext],
  };
}

/**
 * Déchiffre la donnée reçue du serveur.
 */
async function decryptState(payload) {
  const { iv, data } = payload;
  if (!iv || !data) throw new Error("Payload AES invalide");

  const key = await loadOrCreateAESKey();

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    key,
    new Uint8Array(data)
  );

  const txt = new TextDecoder().decode(decrypted);
  return JSON.parse(txt);
}

/* ---------------------------------------------------------
   MERGE INTELLIGENT
--------------------------------------------------------- */

function deepMerge(local, remote) {
  if (typeof local !== "object" || typeof remote !== "object" || !local || !remote) {
    return remote ?? local;
  }

  const merged = { ...local };

  for (const key of Object.keys(remote)) {
    const lv = local[key];
    const rv = remote[key];

    if (typeof rv === "object" && rv && !Array.isArray(rv)) {
      merged[key] = deepMerge(lv || {}, rv);
    } else {
      merged[key] = rv;
    }
  }

  return merged;
}

/**
 * Politique :
 * - Si remoteVersion > localVersion → remote prioritaire
 * - Sinon → local prioritaire
 * - Mais pour les objets, deepMerge utilise remote comme base
 */
function mergeStates(localState, remoteState, localVersion, remoteVersion) {
  if (remoteVersion > localVersion) {
    return { merged: deepMerge(localState, remoteState), winner: "remote" };
  }
  return { merged: deepMerge(remoteState, localState), winner: "local" };
}

/* ---------------------------------------------------------
   APPEL API /api/sync
--------------------------------------------------------- */

async function sendSyncPayload(payload) {
  const res = await fetch(`${API_BASE}/api/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error("Erreur sync serveur : " + txt);
  }

  return await res.json();
}

/* ---------------------------------------------------------
   SYNC PRINCIPALE
--------------------------------------------------------- */

export async function syncPlayerState({ encrypt = true } = {}) {
  const meta = loadSyncMeta();
  const local = buildPlayerSnapshot();
  const localVersion = meta.localVersion;

  let payload = {
    localVersion,
    encrypted: false,
    data: local,
  };

  if (encrypt) {
    payload = {
      localVersion,
      encrypted: true,
      data: await encryptState(local),
    };
  }

  try {
    const res = await sendSyncPayload(payload);

    let remoteState = res.data;
    if (res.encrypted) {
      remoteState = await decryptState(res.data);
    }

    const remoteVersion = res.remoteVersion || 0;

    const { merged, winner } = mergeStates(
      local,
      remoteState,
      localVersion,
      remoteVersion
    );

    savePlayerState(merged);

    const newMeta = {
      localVersion: Math.max(localVersion, remoteVersion) + 1,
      lastSyncedVersion: remoteVersion,
      lastSync: new Date().toISOString(),
    };

    saveSyncMeta(newMeta);

    return {
      ok: true,
      winner,
      remoteVersion,
      newState: merged,
    };
  } catch (err) {
    console.warn("Sync échouée, offline ?", err);

    const meta2 = loadSyncMeta();
    meta2.lastSync = null;
    saveSyncMeta(meta2);

    return {
      ok: false,
      error: err.message,
      offline: true,
    };
  }
}

/* ---------------------------------------------------------
   EXPORT / IMPORT LOCAL (debug / backup)
--------------------------------------------------------- */

export function exportLocalPlayerState() {
  return JSON.stringify(
    {
      state: buildPlayerSnapshot(),
      meta: loadSyncMeta(),
    },
    null,
    2
  );
}

export function importLocalPlayerState(jsonStr) {
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed.state) savePlayerState(parsed.state);
    if (parsed.meta) saveSyncMeta(parsed.meta);
    return true;
  } catch (e) {
    console.error("Import échoué", e);
    return false;
  }
}

/* ---------------------------------------------------------
   INIT SYNC (appelée depuis bootstrap.js)
--------------------------------------------------------- */

/**
 * Initialise la stratégie de sync :
 *  - fait une sync immédiate au démarrage
 *  - refait une sync quand on redevient online
 *  - (optionnel) refait une sync périodique
 */
export function initSync({
  encrypt = true,
  autoOnOnline = true,
  autoIntervalMs = 5 * 60 * 1000, // 5 minutes
} = {}) {
  // Sync immédiate au démarrage
  syncPlayerState({ encrypt }).catch((err) => {
    console.warn("[sync] Première sync échouée :", err);
  });

  // Quand le navigateur repasse online
  if (autoOnOnline && typeof window !== "undefined") {
    window.addEventListener("online", () => {
      syncPlayerState({ encrypt }).catch((err) => {
        console.warn("[sync] Sync lors du retour online échouée :", err);
      });
    });
  }

  // Sync périodique
  if (autoIntervalMs && autoIntervalMs > 0 && typeof window !== "undefined") {
    setInterval(() => {
      syncPlayerState({ encrypt }).catch((err) => {
        console.warn("[sync] Sync périodique échouée :", err);
      });
    }, autoIntervalMs);
  }
}
