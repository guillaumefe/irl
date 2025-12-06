/**
 * js/ui.community.js
 * ---------------------------------------------------------
 * Gestion de la section "Communauté" :
 *  - Recherche de LifePaths communautaires via l'API
 *  - Affichage des résultats
 *  - Installation d'un LifePath dans la carte locale
 *  - Création / publication d'un LifePath simple (1 étape)
 * ---------------------------------------------------------
 */

import { LifePathAPI } from "./core.api.js";
import {
  getPlayerState,
  savePlayerState,
} from "./core.state.js";
import { getLifePaths, STEP_STATE } from "./ui.paths.js";

/* ---------------------------------------------------------
   UTILITAIRES
--------------------------------------------------------- */

function ensurePlayerId() {
  const player = getPlayerState();
  if (!player.id) {
    player.id = crypto.randomUUID();
    savePlayerState(player);
  }
  return player.id;
}

/**
 * Initialise les stepStates pour un LifePath donné.
 * La première étape passe en CURRENT, les autres en LOCKED.
 */
function initStepStatesForPath(path) {
  const player = getPlayerState();
  if (!player.stepStates) player.stepStates = {};

  path.stages.forEach((stage, index) => {
    if (!player.stepStates[stage.id]) {
      player.stepStates[stage.id] =
        index === 0 ? STEP_STATE.CURRENT : STEP_STATE.LOCKED;
    }
  });

  savePlayerState(player);
}

/**
 * Ajoute un LifePath communautaire à la carte locale.
 * - l'ajoute à LIFE_PATHS (via référence renvoyée par getLifePaths)
 * - initialise les stepStates
 * - met à jour installedPaths dans le playerState
 */
function installCommunityLifePath(path) {
  const lifePaths = getLifePaths();
  if (lifePaths.some((p) => p.id === path.id)) {
    alert("Ce LifePath est déjà présent sur ta carte.");
    return;
  }

  lifePaths.push(path);
  initStepStatesForPath(path);

  const player = getPlayerState();
  if (!Array.isArray(player.installedPaths)) {
    player.installedPaths = [];
  }
  if (!player.installedPaths.includes(path.id)) {
    player.installedPaths.push(path.id);
  }
  savePlayerState(player);

  alert("LifePath ajouté à ta carte !");
}

/* ---------------------------------------------------------
   RENDER PRINCIPAL
--------------------------------------------------------- */

export function renderCommunity() {
  const section = document.getElementById("section-community");
  if (!section) return;

  section.innerHTML = `
    <h2>🌐 LifePaths de la communauté</h2>
    <p class="section-subtitle">
      Cherche de nouveaux chemins et publie les tiens.
    </p>

    <!-- Recherche -->
    <div class="community-block">
      <h3>🔎 Recherche</h3>
      <div class="community-form-row">
        <input
          id="community-search-input"
          class="community-input"
          placeholder="Mot-clé, domaine, tag..."
        />
        <button id="community-search-btn" class="community-btn-primary">
          Rechercher
        </button>
      </div>
      <div id="community-results" class="community-results"></div>
    </div>

    <!-- Création -->
    <div class="community-block">
      <h3>✏️ Créer un LifePath</h3>
      <p class="community-hint">
        Version simple : un chemin avec une étape principale. Tu pourras l’étendre plus tard.
      </p>

      <div class="community-form-row">
        <input
          id="lp-create-name"
          class="community-input"
          placeholder="Nom du LifePath"
        />
      </div>

      <div class="community-form-row">
        <input
          id="lp-create-domain"
          class="community-input"
          placeholder="Domaine (Carrière, Santé…)"
        />
      </div>

      <div class="community-form-row">
        <input
          id="lp-create-tags"
          class="community-input"
          placeholder="Tags (séparés par des virgules)"
        />
      </div>

      <div class="community-form-row">
        <textarea
          id="lp-create-description"
          class="community-input community-textarea"
          placeholder="Description générale du chemin"
          rows="3"
        ></textarea>
      </div>

      <div class="community-form-row">
        <button id="lp-create-submit" class="community-btn-primary">
          🚀 Publier
        </button>
      </div>
    </div>
  `;

  const searchBtn = document.getElementById("community-search-btn");
  const publishBtn = document.getElementById("lp-create-submit");

  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      doCommunitySearch();
    });
  }

  if (publishBtn) {
    publishBtn.addEventListener("click", () => {
      createAndPublishLifePath();
    });
  }
}

