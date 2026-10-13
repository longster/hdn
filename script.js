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

function verifiedLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  if (isNaN(d)) return "";
  const month = d.toLocaleDateString("en-US", { month: "short" });
  return "Verified " + month + " " + d.getFullYear();
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
  var badge = verifiedLabel(r.verified);
  var links = linkButtons(r);
  return (
    '<li class="dir-card">' +
    (r.logo ? '<img class="dir-logo" src="' + esc(r.logo) + '" alt="" loading="lazy" width="60" height="60">' : "") +
    (r.category ? '<p class="dir-eyebrow">' + esc(r.category) + "</p>" : "") +
    "<h3>" + esc(r.name) + "</h3>" +
    (r.description ? '<p class="dir-desc">' + esc(r.description) + "</p>" : "") +
    ((badge || links)
      ? '<div class="dir-foot">' +
        (badge ? '<span class="verified-badge">' + esc(badge) + "</span>" : "") +
        links +
        "</div>"
      : "") +
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

function renderChips() {
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
        '<button type="button" class="chip" data-category="' +
        esc(c) +
        '" aria-pressed="' +
        (c === activeCategory) +
        '">' +
        esc(c) +
        "</button>"
      );
    })
    .join("");
  wrap.querySelectorAll(".chip").forEach(function (btn) {
    btn.addEventListener("click", function () {
      activeCategory = btn.getAttribute("data-category");
      wrap.querySelectorAll(".chip").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b === btn));
      });
      renderDirectory();
    });
  });
}

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
    boardsEl.innerHTML = SITE_DATA.jobs
      .map(function (j) {
        return (
          "<li>" +
          (j.link
            ? '<a href="' + esc(j.link) + '">' + esc(j.title) + "</a>"
            : esc(j.title)) +
          "</li>"
        );
      })
      .join("");
  }
}

// ---------- guides ----------
function renderGuides() {
  var toc = document.getElementById("guide-toc-list");
  var list = document.getElementById("guides-list");
  if (typeof SITE_DATA === "undefined" || !list) return;
  if (toc) {
    toc.innerHTML = SITE_DATA.guides
      .map(function (g) {
        return '<li><a href="#' + esc(g.id) + '">' + esc(g.title) + "</a></li>";
      })
      .join("");
  }
  list.innerHTML = SITE_DATA.guides
    .map(function (g) {
      var sections = (g.sections || [])
        .map(function (s) {
          return "<h4>" + esc(s.heading) + "</h4><p>" + esc(s.body) + "</p>";
        })
        .join("");
      return (
        '<article class="guide" id="' + esc(g.id) + '" aria-labelledby="' + esc(g.id) + '-title">' +
        '<h3 id="' + esc(g.id) + '-title">' + esc(g.title) + "</h3>" +
        '<p class="guide-intro">' + esc(g.intro) + "</p>" +
        sections +
        '<p class="guide-closing">' + esc(g.closing) + "</p>" +
        "</article>"
      );
    })
    .join("");
}

// ---------- FAQ accordion ----------
function renderFaq() {
  var list = document.getElementById("faq-list");
  if (!list || typeof SITE_DATA === "undefined") return;
  list.innerHTML = SITE_DATA.faqs
    .map(function (f, i) {
      var btnId = "faq-btn-" + i;
      var panelId = "faq-panel-" + i;
      return (
        '<div class="accordion-item">' +
        '<button type="button" class="accordion-button" id="' + btnId + '" aria-expanded="false" aria-controls="' + panelId + '">' +
        "<span>" + esc(f.question) + '</span><span class="accordion-icon" aria-hidden="true">+</span>' +
        "</button>" +
        '<div class="accordion-panel" id="' + panelId + '" role="region" aria-labelledby="' + btnId + '" hidden>' +
        "<p>" + esc(f.answer) + "</p>" +
        "</div></div>"
      );
    })
    .join("");
  list.querySelectorAll(".accordion-button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var open = btn.getAttribute("aria-expanded") === "true";
      var panel = document.getElementById(btn.getAttribute("aria-controls"));
      btn.setAttribute("aria-expanded", String(!open));
      if (panel) panel.hidden = open;
      var icon = btn.querySelector(".accordion-icon");
      if (icon) icon.textContent = open ? "+" : "−";
    });
  });
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
        "Something went wrong. Please try again or email info@houstondeafnetwork.com directly.";
    }
  });
})();

// ---------- render everything ----------
renderChips();
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
