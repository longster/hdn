// Houston Deaf Network. Vanilla JS, no framework.
// Renders all page content from SITE_DATA (data.js), which is generated
// from the Notion CMS. Never hardcode listings here.

// ---------- helpers ----------
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function eventDateLabel(iso) {
  const d = new Date(iso + "T12:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ---------- theme toggle: auto -> light -> dark -> auto ----------
// Matches the lduongh portfolio pattern. Explicit choice is stored in
// localStorage ('hdn-theme') and wins over the OS preference; 'auto'
// removes the override so the system setting applies again.
(function () {
  var btn = document.getElementById("themeToggle");
  if (!btn) return;
  var order = ["auto", "light", "dark"];
  function get() {
    try {
      return localStorage.getItem("hdn-theme") || "auto";
    } catch (e) {
      return "auto";
    }
  }
  function apply(t) {
    var root = document.documentElement;
    if (t === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", t);
    try {
      localStorage.setItem("hdn-theme", t);
    } catch (e) {}
    btn.setAttribute("data-state", t);
    btn.setAttribute("aria-label", "Theme: " + t + ". Activate to change.");
  }
  apply(get());
  btn.addEventListener("click", function () {
    var next = order[(order.indexOf(get()) + 1) % order.length];
    apply(next);
  });
})();

// ---------- mobile nav ----------
(function () {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".site-nav");
  if (!toggle || !nav) return;
  function close(returnFocus) {
    nav.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    if (returnFocus) toggle.focus();
  }
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("open")) close(true);
  });
  nav.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => close(false))
  );
})();

// ---------- header + footer brands always scroll to true top ----------
// The global scroll-padding-top offset keeps anchors clear of the sticky
// header, but it also stops the logo link from landing at the real top.
// Intercept the click and scroll to 0 explicitly.
(function () {
  const brands = document.querySelectorAll(".brand, .footer-brand-link");
  if (!brands.length) return;
  brands.forEach(function (brand) {
    brand.addEventListener("click", function (e) {
      e.preventDefault();
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    });
  });
})();

