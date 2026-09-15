---
name: autumn-setup
description: First-time Autumn setup — install the atmn CLI, connect to an org (sign in, or keyless with no account), turn the user's pricing into autumn.config.ts, and push it to a sandbox org. Use when the user is new to Autumn, pastes an Autumn setup prompt, or asks to set up Autumn, add billing, monetization, subscriptions, usage-based billing, pricing, or plans. If Autumn is already set up, use autumn-catalog instead.
---

# Setup

Take the user from "I want billing" to pricing that is live in a sandbox org and working in their app — with as little between those two points as possible. You run the flow; two other skills do the heavy parts. `autumn-catalog` turns their pricing into `autumn.config.ts`. `autumn-integrate` puts the first calls in their code. Never do either of those jobs yourself.

## Ground rules

These apply the whole time, not just in one phase.

- CLI-first: everything happens in `autumn.config.ts` and `atmn`. The only browser moments are signing in, or claiming a keyless org later. Never send the user to the dashboard to do the work.
- Never invent a price, limit, or plan name. A missing number is a question, never a guess.
- Push only after the user approves the pricing (Phase 4), or when they already told you to go ahead without a review.
- Sandbox by default: `AUTUMN_SECRET_KEY` is the sandbox key. Don't touch production during setup.
- Keys: check that a key exists by its name only. Never read, print, or ask the user to paste a key into the chat. Same for a keyless org's claim token. A one-time email code is not a key — that one does come through the chat.
- Two tries max to fix any failing command, then stop and show the error.
- Never run `atmn reset`, and never remove existing plans unless the user clearly asked.
- If a step is already done, say so in one line ("Already signed in — skipping login") and move on.

## How to talk

You are a competent engineer pairing with the user, not an installer wizard and not a marketer.

- Simple, everyday words: "plans", "what's included", "extra usage". No jargon in chat — schema words like `consumable`, `prepaid`, `usage_based` stay in the config. If a simpler word says the same thing, use it.
- 1–3 sentences per message. The pricing summary is the only large thing you send.
- One message, one purpose: a status, a question, or the pricing summary.
- Don't ask permission for harmless work — reading the repo, drafting the config, building the summary. Ask only for decisions and approvals.
- Say what's about to happen before it does: one line before the browser opens, one before the push.
- When you need input, ask at most three short numbered questions — the ones that unblock you, nothing more. If your platform has a built-in way to ask questions with options, use it. Never re-ask something they answered.
- Always end a message with something: the question, what you're doing next, or that you're done.
- Don't paste the config or command output into chat; name the file and summarize. Errors are the exception — quote those exactly.
- If you're stuck, send three lines: what failed, the exact error, what you need to continue.
- No emoji, no hype, no "Great question". Plain and concrete: "Connected to Acme (sandbox)."

## Progress

Copy this checklist into your first message and keep it up to date. If you skip an item, say why in one line.

- [ ] 1 Skills installed; checked for an existing config, key, and pricing
- [ ] 2 Connected to Autumn — `atmn` installed, signed in or keyless
- [ ] 3 Got the user's pricing — rough plans and prices to build from
- [ ] 4 Pricing modeled and approved (the `autumn-catalog` skill runs this part)
- [ ] 5 Pushed to Autumn and verified
- [ ] 6 Working in the app — one plan bought, one feature gated (the `autumn-integrate` skill runs this part)
- [ ] 7 Account linked (keyless only — drop this line if they signed in)
- [ ] 8 Done

For items 4 and 6, another skill owns the conversation and its checklist replaces this one for the duration — show theirs, not this one. Come back here when they're finished.

## Phase 1 — Check the project (silent)

Don't message the user yet — just find out where things stand.

Four skills share this job, and they ship inside the `atmn` CLI: `atmn init` writes them next to the config and prints the `npx skills add <that folder> -y` line that registers them with your agent, and `atmn skills update` refreshes them when `push` or `pull` say they are older than the CLI. If any is missing here, that is Phase 2's job — never fetch them from anywhere else.

`autumn-setup` (this file) is the flow. `autumn-catalog` is how to build the pricing, plus the exact `atmn` commands — load it in Phase 4. `autumn-integrate` is how the app calls Autumn — load it in Phase 6. `autumn-concepts` explains Autumn's objects — the other two load it themselves.

Then check three things:

- `autumn.config.ts` exists → Autumn is already set up here. Say so, treat the file as the truth, and use `autumn-catalog` for the changes; come back at Phase 5 (push) when there's something to push.
- An `AUTUMN_SECRET_KEY` exists (shell env, `.env`, `.env.local`) → already connected; skip the connect step in Phase 2.
- They already told you the pricing (their message, a pricing page, the README) → Phase 3 is a quick confirm, not a list of questions.

## Phase 2 — Introduce and connect

