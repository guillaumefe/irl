import { getPlayerState, savePlayerState } from "./core.state.js";

export async function syncWithServer() {
  try {
    const state = getPlayerState();

    // 🚧 plus tard : encryption AES-GCM côté client
    const payload = JSON.stringify(state);

    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload
    });

    if (!res.ok) return console.warn("Sync error", res.status);

    const merged = await res.json();
    localStorage.setItem("lifepath-player-v1", JSON.stringify(merged));
    return merged;

  } catch (e) {
    console.warn("Sync failed:", e);
    return null;
  }
}
