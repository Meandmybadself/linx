/**
 * Cloudflare Worker handling Slack slash commands for opt-in/opt-out.
 * Updates data/opted-in.json in the GitHub repo via GitHub API.
 */

const OPTED_IN_PATH = "data/opted-in.json";

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const url = new URL(request.url);

    if (url.pathname === "/slack/commands") {
      return handleSlackCommand(request, env);
    }

    return new Response("Not found", { status: 404 });
  },
};

async function handleSlackCommand(request, env) {
  const body = await request.text();
  const params = new URLSearchParams(body);

  // Verify Slack signature
  const timestamp = request.headers.get("x-slack-request-timestamp");
  const slackSignature = request.headers.get("x-slack-signature");

  if (!await verifySlackSignature(env.SLACK_SIGNING_SECRET, timestamp, body, slackSignature)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const command = params.get("command");
  const userId = params.get("user_id");
  const userName = params.get("user_name");

  try {
    if (command === "/linx-optin") {
      return await handleOptIn(env, userId, userName);
    } else if (command === "/linx-optout") {
      return await handleOptOut(env, userId, userName);
    }
  } catch (err) {
    console.error("Command error:", err);
    const message = err.message.includes("Conflict")
      ? "Someone else just updated at the same time. Please try again!"
      : "Something went wrong. Please try again later.";
    return jsonResponse({ response_type: "ephemeral", text: message });
  }

  return jsonResponse({ response_type: "ephemeral", text: "Unknown command." });
}

async function handleOptIn(env, userId, userName) {
  const { data, sha } = await getOptedInFile(env);

  if (data.users[userId]) {
    return jsonResponse({
      response_type: "ephemeral",
      text: `You're already opted in, ${userName}! Your shared links are being collected.`,
    });
  }

  data.users[userId] = {
    name: userName,
    optedInAt: new Date().toISOString(),
  };

  await updateOptedInFile(env, data, sha, `opt-in: ${userName}`);

  return jsonResponse({
    response_type: "ephemeral",
    text: `You're now opted in, ${userName}! Links you share in channels where the bot is present will be collected and published to mnncrpls.meandmybadself.com`,
  });
}

async function handleOptOut(env, userId, userName) {
  const { data, sha } = await getOptedInFile(env);

  if (!data.users[userId]) {
    return jsonResponse({
      response_type: "ephemeral",
      text: `You're not currently opted in, ${userName}.`,
    });
  }

  delete data.users[userId];

  await updateOptedInFile(env, data, sha, `opt-out: ${userName}`);

  return jsonResponse({
    response_type: "ephemeral",
    text: `You've been opted out, ${userName}. Your future links will no longer be collected.`,
  });
}

async function getOptedInFile(env) {
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${OPTED_IN_PATH}`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "minnecrapolis-linx-worker",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch opted-in file: ${res.status}`);
  }

  const json = await res.json();
  const content = atob(json.content);
  return { data: JSON.parse(content), sha: json.sha };
}

async function updateOptedInFile(env, data, sha, message) {
  const content = btoa(JSON.stringify(data, null, 2) + "\n");

  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${OPTED_IN_PATH}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "minnecrapolis-linx-worker",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, content, sha }),
    }
  );

  if (res.status === 409) {
    throw new Error("Conflict: the file was modified concurrently. Please try again.");
  }
  if (!res.ok) {
    throw new Error(`Failed to update opted-in file: ${res.status}`);
  }
}

async function verifySlackSignature(secret, timestamp, body, signature) {
  // Reject requests older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) {
    return false;
  }

  const sigBaseString = `v0:${timestamp}:${body}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  // Decode the expected signature from Slack's "v0=<hex>" format
  const expectedHex = signature.replace(/^v0=/, "");
  const expectedBytes = new Uint8Array(
    expectedHex.match(/.{2}/g).map((b) => parseInt(b, 16))
  );

  // crypto.subtle.verify uses constant-time comparison
  return crypto.subtle.verify("HMAC", key, expectedBytes, encoder.encode(sigBaseString));
}

function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}
