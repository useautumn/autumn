import type { ApiVersion } from "@autumn/shared";
import type { RateLimitConfig } from "../../rateLimitConfigs";

export type RateLimitLayerSummary = {
	name: string;
	limit: number;
	versionLimits: { upTo: ApiVersion; limit: number; key: string }[];
	windowMs: number;
	store: RateLimitConfig["store"];
	overLimit: "reject" | "degrade";
	key: string;
};
