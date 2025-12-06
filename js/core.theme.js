const STORAGE_THEME = "lifepath-theme-v1";

export function loadTheme() {
  const raw = localStorage.getItem(STORAGE_THEME);
  return raw ? JSON.parse(raw) : null;
}

export function applyTheme(theme) {
  const root = document.documentElement;
  Object.entries(theme).forEach(([k, v]) => {
    root.style.setProperty(k, v);
  });
}

export function saveTheme(theme) {
  localStorage.setItem(STORAGE_THEME, JSON.stringify(theme));
}