// ---------- footer year ----------
(function () {
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();

// ---------- directory ----------
var CATEGORY_ORDER = [
  "Interpreting Agencies",
  "Organizations & Services",
  "Churches & Ministries",
  "Education & Career",
  "Health & Wellness",
  "Deaf-Owned Business",
  "Deaf-Friendly Business",
  "Deaf-Friendly Employers",
  "Social & Meetup",
];

var activeCategory = "All";
var searchTerm = "";

// External-link indicator (arrow-out-of-box), decorative, 9px superscript
// style. Every external link opens in a new tab and names its destination
// + "opens in new tab".
function extIcon(extraClass) {
  return '<svg class="ext-icon' + (extraClass ? " " + extraClass : "") + '" viewBox="0 0 24 24" width="9" height="9" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h5v5"/><path d="M20 4 10.5 13.5"/><path d="M19 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5.5"/></svg>';
}

var EXT_ICON = extIcon();

function extLink(href, label, text) {
  return '<a class="card-link" href="' + esc(href) + '" target="_blank" rel="noopener" aria-label="' + esc(label) + ', opens in new tab">' + esc(text) + " " + EXT_ICON + "</a>";
}

// Brand icons for icon-only card buttons. Visible icon, text carried in the
// title tooltip and aria-label so screen readers and keyboard users get it.
var BRAND_ICONS = {
  website: '<svg class="brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  facebook: '<svg class="brand-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
  instagram: '<svg class="brand-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z"/></svg>',
  linkedin: '<svg class="brand-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z"/></svg>'
};

function iconLink(href, label, iconKey, title) {
  return '<a class="card-link card-link-icon" href="' + esc(href) + '" target="_blank" rel="noopener" title="' + esc(title) + '" aria-label="' + esc(label) + ', opens in new tab">' + BRAND_ICONS[iconKey] + "</a>";
}

function directoryRows() {
  if (typeof SITE_DATA === "undefined") return [];
  return SITE_DATA.directory.filter(function (r) {
    return r.category !== "Social & Meetup";
  });
}

function socialRows() {
  if (typeof SITE_DATA === "undefined") return [];
  return SITE_DATA.directory.filter(function (r) {
    return r.category === "Social & Meetup";
  });
}

function linkButtons(r) {
  var links = [];
  if (r.website) links.push(iconLink(r.website, "Website for " + r.name, "website", "Website"));
  if (r.facebook) links.push(iconLink(r.facebook, "Facebook for " + r.name, "facebook", "Facebook"));
  if (r.instagram) links.push(iconLink(r.instagram, "Instagram for " + r.name, "instagram", "Instagram"));
  if (r.linkedin) links.push(iconLink(r.linkedin, "LinkedIn for " + r.name, "linkedin", "LinkedIn"));
  if (!links.length) return "";
  return '<div class="card-links">' + links.join("") + "</div>";
}

// Fallback logo for listings without one: the HDN mark, same file the
// header uses on light backgrounds. Card logos sit on white in both
// themes, so the dark mark works everywhere.
var FALLBACK_LOGO = "assets/hdn-logo-favicon-dark.png";

function dirCard(r) {
  var links = linkButtons(r);
  // Primary link for the stretched card: website first, then socials.
  // The title anchors it and CSS stretches its tap area over the card;
  // the icon buttons sit above that layer and keep their own targets.
  var primary = r.website || r.facebook || r.instagram || r.linkedin;
  var title = esc(r.name);
  if (primary) {
    title = '<a class="card-hit" href="' + esc(primary) + '" target="_blank" rel="noopener">' +
      esc(r.name) + " " + EXT_ICON +
      '<span class="visually-hidden">, opens in new tab</span></a>';
  }
  return (
    '<li class="dir-card' + (primary ? " is-link" : "") + '">' +
    '<img class="dir-logo" src="' + esc(r.logo || FALLBACK_LOGO) + '" alt="" loading="lazy" width="60" height="60">' +
    (r.category ? '<p class="dir-eyebrow">' + esc(r.category) + "</p>" : "") +
    "<h3>" + title + "</h3>" +
    (r.description ? '<p class="dir-desc">' + esc(r.description) + "</p>" : "") +
    (links ? '<div class="dir-foot">' + links + "</div>" : "") +
    "</li>"
  );
}

function matchesSearch(r, term) {
  if (!term) return true;
  var hay = (r.name + " " + r.description + " " + r.category).toLowerCase();
  return hay.indexOf(term) !== -1;
}

function renderDirectory() {
  var grid = document.getElementById("directory-grid");
  var count = document.getElementById("result-count");
  var empty = document.getElementById("directory-empty");
  if (!grid) return;
  var rows = directoryRows().filter(function (r) {
    var okCat = activeCategory === "All" || r.category === activeCategory;
    return okCat && matchesSearch(r, searchTerm);
  });
  grid.innerHTML = rows.map(dirCard).join("");
  var total = directoryRows().length;
  if (count) count.textContent = rows.length + " of " + total + " listings";
  if (empty) empty.hidden = rows.length > 0;
  updateSearchMeta();
}

// Shows the active filter and the Clear control only when a search term
// or a category filter is active.
function updateSearchMeta() {
  var meta = document.getElementById("search-meta");
  var label = document.getElementById("active-filter");
  var clear = document.getElementById("search-clear");
  if (!meta || !label || !clear) return;
  var hasFilter = activeCategory !== "All";
  var hasTerm = !!searchTerm;
  var active = hasFilter || hasTerm;
  meta.hidden = !active;
  if (active) {
    var bits = [];
    if (hasFilter) bits.push("Filtered by: <strong>" + esc(activeCategory) + "</strong>");
    if (hasTerm) bits.push("&ldquo;" + esc(searchTerm) + "&rdquo;");
    label.innerHTML = bits.join(" &middot; ");
    label.hidden = false;
  } else {
    label.hidden = true;
  }
  clear.hidden = !active;
}

function clearSearchAndFilter() {
  searchTerm = "";
  activeCategory = "All";
  var search = document.getElementById("directory-search");
  if (search) search.value = "";
  document.querySelectorAll(".filter-tag").forEach(function (b) {
    b.setAttribute("aria-pressed", String(b.getAttribute("data-category") === "All"));
  });
  renderDirectory();
}

function renderFilterTags() {
  var wrap = document.getElementById("category-tags");
  if (!wrap || typeof SITE_DATA === "undefined") return;
  var present = {};
  directoryRows().forEach(function (r) {
    if (r.category) present[r.category] = true;
  });
  var cats = ["All"].concat(
    CATEGORY_ORDER.filter(function (c) {
      return present[c];
    })
  );
  wrap.innerHTML = cats
    .map(function (c) {
      return (
        '<button type="button" class="filter-tag" data-category="' +
        esc(c) +
        '" aria-pressed="' +
        (c === activeCategory) +
        '">' +
        esc(c) +
        "</button>"
      );
    })
    .join("");
  wrap.querySelectorAll(".filter-tag").forEach(function (btn) {
    btn.addEventListener("click", function () {
      activeCategory = btn.getAttribute("data-category");
      wrap.querySelectorAll(".filter-tag").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b === btn));
      });
      renderDirectory();
    });
  });
}

