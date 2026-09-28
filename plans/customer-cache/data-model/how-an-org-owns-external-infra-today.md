---
author: john + claude
feature: customer-cache
date: 2026-09-28
status: research-in-progress
---

# How an org owns external infra today

Three precedents, all columns on `organizations`. None crosses an AWS account boundary: there is
no `AssumeRole`, `STSClient` or credential provider anywhere in TypeScript; `getDynamoClient()`
always uses Autumn's own keys or task role (`external/aws/dynamodb/initDynamoDb.ts:9-17`).

## 1 · Dedicated org Redis: the closest sibling

scenario · org_x moves to its own Dragonfly · the row:

```
organizations.redis_config = {                        orgTable.ts:49-65,138
  connectionString: "<aes: iv+cipher>",               encryptData, encryptUtils.ts:13
  publicConnectionString?: "<aes>",                   used off-ECS (trigger, local)
  url: "org-x.dragonfly:6379",                        plain, change detection
  migrationPercent: 25, previousMigrationPercent: 0, migrationChangedAt: 1759000000000 }
```

```
request ─► orgRedisMiddleware ─► bucket = Bun.hash(customerId) % 100      customerRedisRoutingInfo.ts:18
                                 bucket < migrationPercent ?
                                   yes → getOrgRedis({ org })              orgRedisPool.ts:84
                                   no  → shared resolveRedisV2()
                                 ctx.redisV2 = chosen                      customerRedisRouting.ts:74
```

- `getOrgRedis` memoizes one client per org in a module map, rebuilds when `url` changes, decrypts
  on first use, falls back to the shared Redis if decryption fails (`orgRedisPool.ts:30,89-108`).
- Warmed at boot from `OrgService.listWithRedisConfig` (`init.ts:125`, `workers.ts:142`) and per
  trigger task (`createTriggerContext.ts:60`).
- Two route sets: admin (`handleAdminOrgRedisConfig.ts`, superuser, with a dialog in
  `views/admin/components/OrgRedisConfigDialog.tsx`) and org (`orgs/handlers/handleRedisConfig.ts`,
  no dashboard page calls it). Create refuses a second config; delete refuses while
  `migrationPercent > 0` (`handleRedisConfig.ts:35,159`). Every write calls `clearOrgCache`.
- Catch: the migration ramp is a copy of the FullSubject rollout machinery, keyed by customer
  bucket, so this precedent already carries "roll a customer over gradually".

## 2 · Integrations: connect once, store on the org row

| integration | column | flow |
|---|---|---|
| Stripe key / webhooks | `stripe_config` (encrypted keys, secrets) | paste key, `POST /organization/stripe` |
| Stripe Connect | `test_stripe_connect` / `live_stripe_connect` | OAuth: `/organization/stripe/oauth_url` → provider → `/stripe/oauth_callback` → `OrgService.update` → `clearOrgCache` → 302 `settings?tab=stripe&success=true` |
| RevenueCat, Vercel | `processor_configs` jsonb (`processorSchemas.ts:134`) | OAuth or paste key; Vercel `client_secret` is stored plaintext |
| SSO | `sso_provider` table | separate |

Dashboard: Settings → "Integrations" tabs `stripe | vercel | revenuecat`
(`views/settings/SettingsView.tsx:158-176`); `vercel` and `sso` tabs appear only when Autumn's own
customer record for the org has that flag (`hooks/common/useAutumnFlags.tsx:6-28`,
`FLAGGED_TABS` at `SettingsView.tsx:200-203`). That flag map is how a gated feature is turned on
per org today.

## 3 · Svix: one external resource per org, created on demand

```
ensureSvixAppId({ ctx })                          webhooks/actions/ensureSvixAppId.ts:14
  svix_config.<env>_app_id set? → return it
  createSvixApp({ name: `${slug}_${env}` })
  UPDATE organizations SET svix_config = svix_config || {key: id}
    WHERE svix_config->>key = ''                  compare-and-set, :37-48
  lost the race → delete ours, return the winner's
```

Stored as `svix_config: { sandbox_app_id, live_app_id }` (`orgTable.ts:18-21,118`), one per env.
Herald reads it straight off the record's `command.org.svix` (`recordToWebhookAppId.ts:14-20`);
it never opens the org row.

## Per-org config that is not a column

- `org.config` jsonb (`orgConfig.ts:35-89`): ~30 flags; the user-facing ones are `BILLING_TOGGLES`
  (`BillingSettingsSection.tsx:45-101`), written by `PATCH /organization/config` with a jsonb merge
  then `clearOrgCache` (`handleUpdateOrgConfig.ts:77-90`).
- Edge configs on S3, polled every 10s fleet-wide (`packages/edge-config`): the balance-worker
  rollout is `rollouts["balance-worker"].orgs[orgId].percent` (`rolloutSchemas.ts:10-24`), org only,
  no env. Herald already polls one (`createHeraldEdgeConfigs.ts`, misc Redis).
- Secrets: AES-256-CBC, key from `sha512(ENCRYPTION_PASSWORD)`, IV prepended, base64
  (`server/src/utils/encryptUtils.ts:13,28`); the package form `createAesCipher({ password })`
  (`packages/encryption/src/aesCipher.ts:7`) is what herald uses (`setup/getMiscCache.ts:35`).
