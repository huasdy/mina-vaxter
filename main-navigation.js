(() => {
  const items = [
    ["index.html", "Mina Växter", "home"],
    ["labbet.html", "Labbet", "labbet"],
    ["hibiskusar.html", "Hibiskus", "hibiskus"],
    ["pelargoner.html", "Pelargon", "pelargon"],
    ["citrus.html", "Citrus", "citrus"],
    ["udda.html", "Udda", "udda"],
    ["stapeliader.html", "Stapelia", "stapelia"],
    ["vaxtliv.html", "Växtliv", "vaxtliv"],
    ["verktyg.html", "Verktyg", "verktyg"],
  ];
  const sectionByPage = {
    "": "home",
    "index.html": "home",
    "favoriter.html": "home",
    "labbet.html": "labbet",
    "hibiskusar.html": "hibiskus",
    "pelargoner.html": "pelargon",
    "citrus.html": "citrus",
    "udda.html": "udda",
    "stapeliader.html": "stapelia",
    "vaxtliv.html": "vaxtliv",
    "korsningar.html": "vaxtliv",
    "sticklingar.html": "vaxtliv",
    "tidigare.html": "vaxtliv",
    "verktyg.html": "verktyg",
  };
  const page = (window.location.pathname.split("/").pop() || "").toLocaleLowerCase("sv");
  const query = new URLSearchParams(window.location.search);
  const activeSection = query.has("tool") ? "verktyg" : (sectionByPage[page] || "");
  const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);

  if (!document.querySelector("style[data-main-navigation-style]")) {
    const style = document.createElement("style");
    style.dataset.mainNavigationStyle = "true";
    style.textContent = `
      .main-navigation {
        width: 100%; margin: 0 auto 18px; padding: 4px 18px 10px;
        display: flex; flex-wrap: nowrap; align-items: center; justify-content: safe center; gap: clamp(9px, 1.45vw, 17px);
        overflow-x: auto; overscroll-behavior-inline: contain; scrollbar-width: none;
        white-space: nowrap; -webkit-overflow-scrolling: touch;
      }
      .main-navigation::-webkit-scrollbar { display: none; }
      .main-navigation a,
      .main-navigation a[href="verktyg.html"] {
        position: relative; flex: 0 0 auto; display: inline-flex !important; align-items: center;
        min-height: 34px; padding: 4px 1px 7px; color: var(--accent, #7d4f3b);
        text-decoration: none; font-size: clamp(.82rem, 1.2vw, .94rem); font-weight: 720;
      }
      .main-navigation a:hover { color: var(--ink, #2b251f); }
      .main-navigation a.current,
      .main-navigation a[aria-current="page"] {
        color: var(--ink, #2b251f); font-weight: 880;
        box-shadow: inset 0 -2px 0 color-mix(in srgb, var(--accent, #7d4f3b) 72%, transparent);
      }
      @media (max-width: 760px) {
        .main-navigation { justify-content: flex-start; gap: 14px; padding-inline: 16px; }
      }
    `;
    document.head.appendChild(style);
  }

  document.querySelectorAll("nav[data-main-navigation]").forEach(nav => {
    nav.classList.add("main-navigation");
    nav.setAttribute("aria-label", "Huvudnavigation");
    nav.innerHTML = items.map(([href, label, section]) => {
      const active = section === activeSection;
      return `<a${active ? ' class="current" aria-current="page"' : ""} href="${href}">${escapeHtml(label)}</a>`;
    }).join("");
    const current = nav.querySelector('[aria-current="page"]');
    if (current && typeof current.scrollIntoView === "function" && window.innerWidth <= 760) {
      requestAnimationFrame(() => current.scrollIntoView({block: "nearest", inline: "center"}));
    }
  });
})();
