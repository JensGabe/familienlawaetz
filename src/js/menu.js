// Mobile menu toggle. On wide screens the Twenty Ten hover dropdowns are used.
(() => {
  const btn = document.querySelector(".menu-toggle");
  const access = document.getElementById("access");
  if (!btn || !access) return;
  btn.addEventListener("click", () => {
    const open = access.classList.toggle("is-open");
    btn.setAttribute("aria-expanded", String(open));
  });
})();
