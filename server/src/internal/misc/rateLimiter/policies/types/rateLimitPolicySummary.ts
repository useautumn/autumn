import type { RateLimitLayerSummary } from "./rateLimitLayerSummary";

export type RateLimitPolicyOverride = {
	/** The org id or slug the override is stored under. */
	orgKey: string;
	perOrg?: number;
	perCustomer?: number;
};

export type RateLimitPolicySummary = {
	id: string;
	routes: string[] | "*";
	perOrg: RateLimitLayerSummary | null;
	perCustomer: RateLimitLayerSummary | null;
	/** Earlier policies whose layers count against the same counter. */
	sharesCounterWith: string[];
	overrides: RateLimitPolicyOverride[];
};
