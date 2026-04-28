# Stripe Test OAuth Linking

Use this when local tests say the test org has no linked Stripe account, or when Stripe Connect webhooks are visible in Stripe but Autumn cannot map events back to `unit-test-org`.

The Connect webhook destination should be:

```txt
https://c.autumn.ngrok.app/webhooks/connect/sandbox
```

OAuth still needs the Autumn org row to store the connected account ID:

```json
{ "test_stripe_connect": { "account_id": "acct_..." } }
```

## Commands

List recent connected accounts for the test org email:

```sh
bun stripe:link-test -- --list --email=unit-test-org@test.com
```

Link an explicit account:

```sh
bun stripe:link-test -- --account-id=acct_...
```

Link the newest account matching the test org email:

```sh
bun stripe:link-test -- --latest --email=unit-test-org@test.com
```

If the org has a direct Stripe secret key, `createStripeCli` will prefer that over OAuth Connect. To force the OAuth account for sandbox tests:

```sh
bun stripe:link-test -- --account-id=acct_... --clear-secret-key
```

After linking, rerun a focused checkout test before the full suite:

```sh
ENV_FILE=.env infisical run --env=dev --recursive -- bun test --timeout 0 server/tests/integration/billing/attach/checkout/stripe-checkout/prepaid/stripe-checkout-prepaid-basic.test.ts
```
