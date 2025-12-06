/**
 * js/ui.avatar.js
 * ---------------------------------------------------------
 * Gestion de la section "Avatar" :
 *  - rendu du panneau avatar
 *  - sélection base / peau / cheveux
 *  - aperçu emoji
 *  - affichage des items possédés
 *  - toggle des accessoires équipés
 *  - export JSON de la config
 * ---------------------------------------------------------
 */

import {
  getPlayerState,
  updateAvatar,
  getInventory,
} from "./core.state.js";

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

/**
 * Renvoie un libellé lisible pour un item à partir de son id.
 * Pour l’instant, on affiche l’id brut ; plus tard on pourra
 * faire un lookup via StoreAPI pour récupérer le nom réel.
 */
function formatItemLabel(itemId, isEquipped) {
  return (isEquipped ? "✅ " : "") + itemId;
}

/* ---------------------------------------------------------
   RENDER PRINCIPAL
--------------------------------------------------------- */

export function renderAvatar() {
  const section = document.getElementById("section-avatar");
  if (!section) return;

  const player = getPlayerState();
  const avatar = player.avatar || {};
  const inventory = getInventory();
  const ownedItems = Array.isArray(inventory.items) ? inventory.items : [];
  const equippedAccessories = new Set(avatar.accessories || []);

  section.innerHTML = `
    <h2>🧍 Mon avatar</h2>
    <p class="section-subtitle">
      Choisis ton look, équipe tes vêtements & accessoires, partage ta config.
    </p>

    <!-- Aperçu -->
    <div id="avatar-preview" class="avatar-preview">
      ${avatarBaseToEmoji(avatar.base || "humanoid-1")}
    </div>

    <!-- Sélecteurs de base / peau / cheveux -->
    <div class="avatar-options">
      <div class="avatar-row">
        <label for="avatar-base" class="avatar-label">Base</label>
        <select id="avatar-base" class="avatar-input">
          <option value="humanoid-1">Humanoïde 1</option>
          <option value="humanoid-2">Humanoïde 2</option>
          <option value="animal-fox">Renard</option>
        </select>
      </div>

      <div class="avatar-row">
        <label for="avatar-skin" class="avatar-label">Teint</label>
        <select id="avatar-skin" class="avatar-input">
          <option value="light">Peau claire</option>
          <option value="medium">Peau moyenne</option>
          <option value="dark">Peau foncée</option>
        </select>
      </div>

      <div class="avatar-row">
        <label for="avatar-hair" class="avatar-label">Cheveux</label>
        <select id="avatar-hair" class="avatar-input">
          <option value="short-brown">Cheveux courts bruns</option>
          <option value="long-black">Cheveux longs noirs</option>
          <option value="bald">Chauve</option>
        </select>
      </div>
    </div>

    <!-- Inventaire & équipement -->
    <div class="avatar-inventory-block">
      <p class="avatar-inventory-title">
        Vêtements & accessoires possédés
        <span class="avatar-inventory-hint">(clique pour équiper / retirer)</span>
      </p>
      <div id="avatar-inventory-list" class="avatar-inventory-list"></div>
    </div>

    <!-- Export JSON -->
    <div class="avatar-export-row">
      <button id="avatar-share-json" class="avatar-share-btn">
        📤 Copier la config (JSON)
      </button>
    </div>
  `;

  /* ----- Initialisation des selects ----- */
  const baseSelect = document.getElementById("avatar-base");
  const skinSelect = document.getElementById("avatar-skin");
  const hairSelect = document.getElementById("avatar-hair");
  const preview = document.getElementById("avatar-preview");
  const invList = document.getElementById("avatar-inventory-list");
  const shareBtn = document.getElementById("avatar-share-json");

  if (baseSelect) baseSelect.value = avatar.base || "humanoid-1";
  if (skinSelect) skinSelect.value = avatar.skin || "medium";
  if (hairSelect) hairSelect.value = avatar.hair || "short-brown";

  /* ----- Inventaire (items) ----- */
  if (!ownedItems.length) {
    invList.innerHTML = `
      <div class="avatar-tag avatar-tag-empty">
        Aucun vêtement ni accessoire pour l’instant.
      </div>
    `;
  } else {
    invList.innerHTML = ownedItems
      .map((id) => {
        const isEquipped = equippedAccessories.has(id);
        const classes =
          "avatar-tag" + (isEquipped ? " avatar-tag-equipped" : "");
        return `
          <button class="${classes}" type="button" data-item-id="${id}">
            ${formatItemLabel(id, isEquipped)}
          </button>
        `;
      })
      .join("");
  }

  /* ----- Gestion des changements de base / peau / cheveux ----- */
  if (baseSelect) {
    baseSelect.addEventListener("change", (e) => {
      const newBase = e.target.value;
      const updated = updateAvatar({ base: newBase });
      if (preview) {
        preview.textContent = avatarBaseToEmoji(updated.base);
      }
    });
  }

  if (skinSelect) {
    skinSelect.addEventListener("change", (e) => {
      updateAvatar({ skin: e.target.value });
      // tu peux ajouter ici des effets visuels selon le teint plus tard
    });
  }

  if (hairSelect) {
    hairSelect.addEventListener("change", (e) => {
      updateAvatar({ hair: e.target.value });
      // pareil, visuel cheveux plus tard si besoin
    });
  }

  /* ----- Toggle accessoires équipés ----- */
  if (ownedItems.length) {
    invList.querySelectorAll(".avatar-tag").forEach((btn) => {
      const itemId = btn.getAttribute("data-item-id");
      if (!itemId) return;

      btn.addEventListener("click", () => {
        const current = getPlayerState().avatar || {};
        const arr = Array.isArray(current.accessories)
          ? [...current.accessories]
          : [];

        const index = arr.indexOf(itemId);
        if (index >= 0) {
          arr.splice(index, 1); // retirer
        } else {
          arr.push(itemId); // équiper
        }

        const updated = updateAvatar({ accessories: arr });

        // Refresh visuel de ce tag seulement
        const isEquipped = updated.accessories.includes(itemId);
        btn.classList.toggle("avatar-tag-equipped", isEquipped);
        btn.textContent = formatItemLabel(itemId, isEquipped);
      });
    });
  }

  /* ----- Bouton "copier config JSON" ----- */
  if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
      const cfg = {
        avatar: getPlayerState().avatar,
        inventory: getInventory(),
      };
      const json = JSON.stringify(cfg, null, 2);

      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(json);
          alert("Config avatar copiée dans le presse-papiers (JSON).");
        } catch {
          alert("Impossible de copier automatiquement.\n\n" + json);
        }
      } else {
        alert("Voici la config JSON :\n\n" + json);
      }
    });
  }
}
