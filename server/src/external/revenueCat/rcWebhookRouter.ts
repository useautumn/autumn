import type {
	Webhook,
	WebhookCancellation,
	WebhookExpiration,
	WebhookInitialPurchase,
	WebhookNonRenewingPurchase,
	WebhookRenewal,
} from "@puzzmo/revenue-cat-webhook-types";
import { AppEnv } from "@shared/models/genModels/genEnums";
import { type Context, Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv";
import { handleCancellation } from "./handlers/handleCancellation";
import { handleExpiration } from "./handlers/handleExpiration";
import { handleInitialPurchase } from "./handlers/handleInitialPurchase";
import { handleNonRenewingPurchase } from "./handlers/handleNonRenewingPurchase";
import { handleRenewal } from "./handlers/handleRenewal";
import {
	revcatLogMiddleware,
	revcatSeederMiddleware,
} from "./misc/revenueCatMiddleware";

export const rcWebhookRouter = new Hono<HonoEnv>();

rcWebhookRouter.post(
	"/:orgId/:env",
	revcatSeederMiddleware,
	revcatLogMiddleware,
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
		}

		return c.json({ success: true }, 200);
	},
);
