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
      .main-navigation-mobile-title { display: none; }
      @media (max-width: 760px) {
        .main-navigation-mobile-title {
          display: block; margin: 0 0 12px; text-align: center;
          font: 500 clamp(2rem, 11vw, 2.45rem)/.95 Georgia, "Times New Roman", serif;
        }
        .main-navigation-mobile-title a { color: var(--ink, #2b251f); text-decoration: none; }
        .main-navigation {
          justify-content: flex-start; gap: 6px; margin: 0 auto 18px; padding: 1px 0 3px;
          scroll-snap-type: x proximity;
        }
        .main-navigation a,
        .main-navigation a[href="verktyg.html"] {
          min-height: 0; padding: 9px 14px; border: 1px solid var(--line, #ded2c2);
          border-radius: 999px; background: var(--paper, #fffdf8); color: var(--accent, #7d4f3b);
          font-size: .84rem; font-weight: 800; scroll-snap-align: start; box-shadow: none;
        }
        .main-navigation a[href="index.html"] { display: none !important; }
        .main-navigation a[data-nav-section="hibiskus"] { order: 1; }
        .main-navigation a[data-nav-section="pelargon"] { order: 2; }
        .main-navigation a[data-nav-section="citrus"] { order: 3; }
        .main-navigation a[data-nav-section="udda"] { order: 4; }
        .main-navigation a[data-nav-section="stapelia"] { order: 5; }
        .main-navigation a[data-nav-section="labbet"] { order: 6; }
        .main-navigation a[data-nav-section="vaxtliv"] { order: 7; }
        .main-navigation a[data-nav-section="verktyg"] { order: 8; }
        .main-navigation a.current,
        .main-navigation a[aria-current="page"] {
          border-color: var(--accent, #7d4f3b); background: var(--accent, #7d4f3b); color: white;
          box-shadow: none;
        }
      }
    `;
    document.head.appendChild(style);
  }

  document.querySelectorAll("nav[data-main-navigation]").forEach(nav => {
    if (!nav.previousElementSibling?.classList.contains("main-navigation-mobile-title")) {
      const title = document.createElement("div");
      title.className = "main-navigation-mobile-title";
      title.innerHTML = '<a href="iphone.html" aria-label="Öppna Mina Växter">Mina Växter</a>';
      nav.before(title);
    }
    nav.classList.add("main-navigation");
    nav.setAttribute("aria-label", "Huvudnavigation");
    nav.innerHTML = items.map(([href, label, section]) => {
      const active = section === activeSection;
      return `<a data-nav-section="${section}"${active ? ' class="current" aria-current="page"' : ""} href="${href}">${escapeHtml(label)}</a>`;
    }).join("");
    const current = nav.querySelector('[aria-current="page"]');
    if (current && typeof current.scrollIntoView === "function" && window.innerWidth <= 760) {
      requestAnimationFrame(() => current.scrollIntoView({block: "nearest", inline: "center"}));
    }
  });
})();
