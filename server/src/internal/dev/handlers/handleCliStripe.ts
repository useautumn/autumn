import { AppEnv, RecaseError, Scopes, type StripeConfig } from "@autumn/shared";
import { z } from "zod/v4";
import { orgToAccountId } from "@/external/connect/connectUtils";
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

export const buildCliStripeConfig = ({
	existing,
	testApiKey,
	liveApiKey,
	testWebhookSecret,
	liveWebhookSecret,
}: {
	existing: StripeConfig | null;
	testApiKey: string;
	liveApiKey: string;
	testWebhookSecret?: string;
	liveWebhookSecret?: string;
}): StripeConfig => ({
	...(existing || {}),
	test_api_key: testApiKey,
	live_api_key: liveApiKey,
	...(testWebhookSecret ? { test_webhook_secret: testWebhookSecret } : {}),
	...(liveWebhookSecret ? { live_webhook_secret: liveWebhookSecret } : {}),
});

/**
 * POST /dev/cli/stripe
 * Connects Stripe keys from CLI authentication flow
 */
export const handleCliStripe = createRoute({
	// Mounted on the public dev router (no auth middleware — the CLI hits
	// this during setup before it has any key). Authorisation comes from
	// the OTP token in the Authorization header, validated inside the
	// handler. Scope-check middleware cannot gate this route.
	scopes: [Scopes.Public],
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

		const org = await OrgService.get({ db, orgId });

		const testOauthConnected = Boolean(
			orgToAccountId({ org, env: AppEnv.Sandbox, noDefaultAccount: true }),
		);
		const liveOauthConnected = Boolean(
			orgToAccountId({ org, env: AppEnv.Live, noDefaultAccount: true }),
		);

		const testWebhook = testOauthConnected
			? null
			: await createWebhookEndpoint(stripeTestKey, AppEnv.Sandbox, orgId);
		const liveWebhook = liveOauthConnected
			? null
			: await createWebhookEndpoint(stripeLiveKey, AppEnv.Live, orgId);

		await OrgService.update({
			db,
			orgId: orgId,
			updates: {
				stripe_connected: true,
				default_currency: "usd",
				stripe_config: buildCliStripeConfig({
					existing: org.stripe_config,
					testApiKey: encryptData(stripeTestKey),
					liveApiKey: encryptData(stripeLiveKey),
					testWebhookSecret: testWebhook
						? encryptData(testWebhook.secret as string)
						: undefined,
					liveWebhookSecret: liveWebhook
						? encryptData(liveWebhook.secret as string)
						: undefined,
				}),
			},
		});

		await redis.del(key);

		return c.json({ message: "Stripe keys updated" });
	},
});
