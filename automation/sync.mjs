// Houston Deaf Network: Notion -> data.js sync.
// Runs in the GitHub Action (see .github/workflows/hdn-notion-sync.yml)
// and locally: NOTION_TOKEN=... DATABASE_ID_DIRECTORY=... node sync.mjs
// [path/to/data.js]
// Regenerates data.js in exactly the format the site already uses.
// The approval gate is absolute: each database publishes only rows in
// its approved state, and if a database has no Status property, the
// sync FAILS for that database and publishes nothing from it.
//
// PROPERTY MAP, verified against the live HDN databases 2026-10-15.
// In Notion, the API type "text" appears here as rich_text.
//   Directory: Name (title), Category (select), Description
//     (rich_text), Website (url), Facebook (url), LinkedIn (url),
//     Logo (files), Last verified (date), Notes (rich_text),
//     Status (select: Active / Pending review / Archived).
//     There is NO Instagram property in Notion; the site's instagram
//     values are preserved from the previous data.js for matching
//     records (see the Directory loop below).
//   Events: Name (title), Date (date), Location (rich_text),
//     Description (rich_text), Link (url), Source (rich_text),
//     Status (select: Upcoming / Past / Cancelled).
//   Jobs (postings only; the 16 job-board chips stay curated in data.js):
//     Title (title), Organization (rich_text), Description
//     (rich_text), Link (url), Expiry date (date),
//     Status (select: Active / Expired / Filled).
//   FAQ: Question (title), Answer (rich_text), Order (number),
//     Status (select: Published / Draft).
// Guides are not in Notion; the existing guides array is preserved.
//
// PUBLISH RULES (mirror the Worker holding states in worker.js):
//   Directory: Status = "Active" only.
//   Events: Status = "Upcoming" AND Source does NOT contain
//     "PENDING REVIEW". New form submissions carry that Source
//     marker until the owner clears it.
//   Jobs: Status = "Active" only. "Filled" is the holding state for
//     unreviewed postings and never publishes.
//   FAQ: Status = "Published" only, ordered by Order.
// Logos: the sync never writes logos to Notion. When reading, a
// Directory row's Logo file property (a file property) is fetched
// and embedded as a data URI; otherwise the previous data.js logo
// for that record is kept.

import { readFileSync, writeFileSync } from "node:fs";

const NOTION_VERSION = "2022-06-28";
const NOTION_API = "https://api.notion.com/v1";
const MAX_LOGO_BYTES = 500_000;

const MAP = {
  directory: {
    name: "Name",
    category: "Category",
    description: "Description",
    website: "Website",
    facebook: "Facebook",
    linkedin: "LinkedIn",
    verified: "Last verified",
    logo: "Logo",
    status: "Status",
  },
  events: {
    name: "Name",
    date: "Date",
    location: "Location",
    description: "Description",
    link: "Link",
    source: "Source",
    status: "Status",
  },
  jobs: {
    title: "Title",
    organization: "Organization",
    description: "Description",
    link: "Link",
    expiry: "Expiry date",
    status: "Status",
  },
  faq: { question: "Question", answer: "Answer", order: "Order", status: "Status" },
};

const token = process.env.NOTION_TOKEN;
if (!token) {
  console.error("NOTION_TOKEN is not set.");
  process.exit(1);
}
for (const key of ["DATABASE_ID_DIRECTORY", "DATABASE_ID_EVENTS", "DATABASE_ID_JOBS", "DATABASE_ID_FAQ"]) {
  if (!process.env[key]) {
    console.error(key + " is not set.");
    process.exit(1);
  }
}

