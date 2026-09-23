import { getAutumnEnv } from "@autumn/env";
import { AppEnv, type Organization, organizations } from "@autumn/shared";
import { and, eq, isNull, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { stripeConnectField } from "@/external/connect/stripeConnectField.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { encryptData } from "@/utils/encryptUtils.js";
import {
	MAIN_STRIPE_EVENT_TYPES,
	SYNC_STRIPE_EVENT_TYPES,
} from "../common/stripeConstants.js";

type Ctx = Pick<AutumnContext, "org" | "env" | "db" | "logger">;

const stripeConfigFields = (env: AppEnv) =>
	env === AppEnv.Live
		? ({
				keyField: "live_api_key",
				webhookField: "live_webhook_secret",
			} as const)
		: ({
				keyField: "test_api_key",
				webhookField: "test_webhook_secret",
			} as const);

const isPendingRevocation = ({
	org,
	env,
	accountId,
}: {
	org: Organization;
	env: AppEnv;
	accountId: string;
}) => {
	const connect = org[stripeConnectField(env)];
	return !connect?.account_id && connect?.revoked_account_id === accountId;
};

/** Clears the pending marker (and stores a new webhook secret) only if nothing changed meanwhile. */
const completeRevocation = async ({
	ctx,
	org,
	accountId,
	webhookSecret,
}: {
	ctx: Ctx;
	org: Organization;
	accountId: string;
	webhookSecret?: string;
}) => {
	const { db, env } = ctx;
	const connectField = stripeConnectField(env);
	const connect = organizations[connectField];
	const config = organizations.stripe_config;
	const { keyField, webhookField } = stripeConfigFields(env);

	const updated = await db
		.update(organizations)
		.set({
			[connectField]: sql`${connect} - 'revoked_account_id'`,
			...(webhookSecret && {
				stripe_config: sql`jsonb_set(coalesce(${config}, '{}'::jsonb), ARRAY[${webhookField}]::text[], to_jsonb(${encryptData(webhookSecret)}::text))`,
			}),
		})
		.where(
			and(
				eq(organizations.id, org.id),
				eq(sql`${connect}->>'revoked_account_id'`, accountId),
				isNull(sql`${connect}->>'account_id'`),
				sql`${config}->>${keyField} IS NOT DISTINCT FROM ${org.stripe_config?.[keyField] ?? null}`,
				sql`${config}->>${webhookField} IS NOT DISTINCT FROM ${org.stripe_config?.[webhookField] ?? null}`,
			),
		)
		.returning({ id: organizations.id });

	return updated.length > 0;
};

/**
 * After OAuth is revoked, a kept secret key stops receiving events through Autumn's
 * Connect endpoint, so give it a direct webhook before clearing the pending marker.
 */
export const restoreStripeWebhookAfterRevocation = async ({
	ctx,
	accountId,
}: {
	ctx: Ctx;
	accountId: string;
}) => {
	const { db, env, logger } = ctx;
	const org = await OrgService.get({ db, orgId: ctx.org.id });
	if (!isPendingRevocation({ org, env, accountId })) return;

	const { keyField, webhookField } = stripeConfigFields(env);
	const needsWebhook =
		Boolean(org.stripe_config?.[keyField]) &&
		!org.stripe_config?.[webhookField];

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
			if (!endpoint.secret) {
				throw new Error("Stripe webhook signing secret was not returned");
			}
		}

		persisted = await completeRevocation({
			ctx,
			org,
			accountId,
			webhookSecret: endpoint?.secret,
		});

		const stillPending =
			!persisted &&
			isPendingRevocation({
				org: await OrgService.get({ db, orgId: org.id }),
				env,
				accountId,
			});
		if (stillPending) {
			throw new Error("Stripe connection changed during webhook restoration");
		}
	} catch (error) {
		throw new Error(
			"Failed to restore direct Stripe webhook after OAuth revocation",
			{ cause: error },
		);
	} finally {
		// Never leave an endpoint behind whose secret we failed to store.
		if (endpoint && stripe && !persisted) {
			await stripe.webhookEndpoints.del(endpoint.id);
		}
	}

	await clearOrgCache({ db, orgId: org.id, env, logger });
};
