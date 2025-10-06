import {
	ApiVersionClass,
	ErrCode,
	InternalError,
	legacyToSemVer,
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
 * 2. org.api_version (version system 2: 1.0, 1.1, 1.2, 1.4)
 * 3. org.config.api_version (version system 1: 0.1, 0.2)
 * 4. Default to org's default version
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
	// 2. Check org.api_version (version system 2)
	else if (org?.api_version) {
		const semver = legacyToSemVer({ legacyVersion: org.api_version });
		if (semver) {
			finalVersion = new ApiVersionClass(semver);
		}
	}
	// 3. Check org.config.api_version (version system 1)
	else if (org?.config?.api_version) {
		const semver = legacyToSemVer({ legacyVersion: org.config.api_version });
		if (semver) {
			finalVersion = new ApiVersionClass(semver);
		}
	}

	// 4. Fallback to V0_2 (version 1.0 / 0.2)
	if (!finalVersion) {
		const legacyVersion = org?.api_version || org?.config?.api_version || 1.0;
		const defaultVersion = legacyToSemVer({ legacyVersion });

		if (!defaultVersion) {
			throw new InternalError({
				message: "Failed to initialize API version - this should never happen",
			});
		}

		finalVersion = new ApiVersionClass(defaultVersion);
	}

	// Store in context - now you can do ctx.apiVersion.gte(ApiVersion.V1_1)
	ctx.apiVersion = finalVersion;

	await next();
};
