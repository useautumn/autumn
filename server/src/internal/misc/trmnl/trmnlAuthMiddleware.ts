import { AppEnv, ErrCode, RecaseError } from "@autumn/shared";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { OrgService } from "@/internal/orgs/OrgService";
import { CacheManager } from "@/utils/cacheUtils/CacheManager.js";

/**
 * TRMNL authentication middleware for Hono
 * Authenticates requests using the X-TRMNL-ID header (device ID)
 */
export const trmnlAuthMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const ctx = c.get("ctx");
	const { logger, db } = ctx;

	const deviceId = c.req.header("x-trmnl-id");

	logger.info(`received trmnl request, device id: ${deviceId}`);

	if (!deviceId) {
		throw new RecaseError({
			message: "Device ID not found",
			code: ErrCode.InvalidSecretKey,
			statusCode: 401,
		});
	}

	const trmnlConfig = await CacheManager.getJson<{
		orgId: string;
		hideRevenue: boolean;
	}>(`trmnl:device:${deviceId}`);

	if (!trmnlConfig) {
		throw new RecaseError({
			message: "Device ID invalid",
			code: ErrCode.InvalidSecretKey,
			statusCode: 401,
		});
	}

	logger.info(`trmnl config: ${JSON.stringify(trmnlConfig)}`);

	const env = (c.req.header("env") as AppEnv) || AppEnv.Live;
	const data = await OrgService.getWithFeatures({
		db,
		orgId: trmnlConfig.orgId,
		env,
	});

	// Update context with org, env, and features
	if (data) {
		ctx.org = {
			...data?.org,
			// @ts-expect-error - hideRevenue is used in analytics services
			hideRevenue: trmnlConfig.hideRevenue,
		};
		ctx.env = env;
		ctx.features = data?.features;
	}

	await next();
};
