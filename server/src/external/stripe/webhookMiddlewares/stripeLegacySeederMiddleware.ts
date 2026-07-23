import { type AppEnv, AuthType } from "@autumn/shared";
import type { Context, Next } from "hono";
import Stripe from "stripe";
import { OrgService } from "@/internal/orgs/OrgService.js";
import {
	getStripeWebhookSecret,
	isStripeConnected,
} from "@/internal/orgs/orgUtils.js";
import { createStripeCli } from "../../connect/createStripeCli.js";
import type {
	StripeWebhookContext,
	StripeWebhookHonoEnv,
} from "./stripeWebhookContext.js";

/**
 * Seeder middleware for legacy Stripe webhooks (orgs that pasted their secret keys)
 * - Gets org from URL params (orgId)
 * - Verifies webhook signature using org's webhook secret
 * - Sets up StripeWebhookContext (org, env, features, stripeEvent)
 */
export const stripeLegacySeederMiddleware = async (
	c: Context<StripeWebhookHonoEnv>,
	next: Next,
) => {
	const ctx = c.get("ctx") as StripeWebhookContext;
	const { db, logger } = ctx;
	const { orgId, env } = c.req.param() as { orgId: string; env: AppEnv };

	// Step 1: Get org and features
	let data: Awaited<ReturnType<typeof OrgService.getWithFeatures>>;
	try {
		data = await OrgService.getWithFeatures({
			db,
			orgId,
			env,
			allowNotFound: true,
		});
	} catch (error) {
		logger.error(`Failed to resolve org for Stripe webhook: ${error}`);
		return c.json({ error: "Failed to resolve org for Stripe webhook" }, 503);
	}

	if (!data) {
		return c.json({ message: `Org ${orgId} not found` }, 200);
	}

	const { org, features } = data;

	// Step 2: Check if org is connected to Stripe
	if (!isStripeConnected({ org, env })) {
		logger.info(`Org ${orgId} and env ${env} is not connected to stripe`);
		return c.json(
			{ message: `Org ${orgId} and env ${env} is not connected to stripe` },
			200,
		);
	}

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
			logger.warn(
				`Stripe legacy webhook body parse error (skip-verify): ${message}`,
			);
			return c.json({ error: `Webhook Error: ${message}` }, 400);
		}
	} else {
		try {
			const webhookSecret = getStripeWebhookSecret(org, env);
			event = await Stripe.webhooks.constructEventAsync(
				rawBody,
				signature,
				webhookSecret,
			);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			logger.warn(
				`Stripe legacy webhook signature verification failed: ${message}`,
			);
			return c.json({ error: `Webhook Error: ${message}` }, 400);
		}
	}

	// Step 4: Set up context
	ctx.org = org;
	ctx.features = features;
	ctx.env = env;
	ctx.authType = AuthType.Stripe;
	ctx.stripeEvent = event;
	ctx.stripeCli = createStripeCli({ org, env });

	await next();
};
