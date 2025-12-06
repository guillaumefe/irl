/**
 * js/core.api.js
 * ---------------------------------------------------------
 * Client HTTP centralisé pour l'app LifePath RPG.
 *
 * - Gère l'auth (token Bearer) via AuthAPI
 * - Fournit des helpers pour tous les endpoints backend :
 *    * AuthAPI       → /api/auth/...
 *    * LifePathAPI   → /api/lifepaths/...
 *    * StoreAPI      → /api/stores/...
 *    * ItemAPI       → /api/items/...
 *    * MarketAPI     → /api/market/...
 *    * ChatAPI       → /api/chat
 *    * LevelAPI      → /api/level-rewards
 * ---------------------------------------------------------
 */

const API_BASE =
  window.LIFEPATH_API_BASE ||
  ""; // "" = même origine (pratique en dev), sinon "https://api.mondomaine.com"

const AUTH_TOKEN_KEY = "lifepath-auth-token";
const AUTH_USER_KEY = "lifepath-auth-user";

/* ---------------------------------------------------------
   LOW-LEVEL TOKEN
--------------------------------------------------------- */

function getAuthToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

function setAuthToken(token) {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    // ignore
  }
}

function getCachedUser() {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCachedUser(user) {
  try {
    if (user) {
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(AUTH_USER_KEY);
    }
  } catch {
    // ignore
  }
}

/* ---------------------------------------------------------
   HELPER HTTP GÉNÉRIQUE
--------------------------------------------------------- */

async function apiFetch(path, { method = "GET", body, headers, auth = true } = {}) {
  const finalHeaders = {
    "Content-Type": "application/json",
    ...(headers || {}),
  };

  const token = getAuthToken();
  if (auth && token) {
    finalHeaders["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(API_BASE + path, {
    method,
    headers: finalHeaders,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }

  if (!res.ok) {
    const msg =
      (data && data.error && data.error.message) ||
      data?.message ||
      `Erreur API ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  return data;
}

/* ---------------------------------------------------------
   AUTH API
--------------------------------------------------------- */

export const AuthAPI = {
  /**
   * Signup anonyme → compte.
   * body attendu côté serveur : { email, password, displayName? }
   * Retour attendu : { token, user }
   */
  async signup({ email, password, displayName }) {
    const payload = { email, password, displayName };
    const data = await apiFetch("/api/auth/signup", {
      method: "POST",
      body: payload,
      auth: false,
    });
    if (data.token) setAuthToken(data.token);
    if (data.user) setCachedUser(data.user);
    return data;
  },

  /**
   * Login classique.
   * body : { email, password }
   * Retour : { token, user }
   */
  async login({ email, password }) {
    const payload = { email, password };
    const data = await apiFetch("/api/auth/login", {
      method: "POST",
      body: payload,
      auth: false,
    });
    if (data.token) setAuthToken(data.token);
    if (data.user) setCachedUser(data.user);
    return data;
  },

  /**
   * Logout : pas obligatoire côté serveur,
   * mais côté client on purge tout.
   */
  async logout() {
    try {
      await apiFetch("/api/auth/logout", {
        method: "POST",
        auth: true,
      });
    } catch {
      // si le backend n’a pas encore /logout, on ignore
    }
    setAuthToken(null);
    setCachedUser(null);
  },

  /**
   * Récupère l'utilisateur courant via /api/auth/me.
   * Si pas de token ou erreur 401 → null.
   */
  async me({ forceRefresh = false } = {}) {
    if (!forceRefresh) {
      const cached = getCachedUser();
      if (cached) return cached;
    }
    const token = getAuthToken();
    if (!token) return null;

    try {
      const data = await apiFetch("/api/auth/me", {
        method: "GET",
        auth: true,
      });
      if (data && data.user) {
        setCachedUser(data.user);
        return data.user;
      }
      return null;
    } catch (err) {
      if (err.status === 401) {
        setAuthToken(null);
        setCachedUser(null);
        return null;
      }
      throw err;
    }
  },

  isAuthenticated() {
    return !!getAuthToken();
  },

  getToken: getAuthToken,
};

/* ---------------------------------------------------------
   LIFEPATHS – API COMMUNAUTÉ
--------------------------------------------------------- */

export const LifePathAPI = {
  async search({ query, language = "fr" } = {}) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (language) params.set("lang", language);
    return apiFetch(`/api/lifepaths/search?${params.toString()}`, {
      method: "GET",
      auth: false, // recherche publique
    });
  },

  async create(lifePath) {
    // nécessite d’être auth pour publier
    return apiFetch("/api/lifepaths", {
      method: "POST",
      body: lifePath,
      auth: true,
    });
  },

  async getById(id) {
    return apiFetch(`/api/lifepaths/${encodeURIComponent(id)}`, {
      method: "GET",
      auth: false,
    });
  },
};

/* ---------------------------------------------------------
   STORES & ITEMS
--------------------------------------------------------- */

export const StoreAPI = {
  async createOrUpdateStore({ name, description }) {
    return apiFetch("/api/stores", {
      method: "POST",
      body: { name, description },
      auth: true,
    });
  },

  async getMyStore() {
    return apiFetch("/api/stores/me", {
      method: "GET",
      auth: true,
    });
  },

  async getStoreById(storeId) {
    return apiFetch(`/api/stores/${encodeURIComponent(storeId)}`, {
      method: "GET",
      auth: false,
    });
  },
};

export const ItemAPI = {
  async createItem({ storeId, name, type, price, emoji, fileId }) {
    return apiFetch("/api/items", {
      method: "POST",
      body: { storeId, name, type, price, emoji, fileId },
      auth: true,
    });
  },

  async listStoreItems(storeId) {
    return apiFetch(`/api/items?storeId=${encodeURIComponent(storeId)}`, {
      method: "GET",
      auth: false,
    });
  },

  async listAllItems() {
    return apiFetch("/api/items", {
      method: "GET",
      auth: false,
    });
  },
};

/**
 * Marketplace de tous les items, avec filtrage par query.
 */
export const MarketAPI = {
  async searchItems({ query } = {}) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    return apiFetch(`/api/market/items?${params.toString()}`, {
      method: "GET",
      auth: false,
    });
  },
};

/* ---------------------------------------------------------
   FICHIERS CHIFFRÉS (upload & download)
--------------------------------------------------------- */

export const FileAPI = {
  /**
   * Upload d’un fichier déjà CHIFFRÉ côté client.
   * Ici on attend un body de type FormData côté appelant,
   * donc on ne passe pas par apiFetch (pas de JSON).
   */
  async uploadEncryptedFile(formData) {
    const token = getAuthToken();
    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(API_BASE + "/api/files/upload", {
      method: "POST",
      headers,
      body: formData,
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error("Erreur upload fichier : " + txt);
    }

    return res.json(); // ex: { fileId: "xxx" }
  },

  /**
   * Download d’un fichier chiffré : on laisse au code appelant
   * le soin de déchiffrer avec le mot de passe.
   */
  async downloadEncryptedFile(fileId) {
    const token = getAuthToken();
    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(
      API_BASE + `/api/files/${encodeURIComponent(fileId)}`,
      { method: "GET", headers }
    );

    if (!res.ok) {
      const txt = await res.text();
      throw new Error("Erreur download fichier : " + txt);
    }

    const blob = await res.blob();
    return blob;
  },
};

/* ---------------------------------------------------------
   CHAT IA
--------------------------------------------------------- */

export const ChatAPI = {
  async sendChat({ model, messages }) {
    return apiFetch("/api/chat", {
      method: "POST",
      body: { model, messages },
      auth: true, // on veut lier la conversation au user côté serveur
    });
  },
};

/* ---------------------------------------------------------
   LEVEL REWARDS
--------------------------------------------------------- */

export const LevelAPI = {
  async getLevelRewards(fromLevel, toLevel) {
    const params = new URLSearchParams();
    if (fromLevel != null) params.set("from", String(fromLevel));
    if (toLevel != null) params.set("to", String(toLevel));

    return apiFetch(`/api/level-rewards?${params.toString()}`, {
      method: "GET",
      auth: true,
    });
  },
};
