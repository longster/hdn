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
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  nav.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    })
  );
})();

// ---------- brand logo always scrolls to true top ----------
// The global scroll-padding-top offset keeps anchors clear of the sticky
// header, but it also stops the logo link from landing at the real top.
// Intercept the click and scroll to 0 explicitly.
(function () {
  const brand = document.querySelector(".brand");
  if (!brand) return;
  brand.addEventListener("click", function (e) {
    e.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
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
  if (r.website) links.push('<a class="card-link" href="' + esc(r.website) + '">Website</a>');
  if (r.facebook) links.push('<a class="card-link" href="' + esc(r.facebook) + '">Facebook</a>');
  if (r.linkedin) links.push('<a class="card-link" href="' + esc(r.linkedin) + '">LinkedIn</a>');
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
  if (count) count.textContent = rows.length + " of " + total;
  if (empty) empty.hidden = rows.length > 0;
}

function renderFilterTags() {
  var wrap = document.getElementById("category-chips");
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
          ? '<div class="dir-foot"><div class="card-links"><a class="card-link" href="' + esc(e.link) + '">More info</a></div></div>'
          : "") +
        "</div>"
      );
    })
    .join("");
}

// ---------- jobs ----------
function jobCard(j) {
  return (
    '<div class="dir-card job-card">' +
    (j.logo ? '<img class="dir-logo" src="' + esc(j.logo) + '" alt="" loading="lazy" width="60" height="60">' : "") +
    "<h3>" + esc(j.title) + "</h3>" +
    '<div class="dir-foot">' +
      (j.link
        ? '<div class="card-links"><a class="card-link" href="' + esc(j.link) + '">Visit</a></div>'
        : "") +
    "</div>" +
    "</div>"
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
    '<button type="button" class="accordion-button" id="' + btnId + '" aria-expanded="false" aria-controls="' + panelId + '">' +
    "<span>" + esc(title) + '</span><span class="accordion-icon" aria-hidden="true"><span class="ai-bar ai-bar-h"></span><span class="ai-bar ai-bar-v"></span></span>' +
    "</button>" +
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
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
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
  if (search) {
    search.addEventListener("input", function () {
      searchTerm = search.value.trim().toLowerCase();
      renderDirectory();
    });
  }
})();

