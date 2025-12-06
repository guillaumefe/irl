/**
 * js/ui.quests.js
 * ---------------------------------------------------------
 * Gestion de la section "Quêtes" :
 *  - liste les étapes marquées comme quêtes actives
 *  - affiche chaque étape avec ses récompenses
 *  - permet de valider une étape :
 *      * STEP_STATE -> COMPLETED
 *      * +XP, +stats
 *      * débloque l'étape suivante du LifePath
 *      * retire la quête de la liste activeQuests
 * ---------------------------------------------------------
 */

import {
  getPlayerState,
  savePlayerState,
  addXP,
  addStats,
  setStepState,
  setQuestInactive,
} from "./core.state.js";
import { getLifePaths, STEP_STATE } from "./ui.paths.js";
import { renderPlayerBar } from "./ui.player.js";

/* ---------------------------------------------------------
   HELPERS
--------------------------------------------------------- */

/**
 * Retourne { path, stage } pour un stepId donné,
 * ou null si introuvable.
 */
function getStepById(stepId) {
  const lifePaths = getLifePaths();
  for (const path of lifePaths) {
    const stage = path.stages?.find((s) => s.id === stepId);
    if (stage) return { path, stage };
  }
  return null;
}

/**
 * Débloque l'étape suivante d'un LifePath,
 * si elle existe et est LOCKED.
 */
function unlockNextStep(path, currentStageId) {
  const stages = path.stages || [];
  const idx = stages.findIndex((s) => s.id === currentStageId);
  if (idx === -1) return;

  const next = stages[idx + 1];
  if (!next) return;

  const player = getPlayerState();
  const state = player.stepStates?.[next.id];

  if (state === STEP_STATE.LOCKED || !state) {
    setStepState(next.id, STEP_STATE.CURRENT);
  }
}

/**
 * Liste des quêtes actives non terminées.
 */
function getActiveQuestEntries() {
  const player = getPlayerState();
  const activeIds = Array.isArray(player.activeQuests)
    ? player.activeQuests
    : [];

  const list = [];

  activeIds.forEach((id) => {
    const found = getStepById(id);
    if (!found) return;

    const { path, stage } = found;
    const stepState = player.stepStates?.[stage.id] || STEP_STATE.LOCKED;

    if (stepState !== STEP_STATE.COMPLETED) {
      list.push({ path, stage, state: stepState });
    }
  });

  return list;
}

/* ---------------------------------------------------------
   COMPLETION D’ÉTAPE
--------------------------------------------------------- */

function completeStep(path, stage) {
  const player = getPlayerState();
  const currentState = player.stepStates?.[stage.id];

  if (currentState === STEP_STATE.COMPLETED) {
    return; // déjà fait
  }

  // 1) Marquer comme complétée
  setStepState(stage.id, STEP_STATE.COMPLETED);

  // 2) XP + stats
  addXP(stage.xp || 0);
  addStats(stage.stats || {});

  // 3) Débloquer l'étape suivante
  unlockNextStep(path, stage.id);

  // 4) Retirer des quêtes actives
  setQuestInactive(stage.id);

  // 5) Rafraîchir UI (barre joueur + liste quêtes)
  renderPlayerBar();
  renderQuests();

  alert(`Étape validée : ${stage.label} (+${stage.xp} XP).`);
}

/* ---------------------------------------------------------
   RENDER PRINCIPAL
--------------------------------------------------------- */

export function renderQuests() {
  const section = document.getElementById("section-quests");
  if (!section) return;

  const active = getActiveQuestEntries();

  if (!active.length) {
    section.innerHTML = `
      <h2>📜 Quêtes en cours</h2>
      <p class="section-subtitle">
        Les étapes que tu as marquées comme actives.
      </p>
      <div class="quest-empty">
        <span class="quest-empty-icon">🌱</span>
        <span>Aucune quête active pour l’instant. Va sur la carte et lance un chemin.</span>
      </div>
    `;
    return;
  }

  const cardsHtml = active
    .map(({ path, stage }) => {
      const domain = path.domain || "Divers";
      const domainIcon = path.domainIcon || "📁";

      const xp = stage.xp || 0;
      const stats = stage.stats || { mind: 0, body: 0, social: 0 };

      return `
        <article class="quest-card" data-step-id="${stage.id}">
          <div class="quest-icon">
            ${path.baseIcon || "🎯"}
          </div>
          <div class="quest-body">
            <div class="quest-title-row">
              <div>
                <strong class="quest-title">${stage.label}</strong>
              </div>
              <div class="quest-domain">
                ${domainIcon} ${domain}
              </div>
            </div>
            <div class="quest-tags">
              <span class="quest-tag quest-tag-primary">${path.name}</span>
              <span class="quest-tag">Étape active</span>
            </div>
            <p class="quest-description">
              ${stage.description || ""}
            </p>
            <div class="quest-bottom-row">
              <div class="quest-reward">
                <span>🎁</span>
                <span>+${xp} XP</span>
                <span class="quest-dot">•</span>
                <span>Mind +${stats.mind || 0}, Body +${stats.body || 0}, Social +${stats.social || 0}</span>
              </div>
              <button class="quest-validate-btn" type="button">
                ✅ Valider
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  section.innerHTML = `
    <h2>📜 Quêtes en cours</h2>
    <p class="section-subtitle">
      Les étapes que tu as marquées comme actives.
    </p>
    <div class="quest-list">
      ${cardsHtml}
    </div>
  `;

  // Bind des boutons "Valider"
  const cards = section.querySelectorAll(".quest-card");
  cards.forEach((card) => {
    const stepId = card.getAttribute("data-step-id");
    const btn = card.querySelector(".quest-validate-btn");
    if (!btn || !stepId) return;

    const found = getStepById(stepId);
    if (!found) return;

    const { path, stage } = found;

    btn.addEventListener("click", () => {
      completeStep(path, stage);
    });
  });
}
