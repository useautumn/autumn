import { AppEnv, organizations } from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import { reRegisterDirectWebhook } from "@/internal/orgs/handlers/stripeHandlers/handleDeleteStripe.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { isStripeConnected } from "@/internal/orgs/orgUtils.js";
import type { StripeWebhookContext } from "../webhookMiddlewares/stripeWebhookContext.js";

export const handleStripeApplicationDeauthorized = async ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}) => {
	const { db, env, logger, stripeEvent } = ctx;
	const accountId = stripeEvent.account;
	if (!accountId) return;

	const org = await OrgService.get({ db, orgId: ctx.org.id });
	const connectField =
		env === AppEnv.Live ? "live_stripe_connect" : "test_stripe_connect";
	if (org[connectField]?.account_id !== accountId) return;

	const webhookField =
		env === AppEnv.Live ? "live_webhook_secret" : "test_webhook_secret";
	const hasSecretKey = isStripeConnected({ org, env, throughSecretKey: true });
	const needsDirectWebhook = hasSecretKey && !org.stripe_config?.[webhookField];
	let webhookSecret: string | null = null;
	if (needsDirectWebhook) {
		webhookSecret = await reRegisterDirectWebhook({ org, env, logger });
		if (!webhookSecret) {
			throw new Error("Failed to restore the secret-key Stripe webhook");
		}
	}

	await db
		.update(organizations)
		.set({
			[connectField]: sql`${organizations[connectField]} - 'account_id'`,
			...(webhookSecret
				? {
						stripe_config: sql`jsonb_set(coalesce(${organizations.stripe_config}, '{}'::jsonb), ARRAY[${webhookField}]::text[], to_jsonb(${webhookSecret}::text))`,
					}
				: {}),
		})
		.where(
			and(
				eq(organizations.id, org.id),
				eq(sql`${organizations[connectField]}->>'account_id'`, accountId),
			),
		);

	await clearOrgCache({ db, orgId: org.id, env, logger });
};
