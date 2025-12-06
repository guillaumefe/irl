/**
 * js/ui.paths.js
 * ---------------------------------------------------------
 * Affichage et gestion des LifePaths locaux (carte).
 * - BASE_LIFE_PATHS : chemins par défaut
 * - STEP_STATE : locked/current/completed
 * - initialisation des stepStates du joueur
 * - calcul de progression
 * - rendu de la carte
 * - ajout de quêtes actives au clic
 * ---------------------------------------------------------
 */

import { getPlayerState, savePlayerState } from "./core.state.js";

export const STEP_STATE = {
  LOCKED: "locked",
  CURRENT: "current",
  COMPLETED: "completed",
};

// Chemins de base locaux (similaires à ta version monolithique)
const BASE_LIFE_PATHS = [
  {
    id: "career-dev",
    domain: "Carrière",
    domainIcon: "💼",
    name: "Devenir Senior Dev",
    difficulty: 3,
    baseIcon: "💻",
    description: "De junior hésitant à mage du code senior.",
    stages: [
      {
        id: "career-dev-1",
        label: "Bases solides",
        key: "Fundamentals",
        xp: 50,
        stats: { mind: 1, body: 0, social: 0 },
        description:
          "Structurer ton socle : Git, algos, bonnes pratiques, patterns de base.",
      },
      {
        id: "career-dev-2",
        label: "Projet perso",
        key: "Side Project",
        xp: 70,
        stats: { mind: 1, body: 0, social: 1 },
        description:
          "Construire un projet que tu peux montrer fièrement.",
      },
    ],
  },
  {
    id: "health-athlete",
    domain: "Santé",
    domainIcon: "⚔️",
    name: "Mode Héros en forme",
    difficulty: 2,
    baseIcon: "🏃‍♂️",
    description: "Transformer ton corps en vraie barre de stats physique.",
    stages: [
      {
        id: "health-1",
        label: "Routine minimum",
        key: "Daily Move",
        xp: 40,
        stats: { mind: 0, body: 1, social: 0 },
        description:
          "10–20 minutes de mouvement par jour pour sortir du mode AFK.",
      },
      {
        id: "health-2",
        label: "Force de base",
        key: "Strength",
        xp: 60,
        stats: { mind: 0, body: 1, social: 0 },
        description:
          "3 séances musculaires / semaine pendant un mois complet.",
      },
    ],
  },
];

// Tableau mutable pour accueillir ensuite les LifePaths communautaires
const LIFE_PATHS = [...BASE_LIFE_PATHS];

/**
 * Permettra à d’autres modules (community, quests…) de lire la liste.
 */
export function getLifePaths() {
  return LIFE_PATHS;
}

/* ---------------------------------------------------------
   INIT STEP STATES
--------------------------------------------------------- */

function ensureStepStatesInitialized() {
  const player = getPlayerState();
  if (!player.stepStates) player.stepStates = {};

  LIFE_PATHS.forEach((path) => {
    path.stages.forEach((stage, index) => {
      if (!player.stepStates[stage.id]) {
        player.stepStates[stage.id] =
          index === 0 ? STEP_STATE.CURRENT : STEP_STATE.LOCKED;
      }
    });
  });

  savePlayerState();
}

/* ---------------------------------------------------------
   UTILITAIRES
--------------------------------------------------------- */

/**
 * Calcule progression d’un LifePath pour le joueur actuel.
 */
function getPathProgress(path, player) {
  const total = path.stages.length;
  let completed = 0;
  path.stages.forEach((stage) => {
    if (player.stepStates[stage.id] === STEP_STATE.COMPLETED) {
      completed++;
    }
  });
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, pct };
}

/**
 * Ajoute la première étape du chemin en quête active.
 */
function addFirstStageAsActiveQuest(path) {
  const player = getPlayerState();
  const firstStage = path.stages[0];
  if (!firstStage) return;

  if (!Array.isArray(player.activeQuests)) {
    player.activeQuests = [];
  }

  if (!player.activeQuests.includes(firstStage.id)) {
    player.activeQuests.push(firstStage.id);
    savePlayerState();
    alert("Étape activée comme quête en cours.");
  } else {
    alert("Ce chemin a déjà une quête active.");
  }
}

/* ---------------------------------------------------------
   RENDER
--------------------------------------------------------- */

export function renderPaths() {
  const section = document.getElementById("section-map");
  if (!section) return;

  ensureStepStatesInitialized();
  const player = getPlayerState();

  if (!LIFE_PATHS.length) {
    section.innerHTML = `
      <h2>🗺️ Carte de ta vie</h2>
      <p>Aucun LifePath disponible pour l’instant.</p>
    `;
    return;
  }

  const cardsHtml = LIFE_PATHS.map((path) => {
    const progress = getPathProgress(path, player);

    const stars = Array.from({ length: 5 })
      .map((_, i) => (i < path.difficulty ? "★" : "☆"))
      .join("");

    let badgeLabel;
    let badgeClass = "lp-badge";
    if (progress.pct === 0) {
      badgeLabel = "🔒 Non commencé";
      badgeClass += " lp-badge-locked";
    } else if (progress.pct === 100) {
      badgeLabel = "🏆 Terminé (100%)";
      badgeClass += " lp-badge-complete";
    } else {
      badgeLabel = `🚶 ${progress.pct}%`;
      badgeClass += " lp-badge-progress";
    }

    return `
      <article class="lp-card" data-path-id="${path.id}">
        <header class="lp-card-header">
          <div class="lp-header-main">
            <div class="lp-name-row">
              <span class="lp-icon">${path.baseIcon}</span>
              <span class="lp-name">${path.name}</span>
            </div>
            <div class="lp-meta-row">
              <span>${path.domainIcon} ${path.domain}</span>
              <span class="lp-meta-dot">•</span>
              <span>${path.stages.length} étapes</span>
              <span class="lp-meta-dot">•</span>
              <span>Diff. ${stars}</span>
            </div>
          </div>
          <div class="${badgeClass}">
            ${badgeLabel}
          </div>
        </header>
        <p class="lp-description">${path.description}</p>
        <footer class="lp-footer">
          <button class="lp-start-btn" type="button">
            🎯 Lancer / Continuer ce chemin
          </button>
        </footer>
      </article>
    `;
  }).join("");

  section.innerHTML = `
    <h2>🗺️ Carte de ta vie</h2>
    <p class="section-subtitle">
      Tes chemins actuels et leur progression.
    </p>
    <div class="lp-list">
      ${cardsHtml}
    </div>
  `;

  // Binding des listeners sur chaque carte
  const cards = section.querySelectorAll(".lp-card");
  cards.forEach((card) => {
    const pathId = card.getAttribute("data-path-id");
    const path = LIFE_PATHS.find((p) => p.id === pathId);
    if (!path) return;

    const btn = card.querySelector(".lp-start-btn");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      addFirstStageAsActiveQuest(path);
    });

    // Au clic sur la carte complète, même comportement
    card.addEventListener("click", () => {
      addFirstStageAsActiveQuest(path);
    });
  });
}
