import { getPlayerState } from "./core.state.js";

export function renderPlayerBar() {
  const root = document.getElementById("player-bar");
  const p = getPlayerState();

  root.innerHTML = `
    <div class="player-info">
      <strong>Niveau ${p.level}</strong>
      <p>${p.xp} XP — ${p.currency} coins</p>
    </div>
  `;
}
