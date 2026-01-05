import {
	type AppEnv,
	AuthType,
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

	let event: Stripe.Event;
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
	} catch {
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