async function notionFetch(path, options = {}) {
  const res = await fetch(NOTION_API + path, {
    ...options,
    headers: {
      Authorization: "Bearer " + token,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Notion " + path + " failed: " + (body.message || res.status));
  return body;
}

async function getSchema(dbId) {
  const db = await notionFetch("/databases/" + dbId);
  const props = {};
  let titleProp = null;
  for (const [name, def] of Object.entries(db.properties || {})) {
    props[name] = def.type;
    if (def.type === "title") titleProp = name;
  }
  return { titleProp, props };
}

async function queryByStatus(dbId, statusProp, statusValue) {
  const rows = [];
  let cursor = undefined;
  do {
    const body = await notionFetch("/databases/" + dbId + "/query", {
      method: "POST",
      body: JSON.stringify({
        filter: { property: statusProp, select: { equals: statusValue } },
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    });
    rows.push(...(body.results || []));
    cursor = body.has_more ? body.next_cursor : undefined;
  } while (cursor);
  return rows;
}

// Notion API property readers (tolerant of missing properties).
function readTitle(page, schema) {
  const p = page.properties?.[schema.titleProp];
  return p?.title?.map((t) => t.plain_text).join("") || "";
}
function readText(page, name) {
  const p = page.properties?.[name];
  if (!p) return "";
  if (p.type === "rich_text") return (p.rich_text || []).map((t) => t.plain_text).join("");
  if (p.type === "title") return (p.title || []).map((t) => t.plain_text).join("");
  return "";
}
function readSelect(page, name) {
  return page.properties?.[name]?.select?.name || "";
}
function readUrl(page, name) {
  return page.properties?.[name]?.url || "";
}
function readDate(page, name) {
  return page.properties?.[name]?.date?.start || "";
}
function readFileUrl(page, name) {
  const files = page.properties?.[name]?.files || [];
  const f = files[0];
  if (!f) return "";
  if (f.type === "file") return f.file?.url || "";
  if (f.type === "external") return f.external?.url || "";
  return "";
}

// Fetch a logo URL and embed it as a data URI. Returns "" on any
// failure or when the file is over the size cap, so one bad logo
// never breaks the whole sync.
async function logoToDataUri(url) {
  if (!url) return "";
  try {
    const res = await fetch(url);
    if (!res.ok) return "";
    const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_LOGO_BYTES) {
      console.warn("Logo over size cap, skipping: " + url.slice(0, 80));
      return "";
    }
    return "data:" + type + ";base64," + buf.toString("base64");
  } catch (err) {
    console.warn("Logo fetch failed, skipping: " + err.message);
    return "";
  }
}

function byName(a, b) {
  return a.name.localeCompare(b.name);
}

async function main() {
  const dataPath = process.argv[2] || "./data.js";
  const src = readFileSync(dataPath, "utf8");
  const match = src.match(/const SITE_DATA = (\{[\s\S]*\});/);
  if (!match) throw new Error("Could not parse " + dataPath);
  const old = new Function("return (" + match[1] + ")")();
  const today = new Date().toISOString().slice(0, 10);
  const oldLogos = new Map((old.directory || []).map((r) => [r.name, r.logo || ""]));
  const oldPostingLogos = new Map((old.postings || []).map((r) => [r.name, r.logo || ""]));

  // ---- Directory (publish Status = "Active" only) ----
  const dirDb = process.env.DATABASE_ID_DIRECTORY;
  const dirSchema = await getSchema(dirDb);
  if (!("Status" in dirSchema.props)) {
    throw new Error("HDN Directory has no Status property. Add it (select: Active / Pending review / Archived) before sync can publish.");
  }
  const dirRows = await queryByStatus(dirDb, MAP.directory.status, "Active");
  const directory = [];
  const oldByName = new Map((old.directory || []).map((r) => [r.name, r]));
  for (const page of dirRows) {
    const m = MAP.directory;
    const name = readTitle(page, dirSchema);
    if (!name) continue;
    const logoUrl = readFileUrl(page, m.logo);
    let logo = logoUrl ? await logoToDataUri(logoUrl) : "";
    if (!logo) logo = oldLogos.get(name) || "";
    const oldRecord = oldByName.get(name);
    const oldVerified = oldRecord?.verified || "";
    // Notion has no Instagram property. When it is added later, read
    // it; until then, keep the previous data.js value for this record.
    const instagram = ("Instagram" in dirSchema.props)
      ? readUrl(page, "Instagram")
      : (oldRecord?.instagram || "");
    directory.push({
      name,
      category: readSelect(page, m.category),
      description: readText(page, m.description),
      website: readUrl(page, m.website),
      facebook: readUrl(page, m.facebook),
      instagram,
      linkedin: readUrl(page, m.linkedin),
      verified: readDate(page, m.verified) || oldVerified || today,
      logo,
    });
  }
  directory.sort(byName);

  // ---- Events (publish Status = "Upcoming" without the PENDING
  // REVIEW Source marker; script.js filters to upcoming at render) ----
  const evDb = process.env.DATABASE_ID_EVENTS;
  const evSchema = await getSchema(evDb);
  if (!("Status" in evSchema.props)) {
    throw new Error("HDN Events has no Status property. Add it (select: Upcoming / Past / Cancelled) before sync can publish.");
  }
  const evRows = await queryByStatus(evDb, MAP.events.status, "Upcoming");
  const events = evRows
    .map((page) => {
      const m = MAP.events;
      return {
        name: readTitle(page, evSchema),
        date: readDate(page, m.date),
        location: readText(page, m.location),
        description: readText(page, m.description),
        link: readUrl(page, m.link),
        source: readText(page, m.source),
      };
    })
    .filter((e) => e.name && !String(e.source || "").includes("PENDING REVIEW"))
    .map(({ source, ...rest }) => rest)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  // ---- Jobs -> postings (publish Status = "Active" only; "Filled"
  // is the holding state for unreviewed postings). Boards stay
  // curated in data.js. ----
  const jobDb = process.env.DATABASE_ID_JOBS;
  const jobSchema = await getSchema(jobDb);
  if (!("Status" in jobSchema.props)) {
    throw new Error("HDN Jobs has no Status property. Add it (select: Active / Expired / Filled) before sync can publish.");
  }
  const jobRows = await queryByStatus(jobDb, MAP.jobs.status, "Active");
  const postings = [];
  for (const page of jobRows) {
    const m = MAP.jobs;
    const title = readTitle(page, jobSchema);
    if (!title) continue;
    const org = readText(page, m.organization);
    // Jobs has no Logo property in Notion; keep the previous data.js
    // logo for this posting, if any.
    const logo = oldPostingLogos.get(title) || "";
    postings.push({
      name: title,
      category: org || "Job Opening",
      description: readText(page, m.description),
      website: readUrl(page, m.link),
      facebook: "",
      instagram: "",
      linkedin: "",
      verified: today,
      logo,
    });
  }
  postings.sort(byName);

  // ---- FAQ (publish Status = "Published" only, ordered by Order) ----
  const faqDb = process.env.DATABASE_ID_FAQ;
  const faqSchema = await getSchema(faqDb);
  if (!("Status" in faqSchema.props)) {
    throw new Error("HDN FAQ has no Status property. Add it (select: Published / Draft) before sync can publish.");
  }
  const faqRows = await queryByStatus(faqDb, MAP.faq.status, "Published");
  const faqs = faqRows
    .map((page) => ({
      question: readTitle(page, faqSchema),
      answer: readText(page, MAP.faq.answer),
      order: Number(page.properties?.[MAP.faq.order]?.number ?? Number.POSITIVE_INFINITY),
    }))
    .filter((f) => f.question)
    .sort((a, b) => a.order - b.order)
    .map(({ order, ...rest }) => rest);

  const next = {
    generated: today,
    source: old.source || "Notion CMS, HDN workspace",
    directory,
    events,
    postings,
    jobs: old.jobs || [],
    faqs,
    guides: old.guides || [],
  };

  // Compare data only (ignore the generated timestamp) so the Action
  // commits only when real content changed.
  const strip = (d) => {
    const copy = { ...d };
    delete copy.generated;
    return JSON.stringify(copy);
  };
  if (strip(next) === strip(old)) {
    console.log("No changes. data.js untouched.");
    return;
  }
  writeFileSync(dataPath, "const SITE_DATA = " + JSON.stringify(next) + ";\n");
  console.log(
    "Wrote " + dataPath + ": " + directory.length + " directory, " + events.length +
    " events, " + postings.length + " postings, " + faqs.length + " faqs."
  );
}

main().catch((err) => {
  console.error("Sync failed: " + err.message);
  process.exit(1);
});
