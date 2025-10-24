import {
	type AppEnv,
	AuthType,
	type Feature,
	type Organization,
} from "@autumn/shared";
import express, { type Router } from "express";
import type { Context } from "hono";
import type { Stripe } from "stripe";
import {
	getStripeWebhookSecret,
	initMasterStripe,
} from "@/external/connect/initStripeCli.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { handleWebhookErrorSkip } from "../../utils/routerUtils/webhookErrorSkip.js";
import { handleStripeWebhookEvent } from "../stripe/handleStripeWebhookEvent.js";

export const connectWebhookRouter: Router = express.Router();

export const handleConnectWebhook = async (c: Context<HonoEnv>) => {
	const ctx = c.get("ctx");
	const { db, logger } = ctx;
	const { env } = c.req.param() as { env: AppEnv };

	// Initial logging of event body...
	const body = await c.req.json();
	logger.info(`connect webhook received (${env})`, {
		body,
	});

	let masterStripe: Stripe;
	try {
		masterStripe = initMasterStripe();
	} catch (error) {
		logger.error(`Failed to initialize master stripe client ${error}`);
		return c.json(200);
	}
	let event: Stripe.Event;

	// Step 1: Get webhook secret
	const webhookSecret = await getStripeWebhookSecret({
		db,
		orgId: c.req.query("org_id"),
		env,
	});

	// Step 2: Verify webhook event
	try {
		const rawBody = await c.req.text();
		const signature = c.req.header("stripe-signature") || "";

		event = await masterStripe.webhooks.constructEventAsync(
			rawBody,
			signature,
			webhookSecret,
		);
	} catch (err: any) {
		logger.error(`Webhook verification error: ${err.message}`);
		return c.json({ error: err.message }, 400);
	}

	// Step 3: Get org and features
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

	ctx.org = org;
	ctx.features = features;
	ctx.env = env as AppEnv;
	ctx.logger = ctx.logger.child({
		context: {
			context: {
				event_type: event.type,
				event_id: event.id,
				// @ts-expect-error
				object_id: `${event.data?.object?.id}` || "N/A",
				authType: AuthType.Stripe,
				org_id: org.id,
				org_slug: org.slug,
				env,
			},
		},
	});

	try {
		await handleStripeWebhookEvent({
			event,
			db,
			org,
			env: env as AppEnv,
			logger,
			req: ctx as ExtendedRequest,
		});
		return c.json({ message: "Webhook received" }, 200);
	} catch (error) {
		const shouldSkip = handleWebhookErrorSkip({ error, logger });
		if (!shouldSkip) {
			logger.error(`Stripe webhook, error: ${error}`, { error });
		}
		return c.json({ message: "Webhook received, internal server error" }, 200);
	}
};
