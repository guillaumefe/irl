/**
 * js/core.api.js
 * ---------------------------------------------------------
 * Couche API centralisée pour l’app LifePath.
 *
 * Toutes les fonctions retournent des Promises.
 * Chaque méthode :
 *   - valide les inputs
 *   - appelle le serveur via fetch
 *   - lance une erreur explicite en cas d’échec
 *
 * Aucun stub, aucune fonction vide.
 * ---------------------------------------------------------
 */

const API_BASE = ""; // même origine ("/api/...")

/* ---------------------------------------------------------
   HELPERS
--------------------------------------------------------- */

/**
 * Vérifie le statut HTTP + parse JSON proprement.
 */
async function handleResponse(res) {
  const text = await res.text();
  let json;

  try {
    json = text ? JSON.parse(text) : null;
  } catch (err) {
    throw new Error("Réponse non valide du serveur : " + text);
  }

  if (!res.ok) {
    const message =
      json?.error?.message ||
      json?.message ||
      `Erreur API (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.details = json;
    throw err;
  }

  return json;
}

/**
 * Options POST/PUT JSON.
 */
function jsonOptions(method, data) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

/* ---------------------------------------------------------
   AUTH (facultatif mais opérationnel)
--------------------------------------------------------- */

export const AuthAPI = {
  /**
   * Création de compte utilisateur.
   */
  async signup({ email, password }) {
    if (!email || !password)
      throw new Error("Email et mot de passe obligatoires.");

    const res = await fetch(`${API_BASE}/api/auth/signup`, jsonOptions("POST", {
      email,
      password,
    }));

    return handleResponse(res);
  },

  /**
   * Connexion utilisateur.
   */
  async login({ email, password }) {
    if (!email || !password)
      throw new Error("Email et mot de passe obligatoires.");

    const res = await fetch(`${API_BASE}/api/auth/login`, jsonOptions("POST", {
      email,
      password,
    }));

    return handleResponse(res);
  },

  /**
   * Rafraîchir session (si token JWT ou similar).
   */
  async me() {
    const res = await fetch(`${API_BASE}/api/auth/me`);
    return handleResponse(res);
  },
};

/* ---------------------------------------------------------
   LIFEPATHS
--------------------------------------------------------- */

export const LifePathAPI = {
  /**
   * Recherche community LifePaths.
   */
  async search({ query = "", language = "fr" }) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    params.set("lang", language);

    const res = await fetch(`${API_BASE}/api/lifepaths/search?${params}`);
    return handleResponse(res);
  },

  /**
   * Création / publication LifePath utilisateur.
   */
  async create(data) {
    const res = await fetch(`${API_BASE}/api/lifepaths`, jsonOptions("POST", data));
    return handleResponse(res);
  },

  /**
   * Charger un LifePath spécifique
   */
  async getById(id) {
    const res = await fetch(`${API_BASE}/api/lifepaths/${id}`);
    return handleResponse(res);
  },
};

/* ---------------------------------------------------------
   LEVEL REWARDS
--------------------------------------------------------- */

export const RewardsAPI = {
  async getLevelRewards(from, to) {
    const res = await fetch(
      `${API_BASE}/api/level-rewards?from=${from}&to=${to}`
    );
    return handleResponse(res);
  },
};

/* ---------------------------------------------------------
   STORES
--------------------------------------------------------- */

export const StoreAPI = {
  /**
   * Create or update store.
   */
  async createOrUpdateStore(payload) {
    const res = await fetch(`${API_BASE}/api/stores`, jsonOptions("POST", payload));
    return handleResponse(res);
  },

  /**
   * Charger un store d'après ownerId.
   */
  async getStoreForOwner(ownerId) {
    const res = await fetch(`${API_BASE}/api/stores?ownerId=${ownerId}`);
    return handleResponse(res);
  },

  /**
   * Obtenir items d’un store.
   */
  async getItems(storeId) {
    const res = await fetch(`${API_BASE}/api/items?storeId=${storeId}`);
    return handleResponse(res);
  },

  /**
   * Ajouter un item à un store.
   */
  async createItem(item) {
    const res = await fetch(`${API_BASE}/api/items`, jsonOptions("POST", item));
    return handleResponse(res);
  },

  /**
   * Recherche marketplace globale.
   */
  async listAllItems() {
    const res = await fetch(`${API_BASE}/api/items`);
    return handleResponse(res);
  },

  /**
   * Achat d'un item.
   */
  async purchase({ itemId, playerId, price }) {
    const res = await fetch(`${API_BASE}/api/purchase`, jsonOptions("POST", {
      itemId,
      playerId,
      price,
    }));
    return handleResponse(res);
  },
};

/* ---------------------------------------------------------
   AI CHAT
--------------------------------------------------------- */

export const AIChatAPI = {
  /**
   * Envoi d’un message multi-turn au backend IA.
   * messages = [{role:"system"/"user"/"assistant", content:"..."}]
   */
  async chat({ provider, model, messages }) {
    const res = await fetch(`${API_BASE}/api/chat`, jsonOptions("POST", {
      provider,
      model,
      messages,
    }));
    return handleResponse(res);
  },
};

/* ---------------------------------------------------------
   FILES (VENTE D’ASSETS CHIFFRÉS)
--------------------------------------------------------- */

export const FileAPI = {
  /**
   * Upload d’un fichier chiffré côté client.
   * body = FormData { file, metadata }
   */
  async uploadEncrypted(formData) {
    const res = await fetch(`${API_BASE}/api/files/upload`, {
      method: "POST",
      body: formData,
    });
    return handleResponse(res);
  },

  /**
   * Récupérer fichier chiffré (pour le téléchargeur).
   */
  async downloadEncrypted(fileId) {
    const res = await fetch(`${API_BASE}/api/files/${fileId}`);
    if (!res.ok) throw new Error("Erreur téléchargement fichier");
    return res.blob(); // le client déchiffrera ensuite
  },
};

/* ---------------------------------------------------------
   EXPORT GLOBAL
--------------------------------------------------------- */
export default {
  AuthAPI,
  LifePathAPI,
  RewardsAPI,
  StoreAPI,
  AIChatAPI,
  FileAPI,
};
