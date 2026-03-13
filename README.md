# MNNCRPLS Linx

<img src="icon.jpg" alt="MNNCRPLS Linx" width="128">

Collects links shared by opted-in users in Slack and publishes them to a static site at [mnncrpls.meandmybadself.com](https://mnncrpls.meandmybadself.com).

## How it works

1. Users opt in via `/linx-optin` in Slack (opt out anytime with `/linx-optout`)
2. A GitHub Action runs hourly, scanning channels the bot is in for links posted by opted-in users
3. A styled static site is generated and deployed to GitHub Pages

## Architecture

```
Slack slash commands ──► Cloudflare Worker ──► updates data/opted-in.json via GitHub API
                                                          │
GitHub Actions (hourly cron) ──► reads opted-in users ────┘
        │                        queries Slack API for links
        │                        generates static HTML
        ▼
GitHub Pages ──► mnncrpls.meandmybadself.com
```

## Setup

### 1. Create the Slack app

Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app **From a manifest**. Paste the contents of `slack-manifest.yml`. After creating:

- Install the app to your workspace
- Copy the **Bot User OAuth Token** (`xoxb-...`) from OAuth & Permissions
- Copy the **Signing Secret** from Basic Information

### 2. Deploy the Cloudflare Worker

```sh
cd worker
npm install
wrangler secret put SLACK_SIGNING_SECRET   # from Slack app Basic Information
wrangler secret put GITHUB_TOKEN           # a GitHub PAT with repo contents write access
wrangler secret put GITHUB_OWNER           # your GitHub username or org
wrangler deploy
```

After deploying, update the slash command URLs in your Slack app settings to point to `https://<your-worker>.workers.dev/slack/commands`.

### 3. Configure the GitHub repo

Add this repository secret:

| Secret | Value |
|--------|-------|
| `SLACK_BOT_TOKEN` | The `xoxb-...` bot token from step 1 |

### 4. Enable GitHub Pages

In your repo settings:

- Go to **Pages**
- Set source to **Deploy from a branch**
- Select the `main` branch and `/docs` folder

### 5. Configure the custom domain

Add a CNAME record:

```
mnncrpls.meandmybadself.com  CNAME  <your-username>.github.io
```

Then add `mnncrpls.meandmybadself.com` as a custom domain in the GitHub Pages settings.

## Usage

Invite the bot to any Slack channel. Opted-in users' links in those channels will be collected on the next hourly run.

| Command | Description |
|---------|-------------|
| `/linx-optin` | Start collecting your links |
| `/linx-optout` | Stop collecting your links |

## Local development

```sh
npm install

# Collect links (requires SLACK_BOT_TOKEN env var)
SLACK_BOT_TOKEN=xoxb-... npm run collect

# Generate the site from existing data
npm run generate
```

## Cost

Everything runs on free tiers:

- **GitHub Actions** — free for public repos, 2,000 mins/month for private
- **Cloudflare Workers** — 100k requests/day free
- **GitHub Pages** — free
