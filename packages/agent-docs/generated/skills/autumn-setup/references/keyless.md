# Keyless orgs

A keyless org is a real sandbox org with no owner yet. One call creates it and hands back a secret key; pushing a catalog, creating customers, and billing all work normally. The user links their account later, and the key stays the same.

Check `atmn --help` first: if the CLI has a command for provisioning or linking, use it. The HTTP calls below are the fallback and are what such a command would do anyway. Base URL is `https://api.useautumn.com`, and none of these routes need auth except where noted.

## Provision

`POST /agent.provision`

Send `name` and `slug`, both derived from the project (repo name, or the `name` in package.json). The slug is lowercase letters and numbers, with `-` or `_` between words.

Back comes `organization_id`, `organization_slug`, `api_key`, `claim_token`, `claim_url`, and `claim_expires_at`.

- Write `api_key` into `.env` as `AUTUMN_SECRET_KEY`. It is a sandbox secret key — never print it or read it back into the chat.
- `claim_token` is a second way to link the org, for when you don't have the key. Claiming with the key is simpler, so normally you can ignore it. It is as secret as the key.
- `claim_url` opens the same linking flow in a browser. Useful only if the user would rather click than paste a code.
- `claim_expires_at` is the deadline for linking — a few days out. Read it from the response instead of assuming; after it passes, the org can't be linked to anyone.
- Provisioning is rate limited per machine. If it fails, tell the user and offer sign-in — never loop on it.

## Link the org to an account

Two calls with the user in between.

**Start it.** `POST /agent.claim` with an `Authorization: Bearer <AUTUMN_SECRET_KEY>` header and the user's `email` in the body. Autumn emails them a one-time code and returns `expires_at`, a few minutes out.

If you're using the claim token instead of the key, send `claim_token` in the body and no `Authorization` header. Send exactly one of the two — both, or neither, is refused.

**Finish it.** `POST /agent.verify` with `email` and the `otp` the user read out. It returns the organization and the user now attached to it. From here they can sign in at app.useautumn.com and see everything.

Notes that matter:

- Only a few tries per code, and it expires in minutes. A wrong code means ask again; a dead one means starting over from `/agent.claim`.
- The provisioned key keeps working after linking. Don't rotate it, don't provision a second org.
- Linking an org that's already linked, or past its deadline, fails on purpose. These errors are deliberately vague so they can't be probed — don't guess at what went wrong, just tell the user it didn't go through and what you'll try next.
