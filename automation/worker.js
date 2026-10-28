// Houston Deaf Network submission intake.
// Cloudflare Worker: receives the Get Listed form, writes a row to
// Notion, and emails an acknowledgment plus an owner notification.
// No framework, no wrangler dependencies. Plain fetch handler.
//
// SETUP: paste this file into a Cloudflare Worker and set these secrets
// (wrangler secret put, or the dashboard Settings > Variables):
//   NOTION_TOKEN, DATABASE_ID_DIRECTORY, DATABASE_ID_EVENTS,
//   DATABASE_ID_JOBS, DATABASE_ID_MESSAGES,
//   RESEND_API_KEY, FROM_EMAIL, OWNER_EMAIL
//
// PROPERTY MAP, verified against the live HDN databases 2026-10-15.
// In Notion, the API type "text" appears here as rich_text.
//   Directory: Name (title), Category (multi-select since the
//     2026-10-23 conversion, 9 options below; written type-aware),
//     Description (rich_text), Website (url), Facebook (url),
//     LinkedIn (url), Logo (files), Last verified (date),
//     Notes (rich_text), Status (select: Active / Pending review /
//     Archived). There is NO Instagram property and NO Details /
//     Submitter Name / Submitter Email properties. Instagram URLs,
//     submitter name/email, and the full raw text go in Notes.
//   Events: Name (title), Date (date), Location (rich_text),
//     Description (rich_text), Link (url), Source (rich_text),
//     Status (select: Upcoming / Past / Cancelled). There is NO
//     "Pending review" Status option and NO Notes property.
//   Jobs (postings): Title (title), Organization (rich_text),
//     Description (rich_text), Link (url), Expiry date (date),
//     Status (select: Active / Expired / Filled). There is NO
//     "Pending review" Status option, NO Notes property, NO Logo.
//   Messages: Name (title), Email (email), Type (select),
//     Message (rich_text), Status (select: New / Replied / Done),
//     Submitted (date)
//
// HOLDING-STATE RULES (the approval gate). Nothing publishes until
// the owner approves it in Notion, and sync.mjs enforces the same
// rules on the publish side.
//   Directory: new rows get Status = "Pending review". Owner
//     approves by flipping Status to "Active".
//   Events: no "Pending review" option exists, so new rows get
//     Status = "Upcoming" AND Source = "Form submission - PENDING
//     REVIEW". The sync treats any Source containing "PENDING
//     REVIEW" as unpublished. Owner approves by clearing that
//     Source marker (leaving Status = "Upcoming").
//   Jobs: no "Pending review" option exists, so new rows get
//     Status = "Filled", which the sync treats as unpublished.
//     Owner approves by flipping Status to "Active".
//   If the owner adds a "Pending review" option to the Events or
//   Jobs Status select (see setup-checklist.md Step 0), prefer it:
//   set Status = "Pending review" and leave Source / "Filled" out.
//
// The Worker reads each target database schema at runtime and only
// writes to properties that actually exist, so a missing optional
// property never breaks intake.

const NOTION_VERSION = "2022-06-28";
const NOTION_API = "https://api.notion.com/v1";

// Only these origins may POST. The preview and the production domain.
const ALLOWED_ORIGINS = [
  "https://longster.github.io",
  "https://houstondeafnetwork.com",
  "https://www.houstondeafnetwork.com",
];

const LISTING_TYPES = ["general", "business", "event", "job", "resource", "correction", "other"];

// Route the form's listing_type to a Notion database (env key).
const TYPE_TO_DB = {
  business: "DATABASE_ID_DIRECTORY",
  resource: "DATABASE_ID_DIRECTORY",
  event: "DATABASE_ID_EVENTS",
  job: "DATABASE_ID_JOBS",
  general: "DATABASE_ID_MESSAGES",
  correction: "DATABASE_ID_MESSAGES",
  other: "DATABASE_ID_MESSAGES",
};

// Best-effort per-IP rate limit: 5 submissions per minute. In-memory only,
// so it resets when the Worker isolate recycles. This is spam friction,
// not a security boundary.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 5;
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(origin, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || ""));
}