// ---------- filter panel toggle ----------
(function () {
  const toggle = document.getElementById("filter-toggle");
  const panel = document.getElementById("category-panel");
  if (!toggle || !panel) return;
  toggle.addEventListener("click", function () {
    const open = panel.hasAttribute("hidden");
    if (open) panel.removeAttribute("hidden");
    else panel.setAttribute("hidden", "");
    toggle.setAttribute("aria-expanded", String(open));
  });
})();

function renderSocials() {
  var grid = document.getElementById("socials-grid");
  if (!grid) return;
  grid.innerHTML = socialRows().map(dirCard).join("");
}

// ---------- events ----------
function renderEvents() {
  var list = document.getElementById("events-list");
  if (!list || typeof SITE_DATA === "undefined") return;
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var upcoming = SITE_DATA.events
    .filter(function (e) {
      if (!e.date) return true;
      var d = new Date(e.date + "T12:00:00");
      return !isNaN(d) && d >= today;
    })
    .sort(function (a, b) {
      return (a.date || "").localeCompare(b.date || "");
    });
  if (!upcoming.length) {
    list.innerHTML =
      '<p class="empty-note">No upcoming events posted right now. Check the social groups below, most events get announced there, or <a href="#get-listed">submit an event</a>.</p>';
    return;
  }
  list.innerHTML = upcoming
    .map(function (e) {
      // Same stretched-link treatment as directory cards: the title anchors
      // the event link and its tap area covers the card.
      var title = esc(e.name);
      if (e.link) {
        title = '<a class="card-hit" href="' + esc(e.link) + '" target="_blank" rel="noopener">' +
          esc(e.name) + " " + EXT_ICON +
          '<span class="visually-hidden">, opens in new tab</span></a>';
      }
      return (
        '<div class="dir-card event-card' + (e.link ? " is-link" : "") + '">' +
        (e.date ? '<p class="event-date">' + esc(eventDateLabel(e.date)) + "</p>" : "") +
        "<h3>" + title + "</h3>" +
        (e.location ? '<p class="event-location">' + esc(e.location) + "</p>" : "") +
        (e.description ? '<p class="dir-desc">' + esc(e.description) + "</p>" : "") +
        (e.link
          ? '<div class="dir-foot"><div class="card-links">' + (e.link.indexOf("facebook.com") !== -1 ? iconLink(e.link, "Facebook event for " + e.name, "facebook", "Facebook") : iconLink(e.link, "More info for " + e.name, "website", "More info")) + "</div></div>"
          : "") +
        "</div>"
      );
    })
    .join("");
}

// ---------- jobs ----------
// Job boards render as compact whole-card link chips: thumbnail + title
// in a horizontal row, with the external icon pinned to the upper right.
function jobCard(j) {
  if (!j.link) return "";
  return (
    '<a class="job-chip" href="' + esc(j.link) + '" target="_blank" rel="noopener" aria-label="Visit ' + esc(j.title) + ', opens in new tab">' +
    '<img class="job-chip-logo" src="' + esc(j.logo || FALLBACK_LOGO) + '" alt="" loading="lazy" width="45" height="45">' +
    '<span class="job-chip-title">' + esc(j.title) + " " + extIcon("job-chip-icon") + "</span>" +
    "</a>"
  );
}

function renderJobs() {
  var postingsEl = document.getElementById("job-postings");
  var boardsEl = document.getElementById("job-boards");
  if (typeof SITE_DATA === "undefined") return;
  if (postingsEl) {
    var postings = SITE_DATA.postings || [];
    if (!postings.length) {
      postingsEl.innerHTML =
        '<p class="empty-note"><strong>Open postings:</strong> No open postings right now. Know who\'s hiring? <a href="#get-listed">Submit one below</a>.</p>';
    } else {
      postingsEl.innerHTML =
        '<ul class="card-list">' +
        postings.map(dirCard).join("") +
        "</ul>";
    }
  }
  if (boardsEl) {
    boardsEl.innerHTML = SITE_DATA.jobs.map(jobCard).join("");
  }
}

