import type {
	Webhook,
	WebhookCancellation,
	WebhookExpiration,
	WebhookInitialPurchase,
	WebhookNonRenewingPurchase,
	WebhookRenewal,
	WebhookUnCancellation,
} from "@puzzmo/revenue-cat-webhook-types";
import { AppEnv } from "@shared/models/genModels/genEnums";
import { type Context, Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv";
import {
	revenuecatLogMiddleware,
	revenuecatSeederMiddleware,
} from "./misc/revenueCatMiddleware";
import { handleCancellation } from "./webhookHandlers/handleCancellation";
import { handleExpiration } from "./webhookHandlers/handleExpiration";
import { handleInitialPurchase } from "./webhookHandlers/handleInitialPurchase";
import { handleNonRenewingPurchase } from "./webhookHandlers/handleNonRenewingPurchase";
import { handleRenewal } from "./webhookHandlers/handleRenewal";
import { handleUncancellation } from "./webhookHandlers/handleUncancellation";

export const revenuecatWebhookRouter = new Hono<HonoEnv>();

revenuecatWebhookRouter.post(
	"/:orgId/:env",
	revenuecatSeederMiddleware,
	revenuecatLogMiddleware,
	async (c: Context<HonoEnv>) => {
		const ctx = c.get("ctx");
		const { db, logger, org, features } = ctx;
		const { env } = c.req.param() as { orgId: string; env: AppEnv };
		const Authorization = c.req.header("Authorization");
		const body = (await c.req.json()) as Webhook;

		const orgSecretKey =
			env === AppEnv.Sandbox
				? org.processor_configs?.revenuecat?.sandbox_webhook_secret
				: org.processor_configs?.revenuecat?.webhook_secret;

		if (Authorization !== orgSecretKey) {
			logger.error("Invalid authorization for RevenueCat webhook", {
				Authorization,
				orgSecretKey,
			});
			return c.json({ error: "Unauthorized" }, 401);
		}

		switch (body.event.type) {
			case "INITIAL_PURCHASE":
				await handleInitialPurchase({
					event: body.event as WebhookInitialPurchase,
					db,
					org,
					env,
					logger,
					features,
				});
				break;
			case "NON_RENEWING_PURCHASE":
				await handleNonRenewingPurchase({
					event: body.event as WebhookNonRenewingPurchase,
					db,
					org,
					env,
					logger,
					features,
				});
				break;
			case "RENEWAL":
				await handleRenewal({
					event: body.event as WebhookRenewal,
					db,
					org,
					env,
					logger,
					features,
				});
				break;
			case "CANCELLATION":
				await handleCancellation({
					event: body.event as WebhookCancellation,
					db,
					org,
					env,
					logger,
					features,
				});
				break;
			case "EXPIRATION":
				await handleExpiration({
					event: body.event as WebhookExpiration,
					db,
					org,
					env,
					logger,
					features,
					ctx,
				});
				break;
			case "UNCANCELLATION":
				await handleUncancellation({
					event: body.event as WebhookUnCancellation,
					db,
					org,
					env,
				});
				break;
		}

		return c.json({ success: true }, 200);
	},
);
