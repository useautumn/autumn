import {
	ApiVersion,
	ApiVersionClass,
	createdAtToVersion,
	ErrCode,
	parseVersion,
	RecaseError,
} from "@autumn/shared";
import type { NextFunction } from "express";
import type {
	ExtendedRequest,
	ExtendedResponse,
} from "@/utils/models/Request.js";

export const expressApiVersionMiddleware = (
	req: ExtendedRequest,
	res: ExtendedResponse,
	next: NextFunction,
) => {
	try {
		const versionHeader = req.headers["x-api-version"] as string;
		const org = req.org;

		let finalVersion: ApiVersionClass | undefined;

		// 1. Check header first
		if (versionHeader) {
			const parsedVersion = parseVersion({ versionStr: versionHeader });

			if (!parsedVersion) {
				throw new RecaseError({
					message: `'${versionHeader}' is not a valid API version`,
					code: ErrCode.InvalidApiVersion,
					statusCode: 400,
				});
			}

			finalVersion = new ApiVersionClass(parsedVersion);
		}
		// 2. Calculate from org creation date
		else if (org?.created_at) {
			finalVersion = createdAtToVersion({
				createdAt: org.created_at,
			});
		}

		// 3. Fallback to V0_2 if no org found
		if (!finalVersion) {
			finalVersion = new ApiVersionClass(ApiVersion.V0_2);
		}

		// console.log(`Autumn version: ${finalVersion.semver}`);

		req.apiVersion = finalVersion;

		next();
	} catch (error: any) {
		res.status(400).json({
			message: error.message,
			code: ErrCode.InvalidApiVersion,
			statusCode: 400,
		});
	}
};
