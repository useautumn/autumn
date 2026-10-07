import type { ApiVersion } from "@autumn/shared";
import type { RateLimitLayer } from "./rateLimitLayer";

export type RateLimitLayerSummary = {
	name: string;
	/** The limit when no `versionLimits` entry covers the request's version. */
	limit: number;
	versionLimits: { upTo: ApiVersion; limit: number }[];
	windowMs: number;
	counted: NonNullable<RateLimitLayer["counted"]>;
	overLimit: NonNullable<RateLimitLayer["overLimit"]>;
	skipWithoutCustomerId: boolean;
	key: string;
};
