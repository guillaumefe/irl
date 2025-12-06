/**
 * js/core.theme.js
 * ---------------------------------------------------------
 * Gestion des thèmes LifePath (couleurs, apparence globale).
 *
 * - Utilise des CSS variables sur :root
 * - Sauvegarde dans localStorage
 * - Permet un thème par navigateur (non-auth) ou par user
 *   si tu branches ça sur ta logique d'auth / sync.
 *
 * Aucune dépendance aux autres modules.
 * ---------------------------------------------------------
 */

const STORAGE_THEME = "lifepath-theme-v1";

/**
 * Thème par défaut, aligné avec styles.css
 * (tu peux l’étendre si tu ajoutes d’autres variables).
 */
const DEFAULT_THEME = {
  "--bg-main": "#020617",
  "--bg-card": "rgba(15, 23, 42, 0.96)",
  "--accent": "#7c3aed",
  "--accent-alt": "#22c55e",
  "--text-main": "#f9fafb",
  "--text-muted": "#9ca3af",
  "--radius-lg": "16px",
  "--radius-full": "999px",
  "--shadow-soft": "0 12px 35px rgba(0, 0, 0, 0.4)",
};

/* ---------------------------------------------------------
   ACCÈS THÈME PAR DÉFAUT
--------------------------------------------------------- */

/**
 * Retourne une copie du thème par défaut.
 */
export function getDefaultTheme() {
  return { ...DEFAULT_THEME };
}

/* ---------------------------------------------------------
   LOAD / SAVE LOCAL
--------------------------------------------------------- */

export function loadTheme() {
  try {
    const raw = localStorage.getItem(STORAGE_THEME);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // merge avec default pour être robuste aux évolutions
    return {
      ...DEFAULT_THEME,
      ...(parsed || {}),
    };
  } catch (e) {
    console.warn("Erreur lors du chargement du thème, utilisation du thème par défaut.", e);
    return null;
  }
}

export function saveTheme(theme) {
  try {
    localStorage.setItem(STORAGE_THEME, JSON.stringify(theme));
  } catch (e) {
    console.warn("Impossible de sauvegarder le thème.", e);
  }
}

/* ---------------------------------------------------------
   APPLICATION DU THÈME
--------------------------------------------------------- */

/**
 * Applique un thème donné sur :root.
 * @param {Object} theme - dictionnaire { "--var-name": "value" }
 */
export function applyTheme(theme) {
  if (!theme) return;
  const root = document.documentElement;
  Object.entries(theme).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

/**
 * Applique le thème par défaut.
 */
export function applyDefaultTheme() {
  applyTheme(DEFAULT_THEME);
}

/* ---------------------------------------------------------
   MERGE / UPDATE
--------------------------------------------------------- */

/**
 * Met à jour le thème courant avec un patch partiel :
 * ex: updateTheme({ "--accent": "#ff0000" });
 */
export function updateTheme(patch) {
  if (!patch || typeof patch !== "object") return;

  const current = loadTheme() || getDefaultTheme();
  const merged = {
    ...current,
    ...patch,
  };

  saveTheme(merged);
  applyTheme(merged);

  return merged;
}

/**
 * Reset complet : efface le thème custom et remet le default.
 */
export function resetTheme() {
  try {
    localStorage.removeItem(STORAGE_THEME);
  } catch (e) {
    console.warn("Erreur lors de la suppression du thème personnalisé.", e);
  }
  applyDefaultTheme();
  return getDefaultTheme();
}

/* ---------------------------------------------------------
   EXPORT / IMPORT JSON (partage / debug)
--------------------------------------------------------- */

/**
 * Exporte le thème courant (ou défaut) en JSON pretty-print.
 */
export function exportThemeJSON() {
  const theme = loadTheme() || getDefaultTheme();
  return JSON.stringify(theme, null, 2);
}

/**
 * Importe un thème depuis une string JSON.
 * S’il est valide → sauvegarde + applique.
 */
export function importThemeJSON(jsonStr) {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Format JSON de thème invalide.");
    }
    const merged = {
      ...DEFAULT_THEME,
      ...parsed,
    };
    saveTheme(merged);
    applyTheme(merged);
    return merged;
  } catch (e) {
    console.error("Import de thème échoué :", e);
    throw e;
  }
}

/* ---------------------------------------------------------
   BOOTSTRAP HELPERS
--------------------------------------------------------- */

/**
 * À appeler au démarrage de l’app :
 * - charge un éventuel thème custom
 * - ou applique le thème par défaut.
 */
export function initTheme() {
  const stored = loadTheme();
  if (stored) {
    applyTheme(stored);
  } else {
    applyDefaultTheme();
  }
}