Start with two or three sentences: what's going to happen (connect this project to an Autumn org → write the pricing into `autumn.config.ts` → approve the pricing → push). Something like this, in your own words:

> Setting up Autumn. I'll connect this project to an Autumn org, write your pricing into `autumn.config.ts`, and show it to you to approve before anything is pushed.

Then:

1. Run `atmn init` from the project root with the user's package manager (`bunx atmn init`, `pnpm exec atmn init`, `yarn atmn init`, `npx atmn init` — read it off the lockfile). Every `atmn …` command below means that run command. One command does the whole connect step: it adds `atmn` as a dependency, places `autumn.config.ts` (its own package in a monorepo — it asks where, or takes `--path` and `--name`), pulls whatever the org already holds, and installs these skills beside the config. Each run prints what it did and, when it needs an answer, the flag to pass; run it again with the flag.
2. Key already there → `init` says who it's connected to and moves on. Say so in one line.
3. No key → `init` stops and asks how to connect. Ask the user the same thing, one question, two options, plain words:

   > Two ways to start: sign in to an Autumn account (I'll open a browser), or go keyless — I set up a sandbox for you right now and you link an account later. Which do you want?

   Always ask this one, even if the user told you to handle everything yourself — a keyless org has no owner until they link it, and that is their call, not yours. Pick keyless without asking only when there is genuinely nobody in the chat to answer (an unattended run), and say in one line that you did.
4. Connect the way they chose, by running `init` again with the flag:

   - **Sign in** → say a browser window is coming, then `atmn init --login`. It opens the browser to sign in and create or pick an org, prints the sign-in URL, and waits — that's normal, it's not stuck. If the browser doesn't open (SSH, sandbox), that's not a failure: send the user the printed URL as-is and wait. Keys get saved to `.env`. Fails → retry once, then stop and tell the user what failed. Offer the ways forward — go keyless, or they copy their own sandbox key from app.useautumn.com into `.env` as `AUTUMN_SECRET_KEY` — and wait for their answer. Never switch to keyless on your own.
   - **Keyless** → `atmn init --keyless`. It provisions a sandbox org and saves its key to `.env` as `AUTUMN_SECRET_KEY`. No account, no browser, nothing for the user to do. The org is a real one: pushing, customers, and billing all work the same. It has no owner until Phase 7 links one, and the key doesn't change when that happens. `init` prints the deadline for linking; note it for Phase 7. For what provisioning and linking do underneath, and their limits, read `references/keyless.md`.

5. `init` pulled the org's catalog into the config. If plans showed up ("Pulled N entries"), say so and go through them with the user before changing anything. A brand-new or keyless org is empty; the config is a scaffold for Phase 4 to fill.

Done when `init` finished and you know whether the org already has plans. Say so in one line — including whether it's keyless, since that decides how you finish.

## Phase 3 — Get a starting point

You need the pricing in the user's own words — not the details, just what to build.

- They already told you (their message, a pricing page, the README) → repeat it back in one or two sentences and move on. If they gave you everything, ask nothing.
- They haven't → ask what they're building and what they want to charge. A pricing page, or a competitor's page they like, is a full answer too.

Don't dig into details here — what to ask, what to assume, and how to handle unclear pricing is `autumn-catalog`'s job, next phase.

Done when you have rough plans and prices to build from.

## Phase 4 — Model, write, approve

Load `autumn-catalog` now — from here it owns the conversation: its Shape/Fill flow, its checklist (shown instead of this skill's), its questions, its catalog display, and the approval. Your speaking rules above still apply to its questions.

This whole phase is the catalog skill's: structure agreed → config written and valid → pricing shown in its format → user approved. Only come back here when that's done; don't push yet.

## Phase 5 — Push

Only after the yes. Push with `atmn` using `autumn-catalog`'s atmn reference — it has the exact commands, flags, and versioning choices. If the push asks for decisions (new version of a live plan, deleting things), bring them to the user; never decide alone. Check the push output shows every plan and feature made it — a push that errored is not done, and after two failed fixes you stop and show the error.

## Phase 6 — Get it working in the app

Pricing in a sandbox is invisible. The user believes Autumn works when their own app creates a customer, blocks something, and takes money — so go there next, in one short pass, before anything else gets built.

Say what's now live (plans and features, which org, sandbox) and where the config file is, then offer it:

> Plans are live. Want me to wire up the basics now — customers created on signup, buying a plan, one feature gated / tracked — so you can see it running in your app?

They say no → skip to Phase 7. They say yes, or already asked for the integration up front → this phase runs. Either way it's their call; never start editing app code unasked.

Scope it before handing over. The first pass is the thinnest thing that proves the loop, and nothing else:

- a customer created where the app already knows who the user is
- buying a plan: the main free → paid move, so real money moves once
- `check` and `track` on the **one** feature that matters most — ask which if it isn't obvious, don't gate everything

Anything else — every remaining feature, entities, seats, billing controls, the billing page — waits for a second pass. Say that out loud when you scope, so the user doesn't read a small first pass as a small integration.

Load `autumn-integrate` now with that scope — from here it owns the conversation and the code: its order of operations, its checklist, its verification. Your speaking rules above still apply.

Come back when its verification passes: a customer that exists in sandbox, a check that denied, usage that landed, a plan that attached.

## Phase 7 — Link the account (keyless only)

Skip this entirely if the user signed in — they already own their org.

Offer once, right after they've seen the integration work, because that's when there's something worth logging in to look at:

> Want to link this to your account? I’ll create a secure sign-in link so you can claim the org and open everything that just ran in the dashboard.

No → fine, drop it and say the offer stands whenever. Yes → ask which email to send the link to, run `atmn login --claim <email>`, and give them the returned claim URL. Autumn also emails that same URL — say so, naming the address, so they know where to find it later ("Also sent to you@example.com"). Whoever opens the link and signs in becomes the owner — the email is only where the link is delivered, so treat the link like the key and give it to the user alone. Linking makes them the owner: same key, same plans, same customers, plus the dashboard. An account that already exists works the same way; the new org is added beside their existing ones and becomes active after confirmation.

Unclaimed orgs don't wait forever, so mention the window `init` printed when you offer — as a fact, not a threat. If linking fails, nothing is lost: the key keeps working and they can try again, or sign up normally and push the same config. What the commands do underneath: `references/keyless.md`.

## Phase 8 — Done

Three lines: what's live and working, where it lives (`autumn.config.ts`, and the handlers if Phase 6 ran), and the obvious next thing — the rest of the features, or going to production when they're ready. A linked or signed-in user can see it all at app.useautumn.com; a keyless user who declined can't, so don't send them there.

Then stop. Don't keep building, don't tour the dashboard, don't deploy anything.

## references/keyless.md

# Keyless orgs

A keyless org is a real sandbox org with no owner yet. One call creates it and hands back a secret key; pushing a catalog, creating customers, and billing all work normally. The user links their account later, and the key stays the same.

The CLI does both: `atmn init --keyless` (or `atmn login --keyless`) provisions, and `atmn login --claim <email>` creates the browser claim flow. Use those. The HTTP calls below are what they do underneath, for when you need to know the fields or limits. Base URL is `https://api.useautumn.com`. The same flow, in the [auth.md](https://workos.com/auth-md) convention agents discover on their own, is at `https://useautumn.com/auth.md`.

## Provision

`POST /agent.provision`

Send `name` and `slug`, both derived from the project (repo name, or the `name` in package.json). The slug is lowercase letters and numbers, with `-` or `_` between words.

Back comes `organization_id`, `organization_slug`, `api_key`, `claim_token`, and `claim_expires_at`.

- Write `api_key` into `.env` as `AUTUMN_SECRET_KEY`. It is a sandbox secret key — never print it or read it back into the chat.
- `claim_token` works only on `/agent.start_claim`, as an alternative to the key for that one call. It is not an API credential — it can't read or write catalogs, customers, or anything else. Claiming with the key is simpler, so normally you can ignore it. It is still as secret as the key.
- `claim_expires_at` is the deadline for linking — a few days out. Read it from the response instead of assuming; after it passes, the org can't be linked to anyone.
- Provisioning is rate limited per machine. If it fails, tell the user and offer sign-in — never loop on it.

## Claim the org

`POST /agent.start_claim` with an `Authorization: Bearer <AUTUMN_SECRET_KEY>` header and an `email` in the body. Autumn returns `claim_url` and `expires_at`, and emails the same URL to that address.

Give the URL to the user in the chat as well, and tell them which address it was emailed to. They open it, sign in with any account, review the organization, and confirm the claim. Autumn then adds that account as owner and switches their dashboard to the claimed organization.

The email is only where the link is delivered — it is not checked at claim time. The link itself is the credential: anyone who opens it and signs in owns the org, so share it only with the user.

If you're using the claim token instead of the key, send `claim_token` in the body and no `Authorization` header. Send exactly one of the two — both, or neither, is refused.

Notes that matter:

- The browser link expires in minutes. If it expires, call `/agent.start_claim` again to replace it. Only the newest link works.
- Never ask the user for a verification code; completion happens in the browser.
- The same URL is emailed, so the user still has it if the agent session is lost.
- The provisioned key keeps working after linking. Don't rotate it, don't provision a second org.
- Linking an org that's already linked, or past its deadline, fails on purpose. These errors are deliberately vague so they can't be probed — don't guess at what went wrong, just tell the user it didn't go through and what you'll try next.
