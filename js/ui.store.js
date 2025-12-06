/**
 * js/ui.store.js
 * ---------------------------------------------------------
 * Gestion du marketplace et du store personnel.
 * - création / mise à jour du store
 * - ajout d’items à son store
 * - affichage des items du joueur
 * - marketplace global + recherche
 * - achat d’items (avec mise à jour du playerState)
 * ---------------------------------------------------------
 */

import { StoreAPI } from "./core.api.js";
import { getPlayerState, savePlayerState } from "./core.state.js";

let myStoreCache = null;

/* ---------------------------------------------------------
   UTILITAIRES
--------------------------------------------------------- */

function ensurePlayerId() {
  const player = getPlayerState();
  if (!player.id) {
    player.id = crypto.randomUUID();
    savePlayerState();
  }
  return player.id;
}

function getCurrency() {
  return getPlayerState().currency || 0;
}

function setCurrency(newValue) {
  const p = getPlayerState();
  p.currency = newValue;
  savePlayerState();
}

function addItemToInventory(itemId) {
  const p = getPlayerState();
  if (!p.inventory) p.inventory = { items: [] };
  if (!Array.isArray(p.inventory.items)) p.inventory.items = [];
  if (!p.inventory.items.includes(itemId)) {
    p.inventory.items.push(itemId);
    savePlayerState();
  }
}

/* ---------------------------------------------------------
   STORE PERSONNEL
--------------------------------------------------------- */

async function ensureMyStore() {
  const ownerId = ensurePlayerId();

  const nameInput = document.getElementById("store-name");
  const descInput = document.getElementById("store-description");

  const name =
    (nameInput && nameInput.value.trim()) ||
    "Store de " + ownerId.slice(0, 6);

  const description =
    (descInput && descInput.value.trim()) ||
    "Vêtements, accessoires et fichiers spéciaux.";

  const payload = { ownerId, name, description };

  const store = await StoreAPI.createOrUpdateStore(payload);
  myStoreCache = store;

  if (nameInput) nameInput.value = store.name;
  if (descInput) descInput.value = store.description;

  return store;
}

async function loadMyStoreAndItems() {
  const container = document.getElementById("my-store-items");
  if (!container) return;

  try {
    const store = await ensureMyStore();
    const items = await StoreAPI.getItems(store.id);
    renderMyStoreItems(items);
  } catch (err) {
    console.error(err);
    container.innerHTML = `
      <div class="store-empty">
        <strong>⚠️ Erreur</strong>
        <p>Impossible de charger ton store. Vérifie que le serveur tourne.</p>
      </div>
    `;
  }
}

