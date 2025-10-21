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

/**
 * Middleware to verify and set API version
 *
 * Resolution order:
 * 1. x-api-version header (if provided)
 * 2. Calculate from org.created_at timestamp
 * 3. Default to V0_2 if no org found
 *
 * Supports:
 * - CalVer format (YYYY-MM-DD) e.g., "2025-04-17"
 * - Legacy float format (X.X) e.g., "1.1"
 * - SemVer format (X.Y.Z) e.g., "1.1.0"
 *
 * Stores ApiVersionClass instance in ctx.apiVersion for easy access:
 * @example
 * if (ctx.apiVersion.gte(ApiVersion.V1_1)) { ... }
 */
export const apiVersionMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const ctx = c.get("ctx");
	const versionHeader = c.req.header("x-api-version");
	const org = ctx.org;

	let finalVersion: ApiVersionClass | undefined;

	// 1. Check header first
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

	// Store in context - now you can do ctx.apiVersion.gte(ApiVersion.V1_1)
	ctx.apiVersion = finalVersion;

	await next();
};
