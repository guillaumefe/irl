/**
 * js/ui.player.js
 * ---------------------------------------------------------
 * Rendu de la barre joueur (niveau, XP, stats, monnaie…)
 * - se base sur l'état central (core.state.js)
 * - compte les chemins via ui.paths.js
 * ---------------------------------------------------------
 */

import { getPlayerState } from "./core.state.js";
import { getLifePaths } from "./ui.paths.js";

const XP_PER_LEVEL = 100;

/* ---------------------------------------------------------
   HELPERS
--------------------------------------------------------- */

function avatarBaseToEmoji(base) {
  switch (base) {
    case "animal-fox":
      return "🦊";
    case "humanoid-2":
      return "🧙‍♂️";
    case "humanoid-1":
    default:
      return "🙂";
  }
}

function computeXpProgress(player) {
  const xp = player.xp || 0;
  const lvl = player.level || 1;

  const xpCurrentLevelStart = (lvl - 1) * XP_PER_LEVEL;
  const xpIntoLevel = Math.max(0, xp - xpCurrentLevelStart);
  const xpRange = XP_PER_LEVEL;
  const pct = Math.max(
    0,
    Math.min(100, Math.round((xpIntoLevel / xpRange) * 100))
  );

  return {
    level: lvl,
    xp: xp,
    xpIntoLevel,
    xpRange,
    pct,
  };
}

/* ---------------------------------------------------------
   RENDER
--------------------------------------------------------- */

export function renderPlayerBar() {
  const container = document.getElementById("player-bar");
  if (!container) return;

  const p = getPlayerState();
  const avatar = p.avatar || {};
  const lifePaths = getLifePaths();

  const xpInfo = computeXpProgress(p);
  const activeQuestsCount = Array.isArray(p.activeQuests)
    ? p.activeQuests.length
    : 0;
  const pathsCount = Array.isArray(lifePaths) ? lifePaths.length : 0;
  const currency = p.currency || 0;

  const mind = p.stats?.mind ?? 1;
  const body = p.stats?.body ?? 1;
  const social = p.stats?.social ?? 1;

  const avatarEmoji = avatarBaseToEmoji(avatar.base || "humanoid-1");

  container.innerHTML = `
    <div class="player-bar-inner">
      <div class="player-left">
        <div class="player-avatar">
          <div class="player-avatar-emoji">${avatarEmoji}</div>
          <div class="player-avatar-class">Life Mage</div>
        </div>
        <div class="player-meta">
          <div class="player-name-row">
            <strong class="player-name">Héros IRL</strong>
            <span class="player-badge-lvl">
              LVL <span class="player-lvl-value">${xpInfo.level}</span>
            </span>
          </div>
          <div class="player-xp-bar">
            <div class="player-xp-bar-fill" style="width:${xpInfo.pct}%;"></div>
          </div>
          <div class="player-xp-label">
            ${xpInfo.xpIntoLevel} / ${xpInfo.xpRange} XP vers le prochain niveau
          </div>
        </div>
      </div>

      <div class="player-right">
        <div class="player-stats-row">
          <div class="player-stat-pill">
            <span class="label">🧠 Mind</span>
            <span class="value">${mind}</span>
          </div>
          <div class="player-stat-pill">
            <span class="label">💪 Body</span>
            <span class="value">${body}</span>
          </div>
          <div class="player-stat-pill">
            <span class="label">🤝 Social</span>
            <span class="value">${social}</span>
          </div>
        </div>

        <div class="player-meta-row">
          <span>Quêtes actives : <strong>${activeQuestsCount}</strong></span>
          <span>Chemins : <strong>${pathsCount}</strong></span>
        </div>

        <div class="player-meta-row">
          <span>💰 Solde : <strong>${currency}</strong></span>
        </div>
      </div>
    </div>
  `;
}
