import type { RateLimitLayerSummary } from "./rateLimitLayerSummary";

export type RateLimitPolicyOverride = {
	/** The org id or slug the override is stored under. */
	orgKey: string;
	perOrg?: number;
	perCustomer?: number;
};

/** One limit as the admin page shows it: a customer limit with its org cap, or an org-wide limit. */
export type RateLimitPolicySummary = {
	/** The RateLimitType, suffixed with the group's position when a type has several route groups. */
	id: string;
	type: string;
	routes: string[] | "*";
	perOrg: RateLimitLayerSummary | null;
	perCustomer: RateLimitLayerSummary | null;
	/** Earlier rows whose layers count against the same counter. */
	sharesCounterWith: string[];
	overrides: RateLimitPolicyOverride[];
};
