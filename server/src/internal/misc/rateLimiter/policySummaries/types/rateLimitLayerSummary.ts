import type { ApiVersion } from "@autumn/shared";
import type { RateLimitConfig } from "../../rateLimitConfigs";

export type RateLimitLayerSummary = {
	/** The RateLimitType: counter name and S3 override key. */
	name: string;
	/** The limit when no `versionLimits` entry covers the request's version. */
	limit: number;
	versionLimits: { upTo: ApiVersion; limit: number; key: string }[];
	windowMs: number;
	store: RateLimitConfig["store"];
	overLimit: NonNullable<RateLimitConfig["overLimit"]>;
	/** The counter key for versions no `versionLimits` entry covers. */
	key: string;
};
