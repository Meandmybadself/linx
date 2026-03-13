/**
 * Generates a styled static HTML site from collected links.
 * Output goes to docs/ for GitHub Pages.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const OUT_DIR = join(__dirname, "..", "docs");

function main() {
  const linksData = JSON.parse(readFileSync(join(DATA_DIR, "links.json"), "utf-8"));

  mkdirSync(OUT_DIR, { recursive: true });

  // Group links by date
  const grouped = groupByDate(linksData.links);

  const html = buildHtml(grouped, linksData.links.length);

  writeFileSync(join(OUT_DIR, "index.html"), html);
  writeFileSync(join(OUT_DIR, "CNAME"), "mnncrpls.meandmybadself.com\n");

  console.log(`Generated site with ${linksData.links.length} link(s) in docs/`);
}

function groupByDate(links) {
  const groups = {};

  // Sort newest first
  const sorted = [...links].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  for (const link of sorted) {
    const date = new Date(Number(link.timestamp) * 1000).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    if (!groups[date]) groups[date] = [];
    groups[date].push(link);
  }

  return groups;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncateUrl(url, maxLen = 80) {
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen - 1) + "\u2026";
}

function buildHtml(grouped, totalCount) {
  const dates = Object.keys(grouped);

  const linkSections = dates
    .map((date) => {
      const links = grouped[date];
      const items = links
        .map((link) => {
          const safeUrl = /^https?:\/\//i.test(link.url) ? link.url : "#";
          const displayUrl = truncateUrl(link.url);
          const channel = escapeHtml(link.channelName || "unknown");
          const user = escapeHtml(link.userName || "anonymous");

          return `        <li class="link-item">
          <a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(displayUrl)}</a>
          <span class="meta">shared by <strong>${user}</strong> in <strong>#${channel}</strong></span>
        </li>`;
        })
        .join("\n");

      return `      <section class="day">
        <h2>${escapeHtml(date)}</h2>
        <ul>${items}
        </ul>
      </section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🔗</text></svg>">
  <title>MNNCRPLS Linx</title>
  <style>
    :root {
      --bg: #0a0a0f;
      --surface: #12121a;
      --border: #1e1e2e;
      --text: #e0e0e8;
      --text-dim: #8888a0;
      --accent: #7c6ff7;
      --accent-hover: #9b8fff;
      --link: #58a6ff;
      --link-hover: #79bbff;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: "SF Mono", "Fira Code", "JetBrains Mono", monospace;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      min-height: 100vh;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
    }

    header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 1.5rem;
      margin-bottom: 2rem;
    }

    h1 {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--accent);
    }

    h1 span {
      color: var(--text-dim);
      font-weight: 400;
    }

    .subtitle {
      color: var(--text-dim);
      font-size: 0.8rem;
      margin-top: 0.25rem;
    }

    .day {
      margin-bottom: 2rem;
    }

    .day h2 {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 0.75rem;
      padding-bottom: 0.25rem;
      border-bottom: 1px solid var(--border);
    }

    ul {
      list-style: none;
    }

    .link-item {
      padding: 0.6rem 0.75rem;
      border-radius: 4px;
      margin-bottom: 0.25rem;
      transition: background 0.15s;
    }

    .link-item:hover {
      background: var(--surface);
    }

    .link-item a {
      color: var(--link);
      text-decoration: none;
      font-size: 0.85rem;
      word-break: break-all;
    }

    .link-item a:hover {
      color: var(--link-hover);
      text-decoration: underline;
    }

    .meta {
      display: block;
      font-size: 0.7rem;
      color: var(--text-dim);
      margin-top: 0.15rem;
    }

    .meta strong {
      color: var(--text);
      font-weight: 500;
    }

    .empty {
      text-align: center;
      padding: 4rem 1rem;
      color: var(--text-dim);
    }

    .empty p {
      font-size: 0.9rem;
    }

    footer {
      border-top: 1px solid var(--border);
      padding-top: 1rem;
      margin-top: 2rem;
      text-align: center;
      color: var(--text-dim);
      font-size: 0.7rem;
    }

    .how-to {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 1.25rem 1.5rem;
      margin-bottom: 2rem;
      font-size: 0.8rem;
    }

    .how-to h2 {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--accent);
      margin-bottom: 0.5rem;
    }

    .how-to p {
      color: var(--text-dim);
      margin-bottom: 0.4rem;
    }

    .how-to code {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 0.15rem 0.4rem;
      color: var(--text);
      font-size: 0.8rem;
    }

    footer a {
      color: var(--accent);
      text-decoration: none;
    }

    footer a:hover {
      color: var(--accent-hover);
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>MNNCRPLS <span>Linx</span></h1>
      <p class="subtitle">${totalCount} link${totalCount !== 1 ? "s" : ""} collected from Slack</p>
    </header>
    <section class="how-to">
      <h2>How to participate</h2>
      <p>Type <code>/linx-optin</code> in any Slack channel to start having your links collected.</p>
      <p>Type <code>/linx-optout</code> to stop at any time.</p>
    </section>
    <main>
${
  dates.length > 0
    ? linkSections
    : '      <div class="empty"><p>No links collected yet. Opt in with /linx-optin in Slack.</p></div>'
}
    </main>
    <footer>
      <a href="https://join.slack.com/t/minnecrapolis/shared_invite/zt-c5egggfa-jbm1ep8dCF_5AFCK6F7muw">Join minnecrapolis</a> &middot; <a href="https://github.com/Meandmybadself/linx">Source</a> &middot; Updated hourly
    </footer>
  </div>
</body>
</html>
`;
}

main();
