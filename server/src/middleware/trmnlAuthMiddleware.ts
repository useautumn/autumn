import { AppEnv, ErrCode } from "@autumn/shared";
import { FeatureService } from "@/internal/features/FeatureService.js";
import type { ExtendedResponse } from "@/utils/models/Request.js";
import { CacheManager } from "../utils/cacheUtils/CacheManager";

export const trmnlExclusions = ["/trmnl/screen"];

export const trmnlAuthMiddleware = async (
	req: any,
	res: ExtendedResponse,
	next: any,
) => {
	req.logger.info(
		`received trmnl request, device id: ${req.headers["x-trmnl-id"]}`,
	);

	const deviceId = req.headers["x-trmnl-id"];
	if (!deviceId) {
		res.status(401).json({
			message: "Device ID not found",
			code: ErrCode.InvalidSecretKey,
			statusCode: 401,
		});
		return;
	}

	const trmnlConfig = await CacheManager.getJson<{
		orgId: string;
		hideRevenue: boolean;
	}>(`trmnl:device:${deviceId}`);

	if (!trmnlConfig) {
		res.status(401).json({
			message: "Device ID invalid",
			code: ErrCode.InvalidSecretKey,
			statusCode: 401,
		});
		return;
	}

	req.logger.info(`trmnl config: ${JSON.stringify(trmnlConfig)}`);

	req.env = req.headers.env || AppEnv.Live;
	const features = await FeatureService.list({
		db: req.db,
		orgId: trmnlConfig.orgId as string,
		env: req.env,
	});

	req.org = {
		id: trmnlConfig.orgId,
		env: req.env,
		hideRevenue: trmnlConfig.hideRevenue,
	};
	req.features = features;

	next();
};
