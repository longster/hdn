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
  if (r.website) links.push(extLink(r.website, "Website for " + r.name, "Website"));
  if (r.facebook) links.push(extLink(r.facebook, "Facebook for " + r.name, "Facebook"));
  if (r.instagram) links.push(extLink(r.instagram, "Instagram for " + r.name, "Instagram"));
  if (r.linkedin) links.push(extLink(r.linkedin, "LinkedIn for " + r.name, "LinkedIn"));
  if (!links.length) return "";
  return '<div class="card-links">' + links.join("") + "</div>";
}

function dirCard(r) {
  var links = linkButtons(r);
  return (
    '<li class="dir-card">' +
    (r.logo ? '<img class="dir-logo" src="' + esc(r.logo) + '" alt="" loading="lazy" width="60" height="60">' : "") +
    (r.category ? '<p class="dir-eyebrow">' + esc(r.category) + "</p>" : "") +
    "<h3>" + esc(r.name) + "</h3>" +
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
  label.hidden = !hasFilter;
  clear.hidden = !active;
  if (hasFilter) {
    label.innerHTML = 'Filtered by: <strong>' + esc(activeCategory) + "</strong>";
  }
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
      return (
        '<div class="dir-card event-card">' +
        (e.date ? '<p class="event-date">' + esc(eventDateLabel(e.date)) + "</p>" : "") +
        "<h3>" + esc(e.name) + "</h3>" +
        (e.location ? '<p class="event-location">' + esc(e.location) + "</p>" : "") +
        (e.description ? '<p class="dir-desc">' + esc(e.description) + "</p>" : "") +
        (e.link
          ? '<div class="dir-foot"><div class="card-links">' + extLink(e.link, "More info for " + e.name, "More info") + "</div></div>"
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
    (j.logo ? '<img class="job-chip-logo" src="' + esc(j.logo) + '" alt="" loading="lazy" width="45" height="45">' : "") +
    '<span class="job-chip-title">' + esc(j.title) + "</span>" +
    extIcon("job-chip-icon") +
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
function renderFaq() {
  var list = document.getElementById("faq-list");
  if (!list || typeof SITE_DATA === "undefined") return;
  list.innerHTML = SITE_DATA.faqs
    .map(function (f, i) {
      return accordionItem("faq", i, f.question, "<p>" + esc(f.answer) + "</p>");
    })
    .join("");
  bindAccordion(list);
}

// ---------- contact form via FormSubmit ajax ----------
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

