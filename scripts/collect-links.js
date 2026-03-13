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

  linksData.links.push(...newLinks);
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
