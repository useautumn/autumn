import type {
	Webhook,
	WebhookCancellation,
	WebhookExpiration,
	WebhookInitialPurchase,
	WebhookNonRenewingPurchase,
	WebhookRenewal,
	WebhookUnCancellation,
} from "@puzzmo/revenue-cat-webhook-types";
import { type Context, Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv";
import { getRevenuecatWebhookSecret } from "./misc/getRevenuecatWebhookSecret";
import {
	revenuecatLogMiddleware,
	revenuecatSeederMiddleware,
} from "./misc/revenueCatMiddleware";
import { handleRenewal } from "./webhookHandlers/handleRevenucatRenewal";
import { handleCancellation } from "./webhookHandlers/handleRevenuecatCancellation";
import { handleExpiration } from "./webhookHandlers/handleRevenuecatExpiration";
import { handleInitialPurchase } from "./webhookHandlers/handleRevenuecatInitialPurchase";
import { handleNonRenewingPurchase } from "./webhookHandlers/handleRevenuecatNonRenewingPurchase";
import { handleUncancellation } from "./webhookHandlers/handleRevenuecatUncancellation";

export const revenuecatWebhookRouter = new Hono<HonoEnv>();

revenuecatWebhookRouter.post(
	"/:orgId/:env",
	revenuecatSeederMiddleware,
	revenuecatLogMiddleware,
	async (c: Context<HonoEnv>) => {
		const ctx = c.get("ctx");
		const { logger, org, env } = ctx;
		const Authorization = c.req.header("Authorization");
		const body = (await c.req.json()) as Webhook;

		try {
			const webhookSecret = getRevenuecatWebhookSecret({ org, env });

			if (Authorization !== webhookSecret) {
				logger.error("Invalid authorization for RevenueCat webhook", {
					Authorization,
					webhookSecret,
				});
				return c.json({ error: "Unauthorized" }, 401);
			}

			switch (body.event.type) {
				case "INITIAL_PURCHASE":
					await handleInitialPurchase({
						event: body.event as WebhookInitialPurchase,
						ctx,
					});
					break;
				case "NON_RENEWING_PURCHASE":
					await handleNonRenewingPurchase({
						event: body.event as WebhookNonRenewingPurchase,
						ctx,
					});
					break;
				case "RENEWAL":
					await handleRenewal({
						event: body.event as WebhookRenewal,
						ctx,
					});
					break;
				case "CANCELLATION":
					await handleCancellation({
						event: body.event as WebhookCancellation,
						ctx,
					});
					break;
				case "EXPIRATION":
					await handleExpiration({
						event: body.event as WebhookExpiration,
						ctx,
					});
					break;
				case "UNCANCELLATION":
					await handleUncancellation({
						event: body.event as WebhookUnCancellation,
						ctx,
					});
					break;
			}

			return c.json({ success: true }, 200);
		} catch (error) {
			logger.error(`error handling revenuecat webhook ${error}`);
			return c.json({ error: "Internal server error" }, 200); // don't retry webhooks.
		}
	},
);