// ---------- shared accordion (guides + FAQ) ----------
function accordionItem(prefix, i, title, panelHtml) {
  var btnId = prefix + "-btn-" + i;
  var panelId = prefix + "-panel-" + i;
  return (
    '<div class="accordion-item">' +
    '<h3 class="accordion-heading"><button type="button" class="accordion-button" id="' + btnId + '" aria-expanded="false" aria-controls="' + panelId + '">' +
    "<span>" + esc(title) + '</span><span class="accordion-icon" aria-hidden="true"><span class="ai-bar ai-bar-h"></span><span class="ai-bar ai-bar-v"></span></span>' +
    "</button></h3>" +
    '<div class="accordion-panel" id="' + panelId + '" role="region" aria-labelledby="' + btnId + '" hidden>' +
    panelHtml +
    "</div></div>"
  );
}

function bindAccordion(container) {
  container.querySelectorAll(".accordion-button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var open = btn.getAttribute("aria-expanded") === "true";
      var panel = document.getElementById(btn.getAttribute("aria-controls"));
      btn.setAttribute("aria-expanded", String(!open));
      if (panel) panel.hidden = open;
    });
  });
}

// ---------- guides ----------
function renderGuides() {
  var list = document.getElementById("guides-list");
  if (typeof SITE_DATA === "undefined" || !list) return;
  list.innerHTML = SITE_DATA.guides
    .map(function (g, i) {
      var sections = (g.sections || [])
        .map(function (s) {
          return "<h4>" + esc(s.heading) + "</h4><p>" + esc(s.body) + "</p>";
        })
        .join("");
      var panel =
        '<p class="guide-intro">' + esc(g.intro) + "</p>" +
        sections +
        '<p class="guide-closing">' + esc(g.closing) + "</p>";
      return accordionItem("guide", i, g.title, panel);
    })
    .join("");
  bindAccordion(list);
}

// ---------- FAQ accordion ----------
// The name link is injected only where the answer text names Long Duong
// (currently the first and last FAQ), keeping data.js plain text.
var NAME_LINK = '<a href="https://lduong.com" target="_blank" rel="noopener" aria-label="Long Duong\'s portfolio, opens in new tab">Long Duong ' + extIcon() + "</a>";

function renderFaq() {
  var list = document.getElementById("faq-list");
  if (!list || typeof SITE_DATA === "undefined") return;
  list.innerHTML = SITE_DATA.faqs
    .map(function (f, i) {
      return accordionItem("faq", i, f.question, "<p>" + esc(f.answer).split("Long Duong").join(NAME_LINK) + "</p>");
    })
    .join("");
  bindAccordion(list);
}

// ---------- contact form via Cloudflare Worker -> Notion ----------
// Fallback: if the Worker is ever down, swap form.action back to the
// FormSubmit URL (see git history) and this handler works unchanged.
(function () {
  const form = document.getElementById("contact-form");
  if (!form) return;
  const status = form.querySelector(".form-status");
  const submitBtn = form.querySelector('button[type="submit"]');
  const submitLabel = submitBtn ? submitBtn.textContent : "";
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending...";
    }
    status.textContent = "Sending...";
    try {
      const res = await fetch(form.action, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      if (!res.ok) throw new Error("send failed");
      status.textContent = "Thanks, your submission is on its way.";
      form.reset();
    } catch (err) {
      status.textContent =
        "Something went wrong. Please try again in a bit.";
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitLabel;
      }
    }
  });
})();

// ---------- render everything ----------
renderFilterTags();
renderDirectory();
renderSocials();
renderEvents();
renderJobs();
renderGuides();
renderFaq();

(function () {
  const search = document.getElementById("directory-search");
  const clearBtn = document.getElementById("search-clear");
  var debounceTimer = null;
  if (search) {
    search.addEventListener("input", function () {
      // Debounced so the live region announces once typing pauses,
      // not on every keystroke.
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        searchTerm = search.value.trim().toLowerCase();
        renderDirectory();
      }, 250);
    });
  }
  if (clearBtn) clearBtn.addEventListener("click", clearSearchAndFilter);
})();

