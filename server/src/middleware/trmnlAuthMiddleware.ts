import { ExtendedResponse } from "@/utils/models/Request.js";
import { AppEnv, ErrCode } from "@autumn/shared";
import { readFile } from "@/external/supabase/storageUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { initUpstash } from "@/internal/customers/cusCache/upstashUtils.js";

export const trmnlExclusions = ["/trmnl/screen"];

export const trmnlAuthMiddleware = async (
	req: any,
	res: ExtendedResponse,
	next: any,
) => {
	const upstash = await initUpstash();

	if (!upstash) {
		res.status(500).json({
			message: "Upstash not found",
			code: ErrCode.InvalidSecretKey,
			statusCode: 401,
		});
		return;
	}

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

	const trmnlConfig = (await upstash!.get(`trmnl:device:${deviceId}`)) as {
		orgId: string;
		hideRevenue: boolean;
	};

	if (!trmnlConfig) {
		res.status(401).json({
			message: "Device ID invalid",
			code: ErrCode.InvalidSecretKey,
			statusCode: 401,
		});
		return;
	}

	req.logger.info(`trmnl config: ${JSON.stringify(trmnlConfig)}`);

	req.env = req.headers["env"] || AppEnv.Live;
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

	// const logger = req.logtail;

	// const file = await readFile({ bucket: "private", path: "trmnl.json" });
	// const fileString = await file.text();
	// const fileJson = JSON.parse(fileString);

	// let trmnlId = req.headers["x-trmnl-id"];
	// if (!trmnlId)
	//   return res.status(401).json({
	//     message: "Trmnl ID not found",
	//     code: ErrCode.InvalidSecretKey,
	//     statusCode: 401,
	//   });

	// if (!fileJson[trmnlId]) {
	//   return res.status(401).json({
	//     message: "Trmnl ID not found",
	//     code: ErrCode.InvalidSecretKey,
	//     statusCode: 401,
	//   });
	// }

	// req.env = req.headers["env"] || AppEnv.Live;
	// const features = await FeatureService.list({
	//   db: req.db,
	//   orgId: fileJson[trmnlId],
	//   env: req.env,
	// });

	// req.features = features;

	next();
};
