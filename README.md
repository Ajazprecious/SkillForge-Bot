# Skill Forge Academy WhatsApp Bot

A standalone WhatsApp bot for Skill Forge Academy using the official Meta WhatsApp Cloud API and **Cloudflare Workers**.

The bot no longer needs Express, MongoDB, a long-running Node server, or Render. It is request-driven and can run on Cloudflare Workers.

## Features

- Interactive WhatsApp welcome menu
- Current Skill Forge courses and fees
- Scholarships and registration information
- Website, mobile app, graphics/photo, video and UI/UX service enquiries
- Project/portfolio links
- Human handoff mode
- STOP/unsubscribe and START BOT/resume
- Duplicate-message protection
- Meta webhook signature verification
- Optional Cloudflare KV persistence
- Health endpoint for setup checks

## Repository structure

```text
src/
  index.js       Cloudflare Worker entry point + webhook routes
  bot.js         Skill Forge conversation logic
  config.js      Courses, services, prices and public links
  store.js       Cloudflare KV / in-memory state
  whatsapp.js    Meta WhatsApp Cloud API client

wrangler.jsonc   Cloudflare Worker configuration
package.json
```

## Deploy with Cloudflare

### 1. Connect GitHub

In Cloudflare:

1. Open **Workers & Pages**.
2. Create a Worker/application from an existing Git repository.
3. Connect GitHub and choose **Ajazprecious/SkillForge-Bot**.
4. Use the repository root.
5. Use `npm install` if Cloudflare asks for a build/install command.
6. Use `npx wrangler deploy` or `npm run deploy` as the deploy command if Cloudflare asks for one.

The Worker entry point is already configured in `wrangler.jsonc` as:

```text
src/index.js
```

### 2. Add the four Meta secrets

In the Worker dashboard, open **Settings → Variables and Secrets** and add these as **Secrets**:

```text
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_VERIFY_TOKEN
META_APP_SECRET
```

Do not place the real values in GitHub.

`WHATSAPP_VERIFY_TOKEN` is a private value you create yourself. The exact same value must later be entered in Meta when configuring the webhook.

### 3. Optional but recommended: add Cloudflare KV

The bot works without KV, but state may not persist reliably between Worker executions.

For persistent human handoff, opt-out status and duplicate-message protection:

1. In Cloudflare, create a **KV namespace** such as `skillforge-bot-state`.
2. Open the deployed Worker.
3. Go to **Settings → Bindings**.
4. Add a **KV Namespace** binding.
5. Set the variable/binding name exactly to:

```text
BOT_STATE
```

6. Select the KV namespace you created.

No KV namespace ID needs to be committed to GitHub when you bind it through the dashboard.

## Public configuration

These defaults are already in `wrangler.jsonc`:

- Skill Forge Academy website
- WhatsApp information group
- Business WhatsApp URL
- SIWES Connect portfolio URL
- Merry Gold portfolio URL
- Human handoff duration
- Meta Graph API version

You can change them later in `wrangler.jsonc` or in Cloudflare variables.

## Test the Worker

After deployment Cloudflare will give you a URL similar to:

```text
https://skillforge-whatsapp-bot.YOUR-SUBDOMAIN.workers.dev
```

Open:

```text
https://skillforge-whatsapp-bot.YOUR-SUBDOMAIN.workers.dev/health
```

You should get JSON showing whether the WhatsApp secrets and KV binding are configured.

## Connect the Meta webhook

In your Meta WhatsApp app, set the callback URL to:

```text
https://skillforge-whatsapp-bot.YOUR-SUBDOMAIN.workers.dev/webhook
```

For **Verify Token**, enter exactly the same value you saved in Cloudflare as:

```text
WHATSAPP_VERIFY_TOKEN
```

Then subscribe the WhatsApp webhook to the **messages** field.

## Test messages

After Meta webhook verification succeeds, send:

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

## Human handoff

When a customer chooses **Speak to a Person**, asks for a quote, or types words such as `human`, `agent`, or `customer care`, the bot pauses automated replies for the configured handoff period.

The customer can type:

```text
MENU
```

to reactivate the bot immediately.

## Local development

Install dependencies:

```bash
npm install
```

Copy:

```text
.dev.vars.example
```

to:

```text
.dev.vars
```

and add test Meta credentials.

Then run:

```bash
npm run dev
```

## Security

- Never commit Meta access tokens, App Secrets or verification secrets.
- The Worker verifies Meta's `X-Hub-Signature-256` when `META_APP_SECRET` is configured.
- Incoming WhatsApp message IDs are de-duplicated.
- Secrets are read only from Cloudflare Worker bindings/secrets.

## Endpoints

```text
GET  /
GET  /health
GET  /webhook
POST /webhook
```

## Editing Skill Forge information

Update `src/config.js` to change:

- course prices
- service prices
- services
- scholarship wording
- portfolio projects
- public links
