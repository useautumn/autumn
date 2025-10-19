import { type AppEnv, AuthType } from "@autumn/shared";
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
import { handleStripeWebhookEvent } from "../stripe/handleStripeWebhookEvent.js";

export const connectWebhookRouter: Router = express.Router();

export const handleConnectWebhook = async (c: Context<HonoEnv>) => {
	const ctx = c.get("ctx");
	const { db, logger } = ctx;
	const { env } = c.req.param() as { env: AppEnv };

	const masterStripe = initMasterStripe();
	let event: Stripe.Event;
	const webhookSecret = await getStripeWebhookSecret({
		db,
		orgId: c.req.query("org_id"),
		env,
	});

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
		return c.json({ error: err.message }, 200);
	}

	const accountId = event.account;
	if (!accountId) {
		logger.error(`Account ID not found in webhook event`);
		return c.json({ error: "Account ID not found" }, 200);
	}

	const { org, features } = await OrgService.getByAccountId({
		db,
		accountId,
	});

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
		logger.error(`Stripe webhook, error: ${error}`, { error });
		return c.json({ message: "Webhook received, internal server error" }, 200); // 200 to avoid retries / shutdown of webhook...
	}
};
