import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CacheManager } from "@/utils/cacheUtils/CacheManager";
import { generateOtp, OTP_TTL } from "../cliAuth/cliAuthUtils";

/**
 * POST /dev/otp (from the dashboard)
 * Creates an OTP for CLI authentication
 */
export const handleCreateOtp = createRoute({
	handler: async (c) => {
		const { org } = c.get("ctx");

		// Check if there's already an OTP to use
		const maybeCacheKey = `orgOTPExists:${org.id}`;
		const maybeCacheData = await CacheManager.getJson(maybeCacheKey);
		if (maybeCacheData) {
			return c.json({ otp: maybeCacheData });
		}

		// Generate OTP
		const otp = generateOtp();

		const cacheData = {
			otp: otp,
			orgId: org.id,
		};

		const cacheKey = `otp:${otp}`;
		await CacheManager.setJson(cacheKey, cacheData, OTP_TTL);

		const orgCacheKey = `orgOTPExists:${org.id}`;
		await CacheManager.setJson(orgCacheKey, otp, OTP_TTL);

		console.log("OTP created", otp);

		return c.json({ otp });
	},
});