function renderMyStoreItems(items) {
  const container = document.getElementById("my-store-items");
  if (!container) return;

  if (!items || !items.length) {
    container.innerHTML = `
      <div class="store-empty">
        <p>Tu n’as pas encore d’items en vente.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const typeLabel =
        item.type === "outfit"
          ? "Vêtement"
          : item.type === "accessory"
          ? "Accessoire"
          : "Fichier chiffré";

      return `
        <article class="store-item-card">
          <header class="store-item-header">
            <div class="store-item-main">
              <div class="store-item-name-row">
                <span class="store-item-emoji">${item.emoji || "🎁"}</span>
                <span class="store-item-name">${item.name}</span>
              </div>
              <div class="store-item-meta">
                <span>${typeLabel}</span>
                <span class="store-dot">•</span>
                <span>💰 ${item.price}</span>
              </div>
            </div>
          </header>
          ${
            item.type === "encrypted-file"
              ? `<p class="store-item-note">Fichier chiffré : l’acheteur devra le déchiffrer localement avec un mot de passe que tu fournis.</p>`
              : ""
          }
        </article>
      `;
    })
    .join("");
}

/* ---------------------------------------------------------
   CRÉATION D’ITEM
--------------------------------------------------------- */

async function handleCreateItem() {
  const nameInput = document.getElementById("item-name");
  const typeSelect = document.getElementById("item-type");
  const priceInput = document.getElementById("item-price");
  const emojiInput = document.getElementById("item-emoji");
  const notifyInput = document.getElementById("item-notify-email");

  const name = nameInput.value.trim();
  const type = typeSelect.value;
  const price = parseInt(priceInput.value, 10) || 0;
  const emoji = emojiInput.value.trim() || "🎁";
  const notifyEmail = notifyInput ? notifyInput.value.trim() : "";

  if (!name) {
    alert("Le nom de l’item est obligatoire.");
    return;
  }

  try {
    const store = await ensureMyStore();
    const ownerId = ensurePlayerId();

    const payload = {
      name,
      type,
      price,
      emoji,
      ownerId,
      storeId: store.id,
    };

    // Pour les fichiers chiffrés, on enverra plus tard des métadonnées
    // supplémentaires (fileId, notifyEmail, etc.). On garde déjà le champ :
    if (type === "encrypted-file" && notifyEmail) {
      payload.notifyEmail = notifyEmail;
    }

    await StoreAPI.createItem(payload);
    alert("Item ajouté à ton store !");
    // Cleanup minimal
    nameInput.value = "";
    emojiInput.value = "";
    priceInput.value = "50";

    await loadMyStoreAndItems();
  } catch (err) {
    console.error(err);
    alert("Erreur lors de la création de l’item.");
  }
}

/* ---------------------------------------------------------
   MARKETPLACE
--------------------------------------------------------- */

async function doMarketSearch() {
  const qInput = document.getElementById("market-search-input");
  const container = document.getElementById("market-results");
  if (!container) return;

  const q = qInput.value.trim().toLowerCase();

  container.innerHTML = `
    <div class="store-empty">
      <p>Chargement des items…</p>
    </div>
  `;

  try {
    let items = await StoreAPI.listAllItems();

    if (q) {
      items = items.filter((i) => {
        const name = (i.name || "").toLowerCase();
        const type = (i.type || "").toLowerCase();
        return name.includes(q) || type.includes(q);
      });
    }

    if (!items.length) {
      container.innerHTML = `
        <div class="store-empty">
          <p>Aucun item trouvé pour cette recherche.</p>
        </div>
      `;
      return;
    }

    const currentCurrency = getCurrency();

    container.innerHTML = items
      .map((item) => {
        const typeLabel =
          item.type === "outfit"
            ? "Vêtement"
            : item.type === "accessory"
            ? "Accessoire"
            : "Fichier chiffré";

        const canAfford = currentCurrency >= item.price;

        return `
          <article class="store-item-card" data-item-id="${item.id}">
            <header class="store-item-header">
              <div class="store-item-main">
                <div class="store-item-name-row">
                  <span class="store-item-emoji">${item.emoji || "🎁"}</span>
                  <span class="store-item-name">${item.name}</span>
                </div>
                <div class="store-item-meta">
                  <span>${typeLabel}</span>
                  <span class="store-dot">•</span>
                  <span>💰 ${item.price}</span>
                </div>
              </div>
              <button
                class="store-buy-btn"
                type="button"
                ${canAfford ? "" : "disabled"}
              >
                ${canAfford ? "Acheter" : "Trop cher"}
              </button>
            </header>
          </article>
        `;
      })
      .join("");

    // Bind des boutons "Acheter"
    container.querySelectorAll(".store-item-card").forEach((card) => {
      const btn = card.querySelector(".store-buy-btn");
      const itemId = card.getAttribute("data-item-id");
      const item = items.find((i) => String(i.id) === String(itemId));
      if (!item || btn.disabled) return;
      btn.addEventListener("click", () => purchaseItem(item));
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = `
      <div class="store-empty">
        <strong>⚠️ Erreur</strong>
        <p>Impossible de charger le marketplace.</p>
      </div>
    `;
  }
}

async function purchaseItem(item) {
  const currentCurrency = getCurrency();
  if (currentCurrency < item.price) {
    alert("Tu n’as pas assez de coins pour cet achat.");
    return;
  }

  const playerId = ensurePlayerId();

  try {
    await StoreAPI.purchase({
      itemId: item.id,
      playerId,
      price: item.price,
    });

    // Mise à jour local state
    setCurrency(currentCurrency - item.price);
    addItemToInventory(item.id);

    alert(`Achat réussi : ${item.name}`);

    // Rafraîchir l’affichage marché + mon store
    await doMarketSearch();
    await loadMyStoreAndItems();
  } catch (err) {
    console.error(err);
    alert("Erreur lors de l’achat. Vérifie le serveur.");
  }
}

/* ---------------------------------------------------------
   RENDER PRINCIPAL
--------------------------------------------------------- */

export function renderStore() {
  const section = document.getElementById("section-store");
  if (!section) return;

  section.innerHTML = `
    <h2>🛍️ Stores & marketplace</h2>
    <p class="section-subtitle">
      Découvre les items des autres joueurs et construis ton propre store.
    </p>

    <!-- Marketplace -->
    <div class="store-block">
      <h3>🌍 Marketplace</h3>
      <div class="store-form-row">
        <input
          id="market-search-input"
          class="store-input"
          placeholder="Nom d’item / type..."
        />
        <button id="market-search-btn" class="store-btn-primary">
          🔎 Rechercher
        </button>
      </div>
      <div id="market-results" class="store-list"></div>
    </div>

    <!-- Mon store -->
    <div class="store-block">
      <h3>🏪 Mon store</h3>
      <p class="store-hint">
        Configure ton store et ajoute des items (vêtements, accessoires, fichiers chiffrés).
      </p>

      <div class="store-form-row">
        <input
          id="store-name"
          class="store-input"
          placeholder="Nom de ton store"
        />
      </div>
      <div class="store-form-row">
        <input
          id="store-description"
          class="store-input"
          placeholder="Description"
        />
      </div>
      <div class="store-form-row">
        <button id="store-save-btn" class="store-btn-primary">
          💾 Enregistrer / mettre à jour
        </button>
      </div>

      <hr class="store-separator" />

      <h4>➕ Ajouter un item</h4>
      <div class="store-form-row">
        <input
          id="item-name"
          class="store-input"
          placeholder="Nom de l'item"
        />
      </div>
      <div class="store-form-row">
        <select id="item-type" class="store-input">
          <option value="outfit">Vêtement</option>
          <option value="accessory">Accessoire</option>
          <option value="encrypted-file">Fichier chiffré</option>
        </select>
      </div>
      <div class="store-form-row">
        <input
          id="item-price"
          class="store-input"
          type="number"
          min="0"
          value="50"
          placeholder="Prix en coins"
        />
      </div>
      <div class="store-form-row">
        <input
          id="item-emoji"
          class="store-input"
          placeholder="Emoji (ex: 👕)"
        />
      </div>
      <div class="store-form-row">
        <input
          id="item-notify-email"
          class="store-input"
          placeholder="Email pour recevoir les notifications d’achat (fichiers chiffrés)"
        />
      </div>
      <div class="store-form-row">
        <button id="item-create-btn" class="store-btn-primary">
          ➕ Ajouter à mon store
        </button>
      </div>

      <div id="my-store-items" class="store-list"></div>
    </div>
  `;

  // Bind des boutons
  const marketBtn = document.getElementById("market-search-btn");
  const saveStoreBtn = document.getElementById("store-save-btn");
  const createItemBtn = document.getElementById("item-create-btn");

  if (marketBtn) {
    marketBtn.addEventListener("click", () => {
      doMarketSearch();
    });
  }

  if (saveStoreBtn) {
    saveStoreBtn.addEventListener("click", async () => {
      try {
        await ensureMyStore();
        alert("Store enregistré / mis à jour.");
        await loadMyStoreAndItems();
      } catch (err) {
        console.error(err);
        alert("Erreur lors de l’enregistrement du store.");
      }
    });
  }

  if (createItemBtn) {
    createItemBtn.addEventListener("click", () => {
      handleCreateItem();
    });
  }

  // Chargements initiaux
  doMarketSearch();
  loadMyStoreAndItems();
}
