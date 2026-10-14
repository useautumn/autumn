import {
	ApiVersion,
	ApiVersionClass,
	createdAtToVersion,
	ErrCode,
	parseVersion,
} from "@autumn/shared";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import RecaseError from "@/utils/errorUtils.js";

export const apiVersionMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const ctx = c.get("ctx");
	const versionHeader = c.req.header("x-api-version");
	const org = ctx.org;

	let finalVersion: ApiVersionClass | undefined;

	if (versionHeader) {
		const parsedVersion = parseVersion({ versionStr: versionHeader });

		if (!parsedVersion) {
			throw new RecaseError({
				message: `"${versionHeader}" is not a valid API version`,
				code: ErrCode.InvalidApiVersion,
				statusCode: 400,
			});
		}

		finalVersion = new ApiVersionClass(parsedVersion);
	} else if (org?.created_at) {
		finalVersion = createdAtToVersion({
			createdAt: org.created_at,
		});
	}

	if (!finalVersion) {
		finalVersion = new ApiVersionClass(ApiVersion.V0_2);
	}

	ctx.apiVersion = finalVersion;

	await next();
};
