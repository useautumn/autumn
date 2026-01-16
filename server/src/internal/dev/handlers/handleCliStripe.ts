import { AppEnv, RecaseError } from "@autumn/shared";
import { z } from "zod/v4";
import { redis } from "@/external/redis/initRedis";
import {
	checkKeyValid,
	createWebhookEndpoint,
} from "@/external/stripe/stripeOnboardingUtils";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { OrgService } from "@/internal/orgs/OrgService";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache";
import { CacheManager } from "@/utils/cacheUtils/CacheManager";
import { encryptData } from "@/utils/encryptUtils";

/**
 * POST /dev/cli/stripe
 * Connects Stripe keys from CLI authentication flow
 */
export const handleCliStripe = createRoute({
	body: z.object({
		stripeTestKey: z.string(),
		stripeLiveKey: z.string(),
	}),
	handler: async (c) => {
		const { db, logger } = c.get("ctx");
		const key = c.req.header("authorization");

		if (!key) {
			throw new RecaseError({
				message: "Unauthorized",
				code: "unauthorized",
				statusCode: 401,
			});
		}

		const cacheData = await CacheManager.getJson<{ orgId: string }>(key);
		if (!cacheData) {
			throw new RecaseError({
				message: "Key not found",
				code: "key_not_found",
				statusCode: 404,
			});
		}

		const { orgId } = cacheData;
		const { stripeTestKey, stripeLiveKey } = c.req.valid("json");

		await clearOrgCache({
			db,
			orgId,
			logger,
		});

		await checkKeyValid(stripeTestKey);
		await checkKeyValid(stripeLiveKey);

		const testWebhook = await createWebhookEndpoint(
			stripeTestKey,
			AppEnv.Sandbox,
			orgId,
		);

		const liveWebhook = await createWebhookEndpoint(
			stripeLiveKey,
			AppEnv.Live,
			orgId,
		);

		await OrgService.update({
			db,
			orgId: orgId,
			updates: {
				stripe_connected: true,
				default_currency: "usd",
				stripe_config: {
					test_api_key: encryptData(stripeTestKey),
					live_api_key: encryptData(stripeLiveKey),
					test_webhook_secret: encryptData(testWebhook.secret as string),
					live_webhook_secret: encryptData(liveWebhook.secret as string),
				},
			},
		});

		await redis.del(key);

		return c.json({ message: "Stripe keys updated" });
	},
});
