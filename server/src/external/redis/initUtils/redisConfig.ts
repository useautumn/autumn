import { DEFAULT_AWS_REGION } from "@/external/aws/awsRegionUtils.js";
import { resolvePrivateOrPublicUrl } from "@/external/aws/ecs/resolvePrivateOrPublicUrl.js";

// AWS region this instance runs in — used only as a telemetry/client label.
export const currentRegion = process.env.AWS_REGION || DEFAULT_AWS_REGION;

const trimmedEnv = (name: string): string | undefined =>
	process.env[name]?.trim() || undefined;

/** Misc main URL from MISC_CACHE_DRAGONFLY_PRIVATE_URL/_PUBLIC_URL — ECS
 *  prefers the private/VPC endpoint. Read at call time — env may be injected
 *  after import (infisical). */
export const resolveMiscMainUrl = (): string | null => {
	const privateUrl = trimmedEnv("MISC_CACHE_DRAGONFLY_PRIVATE_URL");
	const publicUrl = trimmedEnv("MISC_CACHE_DRAGONFLY_PUBLIC_URL");
	if (!privateUrl && !publicUrl) return null;

	return resolvePrivateOrPublicUrl({
		privateUrl: privateUrl ?? null,
		publicUrl: publicUrl ?? privateUrl ?? "",
	});
};

export const hasMiscRedisConfig = Boolean(resolveMiscMainUrl());
