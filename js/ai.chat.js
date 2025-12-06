export function initAIChat() {
  const fab = document.getElementById("ai-fab");
  const backdrop = document.getElementById("ai-panel-backdrop");

  fab.addEventListener("click", () =>
    backdrop.classList.add("visible")
  );

  backdrop.addEventListener("click", e => {
    if (e.target === backdrop) backdrop.classList.remove("visible");
  });
}
