# Autumn auth.md

You are an agent. Autumn supports **agentic registration** in the user-claimed shape: provision an org with no human signed in, use it immediately, and let a human claim it later. This file is `https://useautumn.com/auth.md`.

Autumn does not support ID-JAG identity assertions, verified-email registration, or an `/oauth2/token` exchange today. The credential you get is a sandbox secret key, used as a bearer token directly.

If a human is present and can open a browser, do not use this flow. Run `atmn init --login` instead, or read `https://useautumn.com/SKILL.md` — that skill owns the full setup (connect, pricing, push, integrate) and will ask the user which way to connect. This file covers only the unattended path underneath.

Base URL is `https://api.useautumn.com`.

## Step 1 — Provision

```http
POST https://api.useautumn.com/agent.provision
Content-Type: application/json

{"name":"<project name>","slug":"<project-slug>"}
```

`name` and `slug` come from the project (the `name` in `package.json`, or the folder). `slug` is lowercase letters and numbers, `-` or `_` between words, ≤ 100 chars. A colliding slug gets a random suffix on the server; read `organization_slug` back rather than assuming.

Response:

```json
{
  "organization_id": "org_…",
  "organization_slug": "acme",
  "api_key": "am_sk_test_…",
  "claim_token": "<opaque>",
  "claim_expires_at": "<iso8601>"
}
```

Keep:

- `api_key` — the durable secret. Write it to `.env` as `AUTUMN_SECRET_KEY`. Never print it or paste it into chat. It is a sandbox key with catalog, customer, balance, and billing scopes; production is unavailable until a human claims the org.
- `claim_token` — a second credential that can start a claim without the key. As secret as the key. You normally don't need it.
- `claim_expires_at` — the deadline for a human to claim (72 hours today). After it passes the org can't be claimed by anyone. Read it from the response instead of assuming.

Provisioning is rate limited (5/hour per client, 100/hour globally). If it fails, tell the user and offer sign-in — never loop on it.

## Step 2 — Use the credential

```http
POST https://api.useautumn.com/v1/…
Authorization: Bearer <api_key>
```

Everything a signed-up sandbox org can do works now: push a catalog, create customers, attach plans, track usage.

From here, read `https://useautumn.com/SKILL.md` and follow it from Phase 3. It turns the user's pricing into `autumn.config.ts`, pushes it, and wires the first calls into their app. The `atmn` CLI and the skills it installs read `AUTUMN_SECRET_KEY` and need nothing else — you're already past its connect step. Full API reference: `https://docs.useautumn.com`.

Do not provision a second org for the same project. Do not rotate the key — it survives the claim unchanged.

## Step 3 — Claim

Do not mint a claim link until the human is ready to keep the org. Ask which email should receive it.

```http
POST https://api.useautumn.com/agent.start_claim
Authorization: Bearer <api_key>
Content-Type: application/json

{"email":"you@example.com"}
```

Or, without the key, send `{"claim_token":"<claim_token>","email":"…"}` and no `Authorization` header. Send exactly one of the two — both, or neither, is refused.

Response:

```json
{"claim_url":"https://app.useautumn.com/claim?token=<opaque>","expires_at":"<iso8601>"}
```

Autumn emails the same `claim_url` to the address you sent. Give the URL to the user in chat as well, and tell them which address it went to.

The human opens the link, signs in with any Autumn account (or creates one), reviews the organization, and confirms. Whoever confirms becomes the owner — the email is only where the link is delivered, it is not checked at claim time. Treat `claim_url` like the key: share it with the user only.

Notes:

- `claim_url` dies in `expires_at` (10 minutes today). POST `/agent.start_claim` again to replace it; each new link supersedes the last.
- There is no code for the user to read back to you. Never ask for one. Completion happens in the browser.
- There is no polling endpoint. The user tells you they've claimed; the key keeps working either way.
- A claimed org, or one past `claim_expires_at`, fails deliberately with a vague error. Don't probe — tell the user it didn't go through and what you'll try next.

After the claim, the human owns the org: same key, same catalog, same customers, plus the dashboard at `https://app.useautumn.com`. You are done.

## Errors

Every failure is `4xx` with a JSON body:

```json
{"message":"…","code":"…"}
```

| Code | HTTP | Retry | What to do |
| --- | --- | --- | --- |
| `invalid_request` | 400 | No | Body failed validation, or a claim couldn't start. Fix the body; if the org is already claimed or expired, stop. |
| `no_auth_header` | 401 | No | Claim page endpoints need a browser session, not a key. You reached one by mistake — use `/agent.start_claim`. |
| rate limited | 429 | Later | Wait for the window, then retry once. Don't loop. |

A `429` body is deliberately generic (`"Request could not be completed"`); the status is the signal.

If a previously-working `api_key` starts returning `401`, drop it and tell the user. Do not provision again silently.
