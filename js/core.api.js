export const API = {
  async searchLifePaths(query) {
    const res = await fetch(`/api/lifepaths/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error("Erreur API");
    return res.json();
  },

  async publishLifePath(data) {
    const res = await fetch("/api/lifepaths", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error("Erreur publication");
    return res.json();
  },

  async items(storeId = null) {
    const url = storeId ? `/api/items?storeId=${storeId}` : "/api/items";
    const res = await fetch(url);
    if (!res.ok) throw new Error("Erreur items");
    return res.json();
  },

  async createItem(data) {
    return fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }).then(r => r.json());
  }
};
