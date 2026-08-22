import {
	type AppEnv,
	AuthType,
	ErrCode,
	type Feature,
	type Organization,
} from "@autumn/shared";
import type { Context, Next } from "hono";
import type { Stripe } from "stripe";
import {
	getStripeWebhookSecret,
	initMasterStripe,
} from "@/external/connect/initStripeCli.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import RecaseError from "@/utils/errorUtils.js";
import { createStripeCli } from "../../connect/createStripeCli.js";
import type {
	StripeWebhookContext,
	StripeWebhookHonoEnv,
} from "./stripeWebhookContext.js";

/**
 * Seeder middleware for Stripe Connect webhooks
 * - Verifies webhook signature using master stripe
 * - Gets org from event.account (accountId)
 * - Sets up StripeWebhookContext (org, env, features, stripeEvent)
 */
export const stripeConnectSeederMiddleware = async (
	c: Context<StripeWebhookHonoEnv>,
	next: Next,
) => {
	const ctx = c.get("ctx") as StripeWebhookContext;
	const { db, logger } = ctx;
	const { env } = c.req.param() as { env: AppEnv };

	// Step 1: Initialize master stripe client
	let masterStripe: Stripe;
	try {
		masterStripe = initMasterStripe();
	} catch (error) {
		logger.error(`Failed to initialize master stripe client ${error}`);
		return c.json({ error: "Failed to initialize stripe client" }, 500);
	}

	// Step 2: Get webhook secret
	const webhookSecret = await getStripeWebhookSecret({
		db,
		orgId: c.req.query("org_id"),
		env,
	});

	// Step 3: Verify webhook signature
	const rawBody = await c.req.text();
	const signature = c.req.header("stripe-signature") || "";

	const skipVerify =
		process.env.STRIPE_WEBHOOK_SKIP_VERIFY === "true" &&
		process.env.NODE_ENV !== "production";

	let event: Stripe.Event;
	if (skipVerify) {
		// logger.warn(
		// 	"[Stripe] SKIPPING webhook signature verification — non-prod only",
		// );
		try {
			event = JSON.parse(rawBody) as Stripe.Event;
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			logger.warn(`Webhook body parse error (skip-verify): ${message}`);
			return c.json({ error: message }, 400);
		}
	} else {
		try {
			event = await masterStripe.webhooks.constructEventAsync(
				rawBody,
				signature,
				webhookSecret,
			);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			if (process.env.NODE_ENV !== "development") {
				logger.warn(`Webhook verification error: ${message}`);
			}
			return c.json({ error: message }, 400);
		}
	}
	// const event = (await c.req.json()) as Stripe.Event;

	// Step 4: Get org from account ID
	const accountId = event.account;
	if (!accountId) {
		logger.error(`Account ID not found in webhook event`);
		return c.json({ error: "Account ID not found" }, 200);
	}

	let org: Organization;
	let features: Feature[];
	try {
		const data = await OrgService.getByAccountId({
			db,
			accountId,
		});
		org = data.org;
		features = data.features;
	} catch (error) {
		// Only ack accounts genuinely not linked to an org; any other failure
		// (e.g. DB outage) must 500 so Stripe retries instead of dropping the event.
		const isOrgNotFound =
			error instanceof RecaseError && error.code === ErrCode.OrgNotFound;
		if (!isOrgNotFound) {
			logger.error(
				`Failed to resolve org for Stripe account ${accountId}, returning 500 for Stripe to retry: ${error}`,
			);
			return c.json({ error: "Failed to resolve org for Stripe webhook" }, 500);
		}

		if (process.env.NODE_ENV !== "development") {
			logger.error(
				`Account ID ${accountId} not linked to any org, skipping Stripe webhook`,
			);
		}
		return c.json(
			{ message: "Account ID not linked to any org, skipping Stripe webhook" },
			200,
		);
	}

	// Step 5: Set up context
	ctx.org = org;
	ctx.features = features;
	ctx.env = env;
	ctx.authType = AuthType.Stripe;
	ctx.stripeEvent = event;
	ctx.stripeCli = createStripeCli({ org, env });

	await next();
};
