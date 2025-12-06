export function initTabs() {
  const tabs = document.querySelectorAll(".tab");
  const sections = document.querySelectorAll(".section");

  tabs.forEach(tab =>
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      const target = tab.dataset.tab;
      sections.forEach(sec =>
        sec.id === "section-" + target
          ? sec.classList.remove("hidden")
          : sec.classList.add("hidden")
      );
    })
  );
}