/* ---------------------------------------------------------
   RECHERCHE
--------------------------------------------------------- */

async function doCommunitySearch() {
  const input = document.getElementById("community-search-input");
  const container = document.getElementById("community-results");
  if (!container || !input) return;

  const query = input.value.trim();

  container.innerHTML = `
    <div class="community-empty">
      <span class="community-empty-icon">⏳</span>
      <span>Recherche en cours…</span>
    </div>
  `;

  try {
    const list = await LifePathAPI.search({ query, language: "fr" });

    if (!Array.isArray(list) || !list.length) {
      container.innerHTML = `
        <div class="community-empty">
          <span class="community-empty-icon">🔍</span>
          <span>Aucun LifePath trouvé.</span>
        </div>
      `;
      return;
    }

    container.innerHTML = list.map((path) => renderPathCard(path)).join("");

    // Bind boutons "Ajouter à ma carte"
    container.querySelectorAll(".community-install-btn").forEach((btn) => {
      const id = btn.getAttribute("data-path-id");
      const path = list.find((p) => String(p.id) === String(id));
      if (!path) return;
      btn.addEventListener("click", () => installCommunityLifePath(path));
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = `
      <div class="community-empty">
        <span class="community-empty-icon">⚠️</span>
        <span>Erreur de recherche. Vérifie que le serveur tourne.</span>
      </div>
    `;
  }
}

function renderPathCard(path) {
  const baseIcon = path.baseIcon || "🧭";
  const domainIcon = path.domainIcon || "📁";
  const domain = path.domain || "Divers";
  const authorName = path.authorName || "Anonyme";
  const description = path.description || "";

  // on ne connaît pas forcément difficulty / stages côté API
  const diff = path.difficulty || 2;
  const stars = Array.from({ length: 5 })
    .map((_, i) => (i < diff ? "★" : "☆"))
    .join("");

  return `
    <article class="community-card">
      <header class="community-card-header">
        <div class="community-card-main">
          <div class="community-card-title-row">
            <span class="community-card-icon">${baseIcon}</span>
            <span class="community-card-title">${path.name}</span>
          </div>
          <div class="community-card-meta">
            <span>${domainIcon} ${domain}</span>
            <span class="community-dot">•</span>
            <span>👤 ${authorName}</span>
            <span class="community-dot">•</span>
            <span>Diff. ${stars}</span>
          </div>
        </div>
        <button
          type="button"
          class="community-btn-primary community-install-btn"
          data-path-id="${path.id}"
        >
          ⬇️ Ajouter à ma carte
        </button>
      </header>
      <p class="community-card-description">${description}</p>
    </article>
  `;
}

/* ---------------------------------------------------------
   CRÉATION / PUBLICATION
--------------------------------------------------------- */

async function createAndPublishLifePath() {
  const nameInput = document.getElementById("lp-create-name");
  const domainInput = document.getElementById("lp-create-domain");
  const tagsInput = document.getElementById("lp-create-tags");
  const descInput = document.getElementById("lp-create-description");

  const name = nameInput.value.trim();
  const domain = domainInput.value.trim() || "Divers";
  const tagsRaw = tagsInput.value.trim();
  const description = descInput.value.trim();

  if (!name || !description) {
    alert("Nom et description sont obligatoires.");
    return;
  }

  const tags = tagsRaw
    ? tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const now = new Date().toISOString();
  const playerId = ensurePlayerId();

  const newPath = {
    id: "user-" + crypto.randomUUID(),
    name,
    description,
    domain,
    domainIcon: "📁",
    baseIcon: "🧭",
    difficulty: 2,
    language: "fr",
    tags,
    authorId: playerId,
    authorName: "Joueur " + playerId.slice(0, 6),
    visibility: "public",
    createdAt: now,
    updatedAt: now,
    stages: [
      {
        id: "stage-" + crypto.randomUUID(),
        label: name,
        key: "Step 1",
        xp: 50,
        stats: { mind: 1, body: 0, social: 0 },
        description,
      },
    ],
  };

  try {
    const saved = await LifePathAPI.create(newPath);
    alert("LifePath publié pour la communauté !");
    installCommunityLifePath(saved || newPath);

    // Reset des champs
    nameInput.value = "";
    domainInput.value = "";
    tagsInput.value = "";
    descInput.value = "";
  } catch (err) {
    console.error(err);
    alert(
      "Erreur lors de la publication. Vérifie que le serveur Python tourne et que /api/lifepaths est disponible."
    );
  }
}
