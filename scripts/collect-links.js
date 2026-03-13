/**
 * Collects links from Slack channels where the bot is present,
 * posted by opted-in users since the last check (or 1 week).
 */

import { WebClient } from "@slack/web-api";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

// URL regex - matches http/https URLs
const URL_REGEX = /https?:\/\/[^\s<>|]+/g;

async function main() {
  const optedIn = JSON.parse(readFileSync(join(DATA_DIR, "opted-in.json"), "utf-8"));
  const state = JSON.parse(readFileSync(join(DATA_DIR, "state.json"), "utf-8"));
  const linksData = JSON.parse(readFileSync(join(DATA_DIR, "links.json"), "utf-8"));

  const optedInUserIds = Object.keys(optedIn.users);
  if (optedInUserIds.length === 0) {
    console.log("No opted-in users. Nothing to collect.");
    updateState(state);
    return;
  }

  // Determine the oldest timestamp to look back
  const oneWeekAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
  const lastCheck = state.lastCheck ? Math.floor(new Date(state.lastCheck).getTime() / 1000) : null;
  const oldest = lastCheck ? Math.max(lastCheck, oneWeekAgo).toString() : oneWeekAgo.toString();

  console.log(`Collecting links since ${new Date(Number(oldest) * 1000).toISOString()}`);

  // Get all channels the bot is a member of
  const channels = await getBotChannels();
  console.log(`Bot is in ${channels.length} channel(s)`);

  const newLinks = [];

  for (const channel of channels) {
    console.log(`Scanning #${channel.name}...`);
    const messages = await getChannelMessages(channel.id, oldest);

    for (const msg of messages) {
      // Skip if user is not opted in
      if (!optedInUserIds.includes(msg.user)) continue;

      // Extract URLs from the message text
      const urls = extractUrls(msg.text || "").filter((u) => /^https?:\/\//i.test(u));
      if (urls.length === 0) continue;

      const userName = optedIn.users[msg.user]?.name || msg.user;

      for (const url of urls) {
        // Deduplicate - skip if this exact URL is already collected
        const exists = linksData.links.some((l) => l.url === url && l.channelId === channel.id);
        if (exists) continue;

        newLinks.push({
          url,
          userId: msg.user,
          userName,
          channelId: channel.id,
          channelName: channel.name,
          timestamp: msg.ts,
          collectedAt: new Date().toISOString(),
          messageText: (msg.text || "").slice(0, 280),
        });
      }
    }
  }

  console.log(`Found ${newLinks.length} new link(s)`);

  // Fetch metadata for new links
  for (const link of newLinks) {
    link.meta = await fetchMeta(link.url);
  }

  linksData.links.push(...newLinks);

  // Backfill metadata for existing links missing it
  const backfill = linksData.links.filter((l) => !l.meta);
  if (backfill.length > 0) {
    console.log(`Backfilling metadata for ${backfill.length} link(s)...`);
    for (const link of backfill) {
      link.meta = await fetchMeta(link.url);
    }
  }

  writeFileSync(join(DATA_DIR, "links.json"), JSON.stringify(linksData, null, 2) + "\n");

  updateState(state);
}

function updateState(state) {
  state.lastCheck = new Date().toISOString();
  writeFileSync(join(DATA_DIR, "state.json"), JSON.stringify(state, null, 2) + "\n");
}

async function getBotChannels() {
  const channels = [];
  let cursor;

  do {
    const result = await slack.conversations.list({
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 200,
      cursor,
    });

    for (const ch of result.channels || []) {
      if (ch.is_member) {
        channels.push({ id: ch.id, name: ch.name });
      }
    }

    cursor = result.response_metadata?.next_cursor;
  } while (cursor);

  return channels;
}

async function getChannelMessages(channelId, oldest) {
  const messages = [];
  let cursor;

  do {
    const result = await slack.conversations.history({
      channel: channelId,
      oldest,
      limit: 200,
      cursor,
    });

    for (const msg of result.messages || []) {
      if (msg.type === "message" && !msg.subtype) {
        messages.push(msg);
      }
    }

    cursor = result.response_metadata?.next_cursor;
  } while (cursor);

  return messages;
}

async function fetchMeta(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "MNNCRPLS-Linx/1.0 (link preview bot)" },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;

    const html = await res.text();

    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || null;

    const ogTitle = extractMetaContent(html, 'property="og:title"') ||
                    extractMetaContent(html, "property='og:title'");
    const ogDesc = extractMetaContent(html, 'property="og:description"') ||
                   extractMetaContent(html, "property='og:description'") ||
                   extractMetaContent(html, 'name="description"') ||
                   extractMetaContent(html, "name='description'");
    const ogImage = extractMetaContent(html, 'property="og:image"') ||
                    extractMetaContent(html, "property='og:image'");

    // Favicon: check <link rel="icon">, fall back to /favicon.ico
    let favicon = extractLinkHref(html, 'rel="icon"') ||
                  extractLinkHref(html, "rel='icon'") ||
                  extractLinkHref(html, 'rel="shortcut icon"') ||
                  extractLinkHref(html, "rel='shortcut icon'");

    const origin = new URL(url).origin;
    if (favicon && !favicon.startsWith("http")) {
      favicon = favicon.startsWith("/") ? origin + favicon : origin + "/" + favicon;
    }
    if (!favicon) {
      favicon = origin + "/favicon.ico";
    }

    const meta = {
      title: ogTitle || title || null,
      description: ogDesc?.slice(0, 300) || null,
      favicon,
    };

    if (ogImage) meta.image = ogImage;

    console.log(`  ✓ ${url} → ${meta.title || "(no title)"}`);
    return meta;
  } catch (err) {
    console.log(`  ✗ ${url} → ${err.message}`);
    return null;
  }
}

function extractMetaContent(html, attrMatch) {
  const regex = new RegExp(`<meta[^>]*${attrMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^>]*content=["']([^"']*)["'][^>]*/?>`, "i");
  const match = html.match(regex);
  if (match) return match[1];
  // Try reversed order (content before property)
  const regex2 = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*${attrMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^>]*/?>`, "i");
  return html.match(regex2)?.[1] || null;
}

function extractLinkHref(html, attrMatch) {
  const regex = new RegExp(`<link[^>]*${attrMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^>]*href=["']([^"']*)["'][^>]*/?>`, "i");
  const match = html.match(regex);
  if (match) return match[1];
  const regex2 = new RegExp(`<link[^>]*href=["']([^"']*)["'][^>]*${attrMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^>]*/?>`, "i");
  return html.match(regex2)?.[1] || null;
}

function extractUrls(text) {
  // Slack formats URLs as <url> or <url|label>
  const slackUrlRegex = /<(https?:\/\/[^|>]+)(?:\|[^>]*)?>/g;
  const urls = [];
  let match;

  while ((match = slackUrlRegex.exec(text)) !== null) {
    urls.push(match[1]);
  }

  // Also check for bare URLs not wrapped in <>
  if (urls.length === 0) {
    while ((match = URL_REGEX.exec(text)) !== null) {
      urls.push(match[0].replace(/[.,!?)]+$/, ""));
    }
  }

  return urls;
}

main().catch((err) => {
  console.error("Error collecting links:", err);
  process.exit(1);
});