function firstIsoDate(text) {
  const m = String(text || "").match(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
  return m ? m[0] : "";
}

// Exact Category option names in HDN Directory. A submission only gets
// a Category when the text names one of these exactly; otherwise the
// owner picks it during review. A non-matching select value would make
// Notion reject the whole page create.
const DIRECTORY_CATEGORIES = [
  "Interpreting Agencies",
  "Organizations & Services",
  "Churches & Ministries",
  "Education & Career",
  "Health & Wellness",
  "Deaf-Owned Business",
  "Social & Meetup",
  "Deaf-Friendly Employers",
  "Deaf-Friendly Business",
];

function matchCategory(text) {
  const lower = String(text || "").toLowerCase();
  for (const c of DIRECTORY_CATEGORIES) {
    if (lower.includes(c.toLowerCase())) return c;
  }
  return "";
}

// Split all URLs in the text by destination. The first non-social URL
// is the listing's Website / Link. Social URLs go to their own
// properties, or to Notes when no such property exists.
function classifyUrls(text) {
  const urls = (String(text || "").match(/https?:\/\/[^\s<>"')]+/gi) || []).map((u) =>
    u.replace(/[.,;:!?]+$/, "")
  );
  const out = { website: "", facebook: "", instagram: "", linkedin: "" };
  for (const u of urls) {
    const host = (u.match(/^https?:\/\/([^/]+)/i) || [])[1] || "";
    if (/facebook\.com$/i.test(host) || host.endsWith(".facebook.com")) {
      if (!out.facebook) out.facebook = u;
    } else if (/instagram\.com$/i.test(host) || host.endsWith(".instagram.com")) {
      if (!out.instagram) out.instagram = u;
    } else if (/linkedin\.com$/i.test(host) || host.endsWith(".linkedin.com")) {
      if (!out.linkedin) out.linkedin = u;
    } else if (!out.website) {
      out.website = u;
    }
  }
  return out;
}

// Value after a "Label:" line, e.g. "Location: 123 Main St". Returns ""
// when no line starts with that label.
function labeledLine(lines, label) {
  const prefix = label.toLowerCase() + ":";
  for (const l of lines) {
    if (l.toLowerCase().startsWith(prefix)) return l.slice(prefix.length).trim();
  }
  return "";
}

// Split the free-text Details box into structured fields. Heuristic:
// first non-empty line = name/title, first non-social URL = link,
// rest = description. The full raw text is always kept in Notes (or
// the owner notification email for databases without Notes), so a bad
// parse loses nothing.
function parseDetails(message) {
  const lines = String(message || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const name = lines[0] || "Untitled submission";
  const urls = classifyUrls(message);
  const rest = lines.slice(1).join("\n");
  const description = rest || message;
  return { name, link: urls.website, description, raw: String(message || ""), urls, lines };
}

// Notion property value builders.
const prop = {
  title: (v) => ({ title: [{ text: { content: String(v || "") } }] }),
  richText: (v) => ({ rich_text: [{ text: { content: String(v || "") } }] }),
  url: (v) => ({ url: v || null }),
  email: (v) => ({ email: v || null }),
  date: (v) => (v ? { date: { start: v } } : { date: null }),
  select: (v) => (v ? { select: { name: v } } : { select: null }),
  multiSelect: (names) => ({ multi_select: names.map((n) => ({ name: n })) }),
};

async function notionFetch(env, path, options = {}) {
  const res = await fetch(NOTION_API + path, {
    ...options,
    headers: {
      Authorization: "Bearer " + env.NOTION_TOKEN,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error("Notion " + path + " failed: " + (body.message || res.status));
  }
  return body;
}

// Read the database schema so we only write to properties that exist.
// Returns { titleProp: "Name", props: { Name: "title", ... } }.
async function getSchema(env, dbId) {
  const db = await notionFetch(env, "/databases/" + dbId);
  const props = {};
  let titleProp = null;
  for (const [name, def] of Object.entries(db.properties || {})) {
    props[name] = def.type;
    if (def.type === "title") titleProp = name;
  }
  return { titleProp, props };
}

function setIf(props, schema, name, type, value) {
  if (!(name in schema.props)) return;
  if (schema.props[name] !== type) return;
  if (type === "title" || type === "rich_text") {
    props[name] = type === "title" ? prop.title(value) : prop.richText(value);
  } else if (type === "url") {
    props[name] = prop.url(value);
  } else if (type === "email") {
    props[name] = prop.email(value);
  } else if (type === "date") {
    props[name] = prop.date(value);
  } else if (type === "select") {
    props[name] = prop.select(value);
  }
}

// HDN form submissions are Houston by definition. Since the Echode
// Phase 1 fields exist on Directory / Events / Jobs, stamp them
// explicitly (Serves HTX, Origin Submitted) instead of leaving them
// empty; the HDN sync treats empty Serves as Houston either way, so
// this is consistency, not a behavior change. Schema-guarded: a
// database without these properties is skipped silently.
function stampOrigin(props, schema) {
  if (schema.props["Serves"] === "multi_select") {
    props["Serves"] = prop.multiSelect(["HTX"]);
  }
  if (schema.props["Origin"] === "select") {
    props["Origin"] = prop.select("Submitted");
  }
}

// Send one email through Resend. Throws on failure; callers catch it
// so a mail failure never fails the submission itself.
async function sendEmail(env, to, subject, text) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: env.FROM_EMAIL, to, subject, text }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error("Resend failed: " + (body.message || res.status));
  }
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const allowed = ALLOWED_ORIGINS.includes(origin);
    const cors = corsHeaders(allowed ? origin : ALLOWED_ORIGINS[0]);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "POST") {
      return jsonResponse(origin, 405, { ok: false, error: "method_not_allowed" });
    }
    if (!allowed) {
      return jsonResponse(origin, 403, { ok: false, error: "origin_not_allowed" });
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (rateLimited(ip)) {
      return jsonResponse(origin, 429, { ok: false, error: "rate_limited" });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(origin, 400, { ok: false, error: "bad_json" });
    }

    // Honeypot: bots fill it, humans never see it. Quietly accept and
    // drop the submission so the bot learns nothing.
    if (body.mx_check) {
      return jsonResponse(origin, 200, { ok: true });
    }

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const type = String(body.listing_type || "").trim();
    const message = String(body.message || "").trim();
    if (!name || !isEmail(email) || !LISTING_TYPES.includes(type) || !message) {
      return jsonResponse(origin, 400, { ok: false, error: "invalid_input" });
    }

    const dbKey = TYPE_TO_DB[type];
    const dbId = env[dbKey];
    if (!dbId) {
      return jsonResponse(origin, 500, { ok: false, error: "db_not_configured" });
    }

    const parsed = parseDetails(message);
    let page;
    try {
      const schema = await getSchema(env, dbId);
      const props = {};
      const isMessages = dbKey === "DATABASE_ID_MESSAGES";

      if (isMessages) {
        // General questions, corrections, anything else: a queue, not a listing.
        setIf(props, schema, schema.titleProp, "title", name);
        setIf(props, schema, "Email", "email", email);
        const TYPE_LABELS = { general: "General question", correction: "Correction", other: "Something else" };
        setIf(props, schema, "Type", "select", TYPE_LABELS[type] || type);
        setIf(props, schema, "Message", "rich_text", message);
        setIf(props, schema, "Status", "select", "New");
        setIf(props, schema, "Submitted", "date", new Date().toISOString().slice(0, 10));
      } else if (dbKey === "DATABASE_ID_EVENTS") {
        // Holding state: Status = "Upcoming" + Source marker. The sync
        // treats any Source containing "PENDING REVIEW" as
        // unpublished. Owner approves by clearing the Source marker.
        setIf(props, schema, schema.titleProp, "title", parsed.name);
        setIf(props, schema, "Date", "date", firstIsoDate(message));
        const loc = labeledLine(parsed.lines, "Location");
        if (loc) setIf(props, schema, "Location", "rich_text", loc);
        setIf(props, schema, "Description", "rich_text", parsed.description);
        setIf(props, schema, "Link", "url", parsed.link);
        setIf(props, schema, "Source", "rich_text", "Form submission - PENDING REVIEW");
        setIf(props, schema, "Status", "select", "Upcoming");
        // Notes does not exist on Events yet. If the owner adds it
        // (see setup-checklist.md Step 0), submitter info lands there.
        setIf(props, schema, "Notes", "rich_text",
          "Submitted by: " + name + " (" + email + ")\n\n" + parsed.raw);
        stampOrigin(props, schema);
      } else if (dbKey === "DATABASE_ID_JOBS") {
        // Holding state: Status = "Filled". The sync treats "Filled"
        // as unpublished. Owner approves by flipping to "Active".
        setIf(props, schema, schema.titleProp, "title", parsed.name);
        const org = labeledLine(parsed.lines, "Organization");
        if (org) setIf(props, schema, "Organization", "rich_text", org);
        setIf(props, schema, "Description", "rich_text", parsed.description);
        setIf(props, schema, "Link", "url", parsed.link);
        // Expiry only when a date on a line mentioning "expir" is found.
        let expiry = "";
        for (const l of parsed.lines) {
          if (/expir/i.test(l)) { expiry = firstIsoDate(l); break; }
        }
        if (expiry) setIf(props, schema, "Expiry date", "date", expiry);
        setIf(props, schema, "Status", "select", "Filled");
        // Notes does not exist on Jobs yet. If the owner adds it
        // (see setup-checklist.md Step 0), submitter info lands there.
        setIf(props, schema, "Notes", "rich_text",
          "Submitted by: " + name + " (" + email + ")\n\n" + parsed.raw);
        stampOrigin(props, schema);
      } else {
        // Directory (business / resource). Status = "Pending review".
        // There is no Instagram / Details / Submitter property, so
        // those go in Notes, which exists on Directory.
        const notes = [];
        if (parsed.urls.instagram) notes.push("Instagram: " + parsed.urls.instagram);
        notes.push("Submitted by: " + name + " (" + email + ")");
        notes.push("");
        notes.push(parsed.raw);
        setIf(props, schema, schema.titleProp, "title", parsed.name);
        // Category converted from select to multi-select on
        // 2026-10-23; write whichever shape the field has today.
        const catMatch = matchCategory(message);
        if (catMatch && schema.props["Category"] === "multi_select") {
          props["Category"] = prop.multiSelect([catMatch]);
        } else {
          setIf(props, schema, "Category", "select", catMatch);
        }
        setIf(props, schema, "Description", "rich_text", parsed.description);
        setIf(props, schema, "Website", "url", parsed.urls.website);
        setIf(props, schema, "Facebook", "url", parsed.urls.facebook);
        setIf(props, schema, "LinkedIn", "url", parsed.urls.linkedin);
        setIf(props, schema, "Notes", "rich_text", notes.join("\n"));
        setIf(props, schema, "Status", "select", "Pending review");
        stampOrigin(props, schema);
      }

      page = await notionFetch(env, "/pages", {
        method: "POST",
        body: JSON.stringify({ parent: { database_id: dbId }, properties: props }),
      });
    } catch (err) {
      console.error("Notion create failed:", err.message);
      return jsonResponse(origin, 500, { ok: false, error: "notion_failed" });
    }

    // Emails are best-effort. A mail failure must not fail the submission.
    const pageUrl = page.url || "";
    ctx.waitUntil(
      (async () => {
        try {
          await sendEmail(
            env,
            email,
            "Thanks for your Houston Deaf Network submission",
            "Hi " + name + ",\n\nThanks for sending this in. I review every submission personally and will follow up if I need anything else. Listings are free, and I only publish what serves the community.\n\nLong Duong\nHouston Deaf Network"
          );
        } catch (err) {
          console.error("Ack email failed:", err.message);
        }
        try {
          await sendEmail(
            env,
            env.OWNER_EMAIL,
            "New HDN submission: " + type + " from " + name,
            "A new " + type + " submission came in from " + name + ".\n\nReview it in Notion: " + pageUrl + "\n\nDetails:\n" + message
          );
        } catch (err) {
          console.error("Owner notification failed:", err.message);
        }
      })()
    );

    return jsonResponse(origin, 200, { ok: true });
  },
};
