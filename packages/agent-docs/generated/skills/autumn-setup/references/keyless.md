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
