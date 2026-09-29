# Skill Forge Academy WhatsApp Bot

Standalone WhatsApp bot for Skill Forge Academy, built with Node.js and the official Meta WhatsApp Cloud API.

This repository is the bot-only deployment target. The Skill Forge Academy website remains in its separate repository.

## Features

- Interactive welcome menu
- Courses and current fees
- Scholarships and registration information
- Website, mobile app, graphics/photo, video and UI/UX service enquiries
- Project/portfolio links
- Human handoff mode
- STOP/unsubscribe and START BOT/resume
- Duplicate-message protection
- Meta webhook signature verification
- Optional MongoDB persistence
- Render health endpoint

## Deploy on Render

### Blueprint

1. Render → **New +** → **Blueprint**
2. Connect **Ajazprecious/SkillForge-Bot**
3. Render detects `render.yaml`
4. Enter the required secret environment variables

### Manual Web Service

- Repository: `Ajazprecious/SkillForge-Bot`
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

No Root Directory is required because the bot now lives at the repository root.

## Required Render environment variables

```env
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_VERIFY_TOKEN=...
META_APP_SECRET=...
```

Optional persistence:

```env
MONGODB_URI=...
MONGODB_DB_NAME=skillforge_whatsapp_bot
```

Never commit real Meta tokens, App Secrets, MongoDB credentials, or webhook verification secrets to GitHub.

## Meta webhook

After deploying, set your callback URL in Meta to:

```text
https://YOUR-RENDER-SERVICE.onrender.com/webhook
```

Use the exact same `WHATSAPP_VERIFY_TOKEN` value in both Render and Meta.

Subscribe the WhatsApp webhook to the `messages` field.

## Test

Health check:

```text
https://YOUR-RENDER-SERVICE.onrender.com/health
```

Then send messages such as:

```text
Hi
Menu
Courses
Web development course
AI
Scholarship
Website
Mobile app
Portfolio
Human
```

## Endpoints

```text
GET /
GET /health
GET /webhook
POST /webhook
```

## Human handoff

When a customer chooses **Speak to a Person** or requests a quote, the bot becomes silent for the configured handoff period so a team member can reply.

The customer can type `MENU` at any time to reactivate automated replies.

## Configuration

Edit `src/config.js` to change course prices, service prices, links, portfolio items, and Skill Forge information.
