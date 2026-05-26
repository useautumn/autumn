import type Stripe from "stripe";
import { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { WEBHOOK_EVENTS } from "@/utils/constants.js";
import { encryptData } from "@/utils/encryptUtils.js";
import { initMasterStripe } from "./initStripeCli.js";

export async function registerMasterConnectWebhook({
  db,
  orgId,
  env,
  webhookBaseUrl,
}: {
  db: DrizzleCli;
  orgId: string;
  env: AppEnv;
  webhookBaseUrl: string;
}): Promise<{ webhookId: string; secret: string; reused: boolean }> {
  const stripe = initMasterStripe({ env });
  const url = `${webhookBaseUrl.replace(/\/$/, "")}/webhooks/connect/${env}?org_id=${orgId}`;

  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  const match = existing.data.find((w) => w.url === url);

  const org = await OrgService.get({ db, orgId });
  const prefix = env === AppEnv.Sandbox ? "test" : "live";
  const existingSecret = org.stripe_config?.[`${prefix}_connect_webhook_secret` as const];

  // Stripe doesn't return signing secrets on retrieve(); only on create().
  if (match && existingSecret) {
    return { webhookId: match.id, secret: existingSecret, reused: true };
  }
  if (match) await stripe.webhookEndpoints.del(match.id);

  const webhook = await stripe.webhookEndpoints.create({
    url,
    enabled_events: WEBHOOK_EVENTS as Stripe.WebhookEndpointCreateParams.EnabledEvent[],
    connect: true,
  });

  await OrgService.updateConnectWebhookSecret({
    db,
    orgId,
    env,
    secret: encryptData(webhook.secret!),
  });

  return { webhookId: webhook.id, secret: webhook.secret!, reused: false };
}
