import { getAutumnEnv } from "@autumn/env";
import { AppEnv, organizations } from "@autumn/shared";
import { and, eq, isNull, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { encryptData } from "@/utils/encryptUtils.js";
import {
	MAIN_STRIPE_EVENT_TYPES,
	SYNC_STRIPE_EVENT_TYPES,
} from "../common/stripeConstants.js";

export const restoreStripeWebhookAfterRevocation = async ({
	ctx,
	accountId,
}: {
	ctx: Pick<AutumnContext, "org" | "env" | "db" | "logger">;
	accountId: string;
}) => {
	const { db, env, logger } = ctx;
	const org = await OrgService.get({ db, orgId: ctx.org.id });
	const connectField =
		env === AppEnv.Live ? "live_stripe_connect" : "test_stripe_connect";
	const keyField = env === AppEnv.Live ? "live_api_key" : "test_api_key";
	const webhookField =
		env === AppEnv.Live ? "live_webhook_secret" : "test_webhook_secret";
	const connect = org[connectField];
	if (connect?.account_id || connect?.revoked_account_id !== accountId) return;
	const encryptedKey = org.stripe_config?.[keyField];
	const needsWebhook = encryptedKey && !org.stripe_config?.[webhookField];
	let stripe: Stripe | undefined;
	let endpoint: Stripe.WebhookEndpoint | undefined;
	let persisted = false;
	try {
		if (needsWebhook) {
			stripe = createStripeCli({ org, env, throughSecretKey: true });
			endpoint = await stripe.webhookEndpoints.create({
				url: `${getAutumnEnv().AUTUMN_PUBLIC_API_URL}/webhooks/stripe/${org.id}/${env}`,
				enabled_events: [
					...MAIN_STRIPE_EVENT_TYPES,
					...SYNC_STRIPE_EVENT_TYPES,
				],
			});
			if (!endpoint.secret)
				throw new Error("Stripe webhook signing secret was not returned");
		}
		const updated = await db
			.update(organizations)
			.set({
				[connectField]: sql`${organizations[connectField]} - 'revoked_account_id'`,
				...(endpoint?.secret
					? {
							stripe_config: sql`jsonb_set(coalesce(${organizations.stripe_config}, '{}'::jsonb), ARRAY[${webhookField}]::text[], to_jsonb(${encryptData(endpoint.secret)}::text))`,
						}
					: {}),
			})
			.where(
				and(
					eq(organizations.id, org.id),
					eq(
						sql`${organizations[connectField]}->>'revoked_account_id'`,
						accountId,
					),
					isNull(sql`${organizations[connectField]}->>'account_id'`),
					sql`${organizations.stripe_config}->>${keyField} IS NOT DISTINCT FROM ${encryptedKey ?? null}`,
					sql`${organizations.stripe_config}->>${webhookField} IS NOT DISTINCT FROM ${org.stripe_config?.[webhookField] ?? null}`,
				),
			)
			.returning({ id: organizations.id });
		persisted = updated.length > 0;
		if (!persisted)
			throw new Error("Stripe connection changed during webhook restoration");
	} catch (error) {
		throw new Error(
			"Failed to restore direct Stripe webhook after OAuth revocation",
			{ cause: error },
		);
	} finally {
		if (endpoint && stripe && !persisted)
			await stripe.webhookEndpoints.del(endpoint.id);
	}
	await clearOrgCache({ db, orgId: org.id, env, logger });
};
