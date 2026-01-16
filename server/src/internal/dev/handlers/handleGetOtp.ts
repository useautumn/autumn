import { AppEnv, RecaseError } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { OrgService } from "@/internal/orgs/OrgService";
import { isStripeConnected } from "@/internal/orgs/orgUtils";
import { CacheManager } from "@/utils/cacheUtils/CacheManager";
import { createKey } from "../api-keys/apiKeyUtils";
import { generateRandomKey, OTP_TTL } from "../cliAuth/cliAuthUtils";

/**
 * GET /dev/otp/:otp
 * Validates OTP and returns API keys for CLI
 */
export const handleGetOtp = createRoute({
	handler: async (c) => {
		const { db, user } = c.get("ctx");
		const { otp } = c.req.param();

		const cacheKey = `otp:${otp}`;
		const cacheData = await CacheManager.getJson<{
			orgId: string;
			stripeFlowAuthKey: string;
		}>(cacheKey);

		if (!cacheData) {
			throw new RecaseError({
				message: "OTP not found",
				code: "otp_not_found",
				statusCode: 404,
			});
		}

		// Generate API key for the OTP
		const sandboxKey = await createKey({
			db,
			env: AppEnv.Sandbox,
			name: "Autumn Key CLI",
			orgId: cacheData.orgId,
			prefix: "am_sk_test",
			meta: {
				fromCli: true,
				generatedAt: new Date().toISOString(),
			},
			userId: user?.id,
		});

		const prodKey = await createKey({
			db,
			env: AppEnv.Live,
			name: "Autumn Key CLI",
			orgId: cacheData.orgId,
			prefix: "am_sk_live",
			meta: {
				fromCli: true,
				generatedAt: new Date().toISOString(),
			},
			userId: user?.id,
		});

		const org = await OrgService.get({
			db,
			orgId: cacheData.orgId,
		});

		const stripeConnected = isStripeConnected({ org, env: AppEnv.Sandbox });

		const responseData: {
			orgId: string;
			stripeFlowAuthKey?: string;
			stripe_connected: boolean;
			sandboxKey: string;
			prodKey: string;
		} = {
			...cacheData,
			stripe_connected: stripeConnected,
			sandboxKey,
			prodKey,
		};

		await CacheManager.invalidate({
			action: "otp",
			value: otp,
		});
		await CacheManager.invalidate({
			action: "orgOTPExists",
			value: cacheData.orgId,
		});

		if (!stripeConnected) {
			// Generate a key for the CLI to use for Stripe flow
			const key = generateRandomKey();
			responseData.stripeFlowAuthKey = key;
			const stripeCacheData = {
				orgId: cacheData.orgId,
			};
			await CacheManager.setJson(key, stripeCacheData, OTP_TTL);
		}

		return c.json(responseData);
	},
});
